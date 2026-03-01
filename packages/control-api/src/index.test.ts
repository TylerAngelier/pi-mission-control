import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import type { Server } from "node:http";

import { health, startControlApiServer } from "./index.js";

const authHeader = { Authorization: "Bearer test-token" };

describe("control-api health", () => {
  it("returns ok status", () => {
    expect(health()).toEqual({ service: "control-api", status: "ok" });
  });
});

describe("control-api routes", () => {
  let server: Server;

  beforeAll(async () => {
    server = await startControlApiServer(0, { authToken: "test-token" });
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  });

  it("rejects unauthorized protected route calls", async () => {
    const response = await request(server).get("/v1/agents");

    expect(response.status).toBe(401);
    expect(response.body.code).toBe("unauthorized");
  });

  it("creates agent and session, then enqueues a message and approves run", async () => {
    const createAgent = await request(server)
      .post("/v1/agents")
      .set(authHeader)
      .send({
        name: "backend-maintainer",
        model: "anthropic/claude-sonnet-4-5-20250929",
      });

    expect(createAgent.status).toBe(201);

    const createSession = await request(server)
      .post("/v1/sessions")
      .set(authHeader)
      .send({
        agentId: createAgent.body.id,
        workspaceId: "workspace_default",
        title: "First run",
      });

    expect(createSession.status).toBe(201);

    const enqueue = await request(server)
      .post(`/v1/sessions/${createSession.body.id}/messages`)
      .set(authHeader)
      .send({ content: "Inspect repository status" });

    expect(enqueue.status).toBe(202);
    expect(enqueue.body.status).toBe("waiting_approval");
    expect(typeof enqueue.body.runId).toBe("string");
    expect(typeof enqueue.body.approvalId).toBe("string");

    const approve = await request(server)
      .post(`/v1/runs/${enqueue.body.runId}/approve`)
      .set(authHeader)
      .send({
        approvalId: enqueue.body.approvalId,
        actorId: "user_123",
        reason: "Looks safe",
      });

    expect(approve.status).toBe(200);
    expect(approve.body.state).toBe("approved");

    const run = await request(server)
      .get(`/v1/runs/${enqueue.body.runId}`)
      .set(authHeader);

    expect(run.status).toBe(200);
    expect(run.body.status).toBe("completed");

    const transcript = await request(server)
      .get(`/v1/sessions/${createSession.body.id}/transcript`)
      .set(authHeader);

    expect(transcript.status).toBe(200);
    expect(Array.isArray(transcript.body.events)).toBe(true);
    expect(transcript.body.events.length).toBeGreaterThanOrEqual(3);
  });
});
