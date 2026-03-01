import type { QueryResultRow } from "pg";

import type { Run } from "../types.js";

export const mapRunRow = (row: QueryResultRow): Run => ({
  id: row.id as string,
  sessionId: row.session_id as string,
  status: row.status as Run["status"],
  startedAt: (row.started_at as Date).toISOString(),
  finishedAt: row.finished_at ? (row.finished_at as Date).toISOString() : null,
  errorCode: (row.error_code as string | null) ?? null,
  costUsd:
    row.cost_usd === null || row.cost_usd === undefined
      ? null
      : Number(row.cost_usd as string | number),
});
