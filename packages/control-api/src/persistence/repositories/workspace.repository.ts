import type { Workspace, WorkspaceIsolationMode } from "../types.js";
import { mapWorkspaceRow } from "../mappers/workspace.mapper.js";
import { BaseRepository } from "./base.js";

export class PostgresWorkspaceRepository extends BaseRepository {
  async findById(id: string): Promise<Workspace | undefined> {
    const result = await this.query("SELECT * FROM workspaces WHERE id = $1", [id]);
    const row = result.rows[0];
    return row ? mapWorkspaceRow(row) : undefined;
  }

  async list(limit = 100): Promise<Workspace[]> {
    const result = await this.query(
      "SELECT * FROM workspaces ORDER BY created_at DESC LIMIT $1",
      [limit]
    );
    return result.rows.map(mapWorkspaceRow);
  }

  async create(input: {
    id: string;
    name: string;
    repoUrl: string;
    defaultBranch?: string;
    isolationMode?: WorkspaceIsolationMode;
  }): Promise<Workspace> {
    const result = await this.query(
      `INSERT INTO workspaces (id, name, repo_url, default_branch, isolation_mode)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [
        input.id,
        input.name,
        input.repoUrl,
        input.defaultBranch ?? "main",
        input.isolationMode ?? "local",
      ]
    );

    return mapWorkspaceRow(this.requiredRow(result.rows[0], "workspace"));
  }
}
