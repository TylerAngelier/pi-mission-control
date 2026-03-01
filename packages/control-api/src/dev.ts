import { startControlApiServer } from "./index.js";

const port = Number(process.env.MISSION_CONTROL_PORT ?? 8787);
const authToken = process.env.MISSION_CONTROL_API_TOKEN ?? "dev-token";

const server = await startControlApiServer(port, { authToken });

console.log(`[control-api] listening on http://localhost:${port}`);
console.log("[control-api] protected routes require Authorization: Bearer <token>");

const shutdown = () => {
  server.close(() => {
    process.exit(0);
  });
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
