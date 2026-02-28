const concurrency = Number(process.env.MISSION_CONTROL_WORKER_CONCURRENCY ?? 2);
const queueUrl = process.env.MISSION_CONTROL_QUEUE_URL ?? "redis://localhost:6379";

console.log(`[worker] dev placeholder started (concurrency=${concurrency})`);
console.log(`[worker] queue endpoint: ${queueUrl}`);
console.log("[worker] waiting for worker runtime implementation...");

setInterval(() => {
  console.log("[worker] heartbeat");
}, 30000);
