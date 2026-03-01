import path from "node:path";
import { fileURLToPath } from "node:url";

import type { ControlApiStore } from "./control-api-store.js";
import {
  DatabaseManager,
  MigrationRunner,
  PostgresControlApiRepository,
  PostgresControlApiStore,
  PostgresNotifyManager,
} from "./persistence/index.js";
import { InMemoryControlApiStore } from "./store.js";

export interface StoreFactoryResult {
  store: ControlApiStore;
  close: () => Promise<void>;
}

export const createControlApiStoreFromEnv = async (): Promise<StoreFactoryResult> => {
  const mode = process.env.PERSISTENCE_MODE ?? "in-memory";

  if (mode !== "postgres") {
    return {
      store: new InMemoryControlApiStore(),
      close: async () => Promise.resolve(),
    };
  }

  const connectionString = process.env.MISSION_CONTROL_DATABASE_URL;
  if (!connectionString) {
    throw new Error("MISSION_CONTROL_DATABASE_URL is required when PERSISTENCE_MODE=postgres");
  }

  const db = new DatabaseManager({ connectionString });
  const migrationsDirectory = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    "persistence",
    "migrations"
  );

  const runner = new MigrationRunner(db, { migrationsDirectory });
  await runner.run();

  const repository = new PostgresControlApiRepository(db);
  const notifier = new PostgresNotifyManager(db);

  return {
    store: new PostgresControlApiStore(repository, notifier),
    close: async () => {
      await notifier.close();
      await db.close();
    },
  };
};
