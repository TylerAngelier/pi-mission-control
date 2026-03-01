import type { QueryResultRow } from "pg";

import type { Workspace, WorkspaceIsolationMode } from "../types.js";

export const mapWorkspaceRow = (row: QueryResultRow): Workspace => ({
  id: row.id as string,
  name: row.name as string,
  repoUrl: row.repo_url as string,
  defaultBranch: row.default_branch as string,
  isolationMode: row.isolation_mode as WorkspaceIsolationMode,
  createdAt: row.created_at as Date,
  updatedAt: row.updated_at as Date,
});
