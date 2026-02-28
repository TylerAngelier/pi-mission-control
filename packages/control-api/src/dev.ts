const port = Number(process.env.MISSION_CONTROL_PORT ?? 8787);
const apiBaseUrl = process.env.MISSION_CONTROL_API_BASE_URL ?? `http://localhost:${port}`;

console.log(`[control-api] dev placeholder started on ${apiBaseUrl}`);
console.log("[control-api] waiting for control plane implementation...");

setInterval(() => {
  console.log("[control-api] heartbeat");
}, 30000);
