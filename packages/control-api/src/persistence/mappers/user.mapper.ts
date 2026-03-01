import type { QueryResultRow } from "pg";

import type { User } from "../types.js";

export const mapUserRow = (row: QueryResultRow): User => ({
  id: row.id as string,
  email: row.email as string,
  displayName: (row.display_name as string | null) ?? null,
  createdAt: (row.created_at as Date),
  updatedAt: (row.updated_at as Date),
});
