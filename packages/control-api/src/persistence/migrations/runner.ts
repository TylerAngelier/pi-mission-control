import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import type { QueryResultRow } from "pg";

import { DatabaseManager } from "../database.js";

export interface MigrationRunnerOptions {
  migrationsDirectory: string;
}

export class MigrationRunner {
  constructor(
    private readonly db: DatabaseManager,
    private readonly options: MigrationRunnerOptions
  ) {}

  async run(): Promise<string[]> {
    await this.ensureMigrationsTable();

    const files = (await readdir(this.options.migrationsDirectory))
      .filter((file) => file.endsWith(".sql"))
      .sort();

    const applied = await this.db.query<{ id: string }>(
      "SELECT id FROM schema_migrations ORDER BY id"
    );

    const appliedIds = new Set(applied.rows.map((row) => row.id));
    const executed: string[] = [];

    for (const file of files) {
      const id = file.replace(/\.sql$/, "");
      if (appliedIds.has(id)) {
        continue;
      }

      const sql = await readFile(path.join(this.options.migrationsDirectory, file), "utf8");

      await this.db.withTransaction(async (client) => {
        await client.query(sql);
        await client.query(
          "INSERT INTO schema_migrations (id, filename) VALUES ($1, $2)",
          [id, file]
        );
      });

      executed.push(file);
    }

    return executed;
  }

  async status(): Promise<Array<{ id: string; filename: string; appliedAt: Date }>> {
    await this.ensureMigrationsTable();
    const result = await this.db.query<
      QueryResultRow & { id: string; filename: string; applied_at: Date }
    >("SELECT id, filename, applied_at FROM schema_migrations ORDER BY id");

    return result.rows.map((row) => ({
      id: row.id,
      filename: row.filename,
      appliedAt: row.applied_at,
    }));
  }

  async rollback(steps: number = 1): Promise<void> {
    if (steps < 1) {
      throw new Error("steps must be >= 1");
    }

    await this.ensureMigrationsTable();

    const applied = await this.db.query<{ id: string }>(
      "SELECT id FROM schema_migrations ORDER BY id DESC LIMIT $1",
      [steps]
    );

    if (applied.rows.length === 0) {
      return;
    }

    await this.db.withTransaction(async (client) => {
      for (const row of applied.rows) {
        await client.query("DELETE FROM schema_migrations WHERE id = $1", [row.id]);
      }
    });
  }

  private async ensureMigrationsTable(): Promise<void> {
    await this.db.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id TEXT PRIMARY KEY,
        filename TEXT NOT NULL,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
  }
}
