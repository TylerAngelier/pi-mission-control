import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PostgresApprovalController } from "./approval.js";

const connectionString = process.env.MISSION_CONTROL_TEST_DATABASE_URL;
const runIntegration = Boolean(connectionString);

describe.skipIf(!runIntegration)("PostgresApprovalController integration", () => {
  let pool: Pool;

  beforeAll(async () => {
    pool = new Pool({ connectionString });

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
  });

  afterAll(async () => {
    await pool.end();
  });

  it("waits for and resolves approval decisions", async () => {
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
