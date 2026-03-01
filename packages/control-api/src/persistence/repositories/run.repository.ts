import type { Run } from "../types.js";
import type { Transaction } from "../repository.js";
import { mapRunRow } from "../mappers/run.mapper.js";
import { BaseRepository } from "./base.js";

export class PostgresRunRepository extends BaseRepository {
  async findById(id: string): Promise<Run | undefined> {
    const result = await this.query("SELECT * FROM runs WHERE id = $1", [id]);
    const row = result.rows[0];
    return row ? mapRunRow(row) : undefined;
  }

  async create(input: { id: string; sessionId: string; status: Run["status"] }, tx?: Transaction): Promise<Run> {
    const result = await this.query(
      `INSERT INTO runs (id, session_id, status) VALUES ($1, $2, $3) RETURNING *`,
      [input.id, input.sessionId, input.status],
      tx
    );

    return mapRunRow(this.requiredRow(result.rows[0], "run"));
  }

  async findOrphaned(timeoutMinutes: number): Promise<Run[]> {
    const result = await this.query(
      `SELECT * FROM runs
       WHERE status IN ('running', 'waiting_approval')
         AND started_at < NOW() - ($1::text || ' minutes')::interval
       ORDER BY started_at ASC`,
      [timeoutMinutes]
    );

    return result.rows.map(mapRunRow);
  }
}
