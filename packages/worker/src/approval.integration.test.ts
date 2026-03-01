import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PostgresApprovalController } from "./approval.js";

const connectionString = process.env.MISSION_CONTROL_TEST_DATABASE_URL;
const runIntegration = Boolean(connectionString);

describe.skipIf(!runIntegration)("PostgresApprovalController integration", () => {
  let pool: Pool;
  let usesControlApiSchema = false;

  beforeAll(async () => {
    pool = new Pool({ connectionString });

    const runsTable = await pool.query<{ table_name: string | null }>(
      `SELECT to_regclass('public.runs')::text AS table_name`
    );

    usesControlApiSchema = Boolean(runsTable.rows[0]?.table_name);

    if (usesControlApiSchema) {
      await pool.query(
        `INSERT INTO users (id, email, display_name)
         VALUES ('user_int_1', 'user_int_1@example.com', 'Integration User')
         ON CONFLICT (id) DO NOTHING`
      );

      await pool.query(
        `INSERT INTO workspaces (id, name, repo_url)
         VALUES ('workspace_int_1', 'Integration Workspace', 'https://example.com/repo.git')
         ON CONFLICT (id) DO NOTHING`
      );

      await pool.query(
        `INSERT INTO agents (id, name, model)
         VALUES ('agent_int_1', 'Integration Agent', 'anthropic/claude-sonnet-4-5-20250929')
         ON CONFLICT (id) DO NOTHING`
      );

      await pool.query(
        `INSERT INTO sessions (id, agent_id, workspace_id, status, title, created_by)
         VALUES ('sess_int_1', 'agent_int_1', 'workspace_int_1', 'running', 'Integration Session', 'user_int_1')
         ON CONFLICT (id) DO NOTHING`
      );

      await pool.query(
        `INSERT INTO runs (id, session_id, status)
         VALUES ('run_int_1', 'sess_int_1', 'waiting_approval')
         ON CONFLICT (id) DO NOTHING`
      );
    } else {
      await pool.query(`
        DROP TABLE IF EXISTS approvals;
        CREATE TABLE approvals (
          id TEXT PRIMARY KEY,
          run_id TEXT NOT NULL,
          state TEXT NOT NULL,
          actor_id TEXT,
          reason TEXT,
          decided_at TIMESTAMPTZ
        );
      `);
    }
  });

  afterAll(async () => {
    await pool.end();
  });

  it("waits for and resolves approval decisions", async () => {
    await pool.query(`DELETE FROM approvals WHERE id = $1`, ["apr_int_1"]);

    await pool.query(
      `INSERT INTO approvals (id, run_id, state) VALUES ($1, $2, 'pending')`,
      ["apr_int_1", "run_int_1"]
    );

    const controller = new PostgresApprovalController({
      connectionString: connectionString as string,
      pollIntervalMs: 20,
    });

    const pendingDecision = controller.waitForDecision({
      runId: "run_int_1",
      approvalId: "apr_int_1",
      timeoutMs: 1000,
    });

    setTimeout(() => {
      void controller.approve({
        runId: "run_int_1",
        approvalId: "apr_int_1",
        actorId: "reviewer",
      });
    }, 50);

    const decision = await pendingDecision;

    expect(decision.state).toBe("approved");
    expect(decision.actorId).toBe("reviewer");

    await controller.close();
  });
});
