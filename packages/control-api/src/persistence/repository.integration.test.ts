import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { DatabaseManager } from "./database.js";
import { MigrationRunner } from "./migrations/runner.js";
import { PostgresAgentRepository } from "./repositories/agent.repository.js";
import { PostgresApprovalRepository } from "./repositories/approval.repository.js";
import { PostgresIdempotencyRepository } from "./repositories/idempotency.repository.js";
import { PostgresRunEventRepository } from "./repositories/run-event.repository.js";
import { PostgresRunRepository } from "./repositories/run.repository.js";
import { PostgresSessionRepository } from "./repositories/session.repository.js";
import { PostgresTranscriptEventRepository } from "./repositories/transcript-event.repository.js";
import { PostgresUserRepository } from "./repositories/user.repository.js";
import { PostgresWorkspaceRepository } from "./repositories/workspace.repository.js";

const databaseUrl = process.env.MISSION_CONTROL_TEST_DATABASE_URL;
const runIntegration = Boolean(databaseUrl);

describe.skipIf(!runIntegration)("postgres repository integrations", () => {
  let db: DatabaseManager;

  beforeAll(async () => {
    db = new DatabaseManager({ connectionString: databaseUrl });
    await db.query("DROP SCHEMA public CASCADE");
    await db.query("CREATE SCHEMA public");

    const migrationsDirectory = path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      "migrations"
    );

    await new MigrationRunner(db, { migrationsDirectory }).run();
  });

  afterAll(async () => {
    await db.close();
  });

  it("supports CRUD and event replay operations across repositories", async () => {
    const userRepository = new PostgresUserRepository(db);
    const workspaceRepository = new PostgresWorkspaceRepository(db);
    const agentRepository = new PostgresAgentRepository(db);
    const sessionRepository = new PostgresSessionRepository(db);
    const runRepository = new PostgresRunRepository(db);
    const approvalRepository = new PostgresApprovalRepository(db);
    const transcriptRepository = new PostgresTranscriptEventRepository(db);
    const runEventRepository = new PostgresRunEventRepository(db);
    const idempotencyRepository = new PostgresIdempotencyRepository(db);

    const user = await userRepository.create({
      id: "user_repo_1",
      email: "repo1@example.com",
      displayName: "Repo User",
    });

    const workspace = await workspaceRepository.create({
      id: "workspace_repo_1",
      name: "Repo Workspace",
      repoUrl: "https://example.com/repo.git",
    });

    const agent = await agentRepository.create({
      id: "agent_repo_1",
      name: "Repo Agent",
      model: "anthropic/claude-sonnet-4-5-20250929",
      defaultTools: ["read", "bash", "edit", "write"],
      policyId: "policy_default",
    });

    const session = await sessionRepository.create({
      id: "sess_repo_1",
      agentId: agent.id,
      workspaceId: workspace.id,
      title: "Repo Session",
      createdBy: user.id,
    });

    const run = await runRepository.create({
      id: "run_repo_1",
      sessionId: session.id,
      status: "waiting_approval",
    });

    await approvalRepository.decide(
      {
        approvalId: (
          await db.query(
            `INSERT INTO approvals (id, run_id, state) VALUES ('apr_repo_1', $1, 'pending') RETURNING id`,
            [run.id]
          )
        ).rows[0]?.id as string,
        state: "approved",
        actorId: "reviewer_repo",
        decidedAt: new Date(),
      }
    );

    await transcriptRepository.createBatch([
      {
        sessionId: session.id,
        runId: run.id,
        type: "message_queued",
        payload: { content: "hello" },
      },
      {
        sessionId: session.id,
        runId: run.id,
        type: "run_completed",
        payload: { ok: true },
      },
    ]);

    await runEventRepository.createBatch([
      {
        runId: run.id,
        sessionId: session.id,
        type: "message_queued",
        payload: { content: "hello" },
      },
      {
        runId: run.id,
        sessionId: session.id,
        type: "run_completed",
        payload: { ok: true },
      },
    ]);

    await idempotencyRepository.put({ key: "idem_repo", runId: run.id, approvalId: "apr_repo_1" });

    const replay = await runEventRepository.list(run.id, 0);
    expect(replay).toHaveLength(2);

    const transcriptReplay = await transcriptRepository.list(session.id, 1);
    expect(transcriptReplay).toHaveLength(2);

    const storedIdempotency = await idempotencyRepository.findByKey("idem_repo");
    expect(storedIdempotency?.runId).toBe(run.id);

    const orphaned = await runRepository.findOrphaned(0);
    expect(orphaned.find((candidate) => candidate.id === run.id)).toBeDefined();
  });
});
