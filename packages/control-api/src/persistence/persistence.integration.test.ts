import path from "node:path";
import { fileURLToPath } from "node:url";

import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createControlApiApp } from "../app.js";
import { DatabaseManager } from "./database.js";
import { MigrationRunner } from "./migrations/runner.js";
import { PostgresNotifyManager } from "./notify.js";
import { PostgresControlApiStore } from "./control-api-store.js";
import { PostgresControlApiRepository } from "./repositories/control-api.repository.js";
import { seedPersistenceData, withRollbackTransaction } from "./test-utils.js";

const databaseUrl = process.env.MISSION_CONTROL_TEST_DATABASE_URL;
const runIntegration = Boolean(databaseUrl);

describe.skipIf(!runIntegration)("postgres persistence integration", () => {
  const authHeader = { Authorization: "Bearer test-token" };

  let db: DatabaseManager;
  let notifier: PostgresNotifyManager;
  let app: ReturnType<typeof createControlApiApp>;

  beforeAll(async () => {
    db = new DatabaseManager({ connectionString: databaseUrl });

    await db.query("DROP SCHEMA public CASCADE");
    await db.query("CREATE SCHEMA public");

    const migrationsDirectory = path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      "migrations"
    );

    await new MigrationRunner(db, { migrationsDirectory }).run();

    notifier = new PostgresNotifyManager(db);
    const repository = new PostgresControlApiRepository(db);
    const store = new PostgresControlApiStore(repository, notifier);
    app = createControlApiApp({ authToken: "test-token", store });
  });

  afterAll(async () => {
    await notifier.close();
    await db.close();
  });

  it("supports rollback-isolated test transactions", async () => {
    await withRollbackTransaction(db, async (client) => {
      await client.query(
        `INSERT INTO users (id, email, display_name) VALUES ($1, $2, $3)`,
        ["user_tx", "user_tx@example.com", "Rollback User"]
      );

      const rows = await client.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM users WHERE id = 'user_tx'`
      );

      expect(Number(rows.rows[0]?.count ?? "0")).toBe(1);
    });

    const persisted = await db.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM users WHERE id = 'user_tx'`
    );

    expect(Number(persisted.rows[0]?.count ?? "0")).toBe(0);
  });

  it("publishes and receives postgres notifications", async () => {
    const received: string[] = [];

    const unsubscribe = await notifier.subscribe("integration_test_channel", (payload) => {
      received.push(payload);
    });

    await notifier.publish("integration_test_channel", JSON.stringify({ ok: true }));

    await new Promise((resolve) => setTimeout(resolve, 25));

    await unsubscribe();
    expect(received).toContain('{"ok":true}');
  });

  it("persists entities, idempotency keys, replay, and transcript data", async () => {
    const { agentId, workspaceId } = await seedPersistenceData(db);

    const createSession = await request(app)
      .post("/v1/sessions")
      .set(authHeader)
      .send({
        agentId,
        workspaceId,
        title: "Postgres Session",
      });

    expect(createSession.status).toBe(201);

    const firstMessage = await request(app)
      .post(`/v1/sessions/${createSession.body.id}/messages`)
      .set(authHeader)
      .send({
        content: "same operation",
        idempotencyKey: "idem_1",
      });

    expect(firstMessage.status).toBe(202);

    const duplicateMessage = await request(app)
      .post(`/v1/sessions/${createSession.body.id}/messages`)
      .set(authHeader)
      .send({
        content: "same operation",
        idempotencyKey: "idem_1",
      });

    expect(duplicateMessage.status).toBe(202);
    expect(duplicateMessage.body.runId).toBe(firstMessage.body.runId);
    expect(duplicateMessage.body.approvalId).toBe(firstMessage.body.approvalId);

    const replay = await request(app)
      .get(`/v1/runs/${firstMessage.body.runId}/events`)
      .set(authHeader)
      .query({ fromSequence: 1 });

    expect(replay.status).toBe(200);
    expect(replay.body.events).toHaveLength(2);
    expect(replay.body.events[0].sequence).toBe(1);

    const transcript = await request(app)
      .get(`/v1/sessions/${createSession.body.id}/transcript`)
      .set(authHeader);

    expect(transcript.status).toBe(200);
    expect(transcript.body.events.length).toBeGreaterThanOrEqual(2);

    const approve = await request(app)
      .post(`/v1/runs/${firstMessage.body.runId}/approve`)
      .set(authHeader)
      .send({
        approvalId: firstMessage.body.approvalId,
        actorId: "reviewer_pg",
      });

    expect(approve.status).toBe(200);
    expect(approve.body.state).toBe("approved");
  });
});
