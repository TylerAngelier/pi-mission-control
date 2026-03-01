import path from "node:path";
import { fileURLToPath } from "node:url";

import { DatabaseManager } from "../persistence/database.js";
import { MigrationRunner } from "../persistence/migrations/runner.js";

const command = process.argv[2] ?? "run";

const connectionString =
  process.env.MISSION_CONTROL_DATABASE_URL ??
  "postgresql://postgres:postgres@localhost:5432/mission_control";

const db = new DatabaseManager({ connectionString });
const migrationsDirectory = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "persistence",
  "migrations"
);
const runner = new MigrationRunner(db, { migrationsDirectory });

try {
  if (command === "run") {
    const executed = await runner.run();
    console.log(
      executed.length === 0
        ? "No pending migrations"
        : `Applied migrations: ${executed.join(", ")}`
    );
  } else if (command === "status") {
    const status = await runner.status();
    console.log(JSON.stringify(status, null, 2));
  } else if (command === "rollback") {
    const steps = Number(process.argv[3] ?? "1");
    await runner.rollback(steps);
    console.log(`Rolled back ${steps} migration record(s)`);
  } else {
    throw new Error(`Unsupported migration command: ${command}`);
  }
} finally {
  await db.close();
}
