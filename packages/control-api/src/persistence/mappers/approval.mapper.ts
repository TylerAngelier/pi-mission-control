import type { QueryResultRow } from "pg";

import type { Approval } from "../types.js";

export const mapApprovalRow = (row: QueryResultRow): Approval => ({
  id: row.id as string,
  runId: row.run_id as string,
  state: row.state as Approval["state"],
  createdAt: (row.created_at as Date).toISOString(),
  decidedAt: row.decided_at ? (row.decided_at as Date).toISOString() : null,
  actorId: (row.actor_id as string | null) ?? null,
  reason: (row.reason as string | null) ?? null,
});
