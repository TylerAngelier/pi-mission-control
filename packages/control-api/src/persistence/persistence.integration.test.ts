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
    const createAgent = await request(app)
      .post("/v1/agents")
      .set(authHeader)
      .send({
        name: "postgres-agent",
        model: "anthropic/claude-sonnet-4-5-20250929",
      });

    expect(createAgent.status).toBe(201);

    const createSession = await request(app)
      .post("/v1/sessions")
      .set(authHeader)
      .send({
        agentId: createAgent.body.id,
        workspaceId: "workspace_pg",
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
