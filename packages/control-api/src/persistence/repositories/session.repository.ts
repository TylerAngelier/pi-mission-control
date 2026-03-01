import type { Session, SessionStatus } from "../types.js";
import type { Transaction } from "../repository.js";
import { mapSessionRow } from "../mappers/session.mapper.js";
import { BaseRepository } from "./base.js";

export class PostgresSessionRepository extends BaseRepository {
  async findById(id: string): Promise<Session | undefined> {
    const result = await this.query("SELECT * FROM sessions WHERE id = $1", [id]);
    const row = result.rows[0];
    return row ? mapSessionRow(row) : undefined;
  }

  async list(status?: SessionStatus): Promise<Session[]> {
    const result = status
      ? await this.query("SELECT * FROM sessions WHERE status = $1 ORDER BY updated_at DESC", [status])
      : await this.query("SELECT * FROM sessions ORDER BY updated_at DESC");

    return result.rows.map(mapSessionRow);
  }

  async create(
    input: {
      id: string;
      agentId: string;
      workspaceId: string;
      title: string;
      createdBy: string;
    },
    tx?: Transaction
  ): Promise<Session> {
    const result = await this.query(
      `INSERT INTO sessions (id, agent_id, workspace_id, status, title, created_by)
       VALUES ($1, $2, $3, 'idle', $4, $5)
       RETURNING *`,
      [input.id, input.agentId, input.workspaceId, input.title, input.createdBy],
      tx
    );

    return mapSessionRow(this.requiredRow(result.rows[0], "session"));
  }
}
