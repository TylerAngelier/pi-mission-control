import path from "node:path";
import { fileURLToPath } from "node:url";

import { DatabaseManager } from "../persistence/database.js";
import { MigrationRunner } from "../persistence/migrations/runner.js";

const command = process.argv[2] ?? "setup";

const connectionString =
  process.env.MISSION_CONTROL_TEST_DATABASE_URL ??
  process.env.MISSION_CONTROL_DATABASE_URL ??
  "postgresql://postgres:postgres@localhost:5433/mission_control_test";

const db = new DatabaseManager({ connectionString });

const migrationsDirectory = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "persistence",
  "migrations"
);

try {
  if (command === "setup") {
    await db.query("DROP SCHEMA IF EXISTS public CASCADE");
    await db.query("CREATE SCHEMA public");
    await new MigrationRunner(db, { migrationsDirectory }).run();
    console.log("Test database setup complete");
  } else if (command === "teardown") {
    await db.query("DROP SCHEMA IF EXISTS public CASCADE");
    await db.query("CREATE SCHEMA public");
    console.log("Test database teardown complete");
  } else {
    throw new Error(`Unsupported command: ${command}`);
  }
} finally {
  await db.close();
}
