import type { QueryResultRow } from "pg";

import type { Session, SessionStatus } from "../types.js";

export const mapSessionRow = (row: QueryResultRow): Session => ({
  id: row.id as string,
  agentId: row.agent_id as string,
  workspaceId: row.workspace_id as string,
  status: row.status as SessionStatus,
  title: row.title as string,
  createdBy: row.created_by as string,
  createdAt: (row.created_at as Date).toISOString(),
  updatedAt: (row.updated_at as Date).toISOString(),
});
