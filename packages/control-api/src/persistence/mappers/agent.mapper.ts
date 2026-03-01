import type { QueryResultRow } from "pg";

import type { Agent } from "../types.js";

export const mapAgentRow = (row: QueryResultRow): Agent => ({
  id: row.id as string,
  name: row.name as string,
  model: row.model as string,
  defaultTools: row.default_tools as string[],
  policyId: row.policy_id as string,
  createdAt: (row.created_at as Date).toISOString(),
  updatedAt: (row.updated_at as Date).toISOString(),
});
