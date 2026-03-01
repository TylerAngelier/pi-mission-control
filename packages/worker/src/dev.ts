const concurrency = Number(process.env.MISSION_CONTROL_WORKER_CONCURRENCY ?? 2);
const queueUrl = process.env.MISSION_CONTROL_QUEUE_URL ?? "redis://localhost:6379";

console.log(`[worker] dev placeholder started (concurrency=${concurrency})`);
console.log(`[worker] queue endpoint: ${queueUrl}`);
console.log("[worker] SDK/RPC execution engine scaffold is available.");

setInterval(() => {
  console.log("[worker] heartbeat");
}, 30000);
