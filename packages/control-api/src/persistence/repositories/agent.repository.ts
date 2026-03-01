import type { Agent } from "../types.js";
import { mapAgentRow } from "../mappers/agent.mapper.js";
import { BaseRepository } from "./base.js";

export class PostgresAgentRepository extends BaseRepository {
  async findById(id: string): Promise<Agent | undefined> {
    const result = await this.query("SELECT * FROM agents WHERE id = $1", [id]);
    const row = result.rows[0];
    return row ? mapAgentRow(row) : undefined;
  }

  async list(limit = 100): Promise<Agent[]> {
    const result = await this.query("SELECT * FROM agents ORDER BY created_at DESC LIMIT $1", [limit]);
    return result.rows.map(mapAgentRow);
  }

  async create(input: {
    id: string;
    name: string;
    model: string;
    defaultTools: string[];
    policyId: string;
  }): Promise<Agent> {
    const result = await this.query(
      `INSERT INTO agents (id, name, model, default_tools, policy_id)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [input.id, input.name, input.model, input.defaultTools, input.policyId]
    );

    return mapAgentRow(this.requiredRow(result.rows[0], "agent"));
  }
}
