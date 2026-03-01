import type { Approval } from "../types.js";
import type { Transaction } from "../repository.js";
import { mapApprovalRow } from "../mappers/approval.mapper.js";
import { BaseRepository } from "./base.js";

export class PostgresApprovalRepository extends BaseRepository {
  async findById(id: string): Promise<Approval | undefined> {
    const result = await this.query("SELECT * FROM approvals WHERE id = $1", [id]);
    const row = result.rows[0];
    return row ? mapApprovalRow(row) : undefined;
  }

  async findPendingByRunId(runId: string): Promise<Approval | undefined> {
    const result = await this.query(
      "SELECT * FROM approvals WHERE run_id = $1 AND state = 'pending' ORDER BY created_at DESC LIMIT 1",
      [runId]
    );
    const row = result.rows[0];
    return row ? mapApprovalRow(row) : undefined;
  }

  async findExpired(): Promise<Approval[]> {
    const result = await this.query(
      `SELECT * FROM approvals
       WHERE state = 'pending'
         AND decided_at IS NULL
         AND created_at < NOW() - INTERVAL '5 minutes'`
    );
    return result.rows.map(mapApprovalRow);
  }

  async decide(
    input: {
      approvalId: string;
      state: "approved" | "rejected";
      actorId: string;
      reason?: string;
      decidedAt: Date;
    },
    tx?: Transaction
  ): Promise<Approval> {
    const result = await this.query(
      `UPDATE approvals
       SET state = $2, actor_id = $3, reason = $4, decided_at = $5
       WHERE id = $1
       RETURNING *`,
      [input.approvalId, input.state, input.actorId, input.reason ?? null, input.decidedAt],
      tx
    );

    return mapApprovalRow(this.requiredRow(result.rows[0], "approval"));
  }
}
