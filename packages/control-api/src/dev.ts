import { startControlApiServer } from "./index.js";
import { createControlApiStoreFromEnv } from "./store-factory.js";

const port = Number(process.env.MISSION_CONTROL_PORT ?? 8787);
const authToken = process.env.MISSION_CONTROL_API_TOKEN ?? "dev-token";

const { store, close } = await createControlApiStoreFromEnv();
const server = await startControlApiServer(port, { authToken, store });

console.log(`[control-api] listening on http://localhost:${port}`);
console.log("[control-api] protected routes require Authorization: Bearer <token>");
console.log(`[control-api] persistence mode: ${process.env.PERSISTENCE_MODE ?? "in-memory"}`);

const shutdown = () => {
  server.close(async () => {
    await close();
    process.exit(0);
  });
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
