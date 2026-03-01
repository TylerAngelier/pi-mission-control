import path from "node:path";
import { fileURLToPath } from "node:url";

import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  InMemoryApprovalController,
  WorkerExecutionEngine,
  type WorkerRuntimeEvent,
} from "@pi-mission-control/worker";
import { createControlApiApp } from "./app.js";
import { DatabaseManager } from "./persistence/database.js";
import { MigrationRunner } from "./persistence/migrations/runner.js";
import { PostgresNotifyManager } from "./persistence/notify.js";
import { PostgresControlApiStore } from "./persistence/control-api-store.js";
import { PostgresControlApiRepository } from "./persistence/repositories/control-api.repository.js";

const databaseUrl = process.env.MISSION_CONTROL_TEST_DATABASE_URL;
const runIntegration = Boolean(databaseUrl);

const authHeader = { Authorization: "Bearer test-token" };

describe.skipIf(!runIntegration)("control-api + worker flow (postgres)", () => {
  let db: DatabaseManager;
  let notifyManager: PostgresNotifyManager;
  let app: ReturnType<typeof createControlApiApp>;

  beforeAll(async () => {
    db = new DatabaseManager({ connectionString: databaseUrl });
    await db.query("DROP SCHEMA public CASCADE");
    await db.query("CREATE SCHEMA public");

    const migrationsDirectory = path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      "persistence",
      "migrations"
    );

    await new MigrationRunner(db, { migrationsDirectory }).run();

    await db.query(
      `INSERT INTO users (id, email, display_name) VALUES ('user_1', 'user_1@example.com', 'User One')`
    );
    await db.query(
      `INSERT INTO workspaces (id, name, repo_url, default_branch, isolation_mode)
       VALUES ('workspace_1', 'Workspace 1', 'https://example.com/repo.git', 'main', 'local')`
    );

    notifyManager = new PostgresNotifyManager(db);
    const repository = new PostgresControlApiRepository(db);
    const store = new PostgresControlApiStore(repository, notifyManager);
    app = createControlApiApp({ authToken: "test-token", store });
  });

  afterAll(async () => {
    await notifyManager.close();
    await db.close();
  });

  it("runs enqueue -> approve -> worker complete with durable events", async () => {
    const createAgent = await request(app).post("/v1/agents").set(authHeader).send({
      name: "worker-flow-agent",
      model: "anthropic/claude-sonnet-4-5-20250929",
    });

    const createSession = await request(app).post("/v1/sessions").set(authHeader).send({
      agentId: createAgent.body.id,
      workspaceId: "workspace_1",
      createdBy: "user_1",
    });

    const enqueue = await request(app)
      .post(`/v1/sessions/${createSession.body.id}/messages`)
      .set(authHeader)
      .send({ content: "run integration flow" });

    const runId = enqueue.body.runId as string;
    const approvalId = enqueue.body.approvalId as string;

    const runtimeEvents: WorkerRuntimeEvent[] = [
      { type: "run_status", status: "running" },
      {
        type: "approval_required",
        approvalId,
        toolName: "bash",
        riskLevel: "high",
        timeoutMs: 1000,
      },
      { type: "assistant_text_delta", delta: "approval granted" },
      { type: "run_completed" },
    ];

    const runtime = {
      async *streamRun() {
        for (const event of runtimeEvents) {
          yield event;
        }
      },
    };

    const approvalController = new InMemoryApprovalController();
    const engine = new WorkerExecutionEngine(runtime);

    const executionPromise = engine.executeRun(
      {
        sessionId: createSession.body.id,
        runId,
        agentId: createAgent.body.id,
        prompt: "run integration flow",
      },
      { approvalController }
    );

    await request(app).post(`/v1/runs/${runId}/approve`).set(authHeader).send({
      approvalId,
      actorId: "reviewer_e2e",
      reason: "safe to proceed",
    });

    approvalController.approve({
      runId,
      approvalId,
      actorId: "reviewer_e2e",
      reason: "safe to proceed",
    });

    const execution = await executionPromise;
    expect(execution.events.at(-1)?.event.type).toBe("run_completed");

    const replay = await request(app)
      .get(`/v1/runs/${runId}/events`)
      .set(authHeader)
      .query({ fromSequence: 1 });

    expect(replay.status).toBe(200);
    expect(replay.body.events.length).toBeGreaterThanOrEqual(2);

    const run = await request(app).get(`/v1/runs/${runId}`).set(authHeader);
    expect(run.status).toBe(200);
    expect(run.body.status).toBe("completed");
  });
});
