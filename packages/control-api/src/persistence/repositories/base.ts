import type { QueryResultRow } from "pg";

import { DatabaseManager } from "../database.js";
import type { Transaction } from "../repository.js";

export class BaseRepository {
  constructor(protected readonly db: DatabaseManager) {}

  protected async query(
    sql: string,
    params: unknown[] = [],
    tx?: Transaction
  ): Promise<{ rows: QueryResultRow[] }> {
    if (tx) {
      return tx.query(sql, params);
    }

    const result = await this.db.query(sql, params);
    return { rows: result.rows };
  }

  protected requiredRow(row: QueryResultRow | undefined, entity: string): QueryResultRow {
    if (!row) {
      throw new Error(`Expected ${entity} row to exist`);
    }

    return row;
  }
}
