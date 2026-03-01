import type { User } from "../types.js";
import { mapUserRow } from "../mappers/user.mapper.js";
import { BaseRepository } from "./base.js";

export class PostgresUserRepository extends BaseRepository {
  async findById(id: string): Promise<User | undefined> {
    const result = await this.query("SELECT * FROM users WHERE id = $1", [id]);
    const row = result.rows[0];
    return row ? mapUserRow(row) : undefined;
  }

  async list(limit = 100): Promise<User[]> {
    const result = await this.query("SELECT * FROM users ORDER BY created_at DESC LIMIT $1", [limit]);
    return result.rows.map(mapUserRow);
  }

  async create(input: { id: string; email: string; displayName?: string }): Promise<User> {
    const result = await this.query(
      `INSERT INTO users (id, email, display_name) VALUES ($1, $2, $3) RETURNING *`,
      [input.id, input.email, input.displayName ?? null]
    );

    return mapUserRow(this.requiredRow(result.rows[0], "user"));
  }
}
