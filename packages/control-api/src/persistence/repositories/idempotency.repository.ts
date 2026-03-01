import type { Transaction } from "../repository.js";
import type { IdempotencyKeyRecord } from "../types.js";
import { BaseRepository } from "./base.js";

export class PostgresIdempotencyRepository extends BaseRepository {
  async put(
    input: { key: string; runId: string; approvalId: string },
    tx?: Transaction
  ): Promise<void> {
    await this.query(
      `INSERT INTO idempotency_keys (key, run_id, approval_id)
       VALUES ($1, $2, $3)
       ON CONFLICT (key) DO UPDATE
       SET run_id = EXCLUDED.run_id,
           approval_id = EXCLUDED.approval_id`,
      [input.key, input.runId, input.approvalId],
      tx
    );
  }

  async findByKey(key: string): Promise<IdempotencyKeyRecord | undefined> {
    const result = await this.query(
      `SELECT key, run_id, approval_id, created_at
       FROM idempotency_keys
       WHERE key = $1 AND expires_at > NOW()`,
      [key]
    );

    const row = result.rows[0];
    if (!row) {
      return undefined;
    }

    return {
      key: row.key as string,
      runId: row.run_id as string,
      approvalId: row.approval_id as string,
      createdAt: row.created_at as Date,
    };
  }
}
