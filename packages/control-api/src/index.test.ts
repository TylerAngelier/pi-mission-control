import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import type { AddressInfo } from "node:net";
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

  it("validates request payloads and query params", async () => {
    const invalidAgent = await request(server)
      .post("/v1/agents")
      .set(authHeader)
      .send({ name: "missing-model" });

    expect(invalidAgent.status).toBe(400);
    expect(invalidAgent.body.code).toBe("invalid_request");

    const invalidStatus = await request(server)
      .get("/v1/sessions")
      .set(authHeader)
      .query({ status: "bogus" });

    expect(invalidStatus.status).toBe(400);
    expect(invalidStatus.body.code).toBe("invalid_request");

    const invalidStream = await request(server)
      .get("/v1/runs/run_does_not_exist/stream")
      .set(authHeader)
      .query({ lastSequence: -1 });

    expect(invalidStream.status).toBe(404);
    expect(invalidStream.body.code).toBe("not_found");
  });

  it("returns not found for missing resources and invalid cursors", async () => {
    const missingSession = await request(server)
      .post("/v1/sessions")
      .set(authHeader)
      .send({
        agentId: "agent_missing",
        workspaceId: "workspace_default",
      });

    expect(missingSession.status).toBe(404);

    const missingRun = await request(server)
      .post("/v1/runs/run_missing/approve")
      .set(authHeader)
      .send({
        approvalId: "apr_missing",
        actorId: "user_1",
      });

    expect(missingRun.status).toBe(404);

    const createAgent = await request(server)
      .post("/v1/agents")
      .set(authHeader)
      .send({
        name: "cursor-validator",
        model: "anthropic/claude-sonnet-4-5-20250929",
      });

    const createSession = await request(server)
      .post("/v1/sessions")
      .set(authHeader)
      .send({
        agentId: createAgent.body.id,
        workspaceId: "workspace_default",
      });

    const invalidTranscriptCursor = await request(server)
      .get(`/v1/sessions/${createSession.body.id}/transcript`)
      .set(authHeader)
      .query({ fromSequence: 0 });

    expect(invalidTranscriptCursor.status).toBe(400);

    const enqueue = await request(server)
      .post(`/v1/sessions/${createSession.body.id}/messages`)
      .set(authHeader)
      .send({ content: "cursor check" });

    const invalidReplayCursor = await request(server)
      .get(`/v1/runs/${enqueue.body.runId}/events`)
      .set(authHeader)
      .query({ fromSequence: 0 });

    expect(invalidReplayCursor.status).toBe(400);

    const invalidLastSequence = await request(server)
      .get(`/v1/runs/${enqueue.body.runId}/stream`)
      .set(authHeader)
      .query({ lastSequence: -1 });

    expect(invalidLastSequence.status).toBe(400);
  });

  it("returns conflict for duplicate approval decisions and not found for mismatched approvals", async () => {
    const createAgent = await request(server)
      .post("/v1/agents")
      .set(authHeader)
      .send({
        name: "approval-conflict",
        model: "anthropic/claude-sonnet-4-5-20250929",
      });

    const createSession = await request(server)
      .post("/v1/sessions")
      .set(authHeader)
      .send({
        agentId: createAgent.body.id,
        workspaceId: "workspace_default",
      });

    const firstRun = await request(server)
      .post(`/v1/sessions/${createSession.body.id}/messages`)
      .set(authHeader)
      .send({ content: "first" });

    const secondRun = await request(server)
      .post(`/v1/sessions/${createSession.body.id}/messages`)
      .set(authHeader)
      .send({ content: "second" });

    const firstApprove = await request(server)
      .post(`/v1/runs/${firstRun.body.runId}/approve`)
      .set(authHeader)
      .send({
        approvalId: firstRun.body.approvalId,
        actorId: "reviewer",
      });

    expect(firstApprove.status).toBe(200);

    const duplicateApprove = await request(server)
      .post(`/v1/runs/${firstRun.body.runId}/approve`)
      .set(authHeader)
      .send({
        approvalId: firstRun.body.approvalId,
        actorId: "reviewer",
      });

    expect(duplicateApprove.status).toBe(409);
    expect(duplicateApprove.body.code).toBe("conflict");

    const mismatchedApproval = await request(server)
      .post(`/v1/runs/${firstRun.body.runId}/approve`)
      .set(authHeader)
      .send({
        approvalId: secondRun.body.approvalId,
        actorId: "reviewer",
      });

    expect(mismatchedApproval.status).toBe(404);
    expect(mismatchedApproval.body.code).toBe("not_found");
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

  it("streams run events in per-run sequence order", async () => {
    const createAgent = await request(server)
      .post("/v1/agents")
      .set(authHeader)
      .send({
        name: "stream-tester",
        model: "anthropic/claude-sonnet-4-5-20250929",
      });

    const createSession = await request(server)
      .post("/v1/sessions")
      .set(authHeader)
      .send({
        agentId: createAgent.body.id,
        workspaceId: "workspace_stream",
        title: "Stream check",
      });

    const enqueue = await request(server)
      .post(`/v1/sessions/${createSession.body.id}/messages`)
      .set(authHeader)
      .send({ content: "Stream the pending events" });

    const runId = enqueue.body.runId as string;

    const response = await fetch(`${getServerBaseUrl(server)}/v1/runs/${runId}/stream`, {
      method: "GET",
      headers: {
        authorization: "Bearer test-token",
      },
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")?.includes("text/event-stream")).toBe(true);

    const reader = response.body?.getReader();
    expect(reader).toBeDefined();

    const decoder = new TextDecoder();
    let output = "";
    const timeoutAt = Date.now() + 2000;

    while (Date.now() < timeoutAt) {
      const next = await reader?.read();
      if (!next || next.done) {
        break;
      }

      output += decoder.decode(next.value, { stream: true });
      if (output.includes('"sequence":1') && output.includes('"sequence":2')) {
        break;
      }
    }

    expect(output).toContain('"sequence":1');
    expect(output).toContain('"sequence":2');
    expect(output.indexOf('"sequence":1')).toBeLessThan(output.indexOf('"sequence":2'));

    await reader?.cancel();
  });

  it("supports replay and reconnect cursor semantics for run events", async () => {
    const createAgent = await request(server)
      .post("/v1/agents")
      .set(authHeader)
      .send({
        name: "cursor-tester",
        model: "anthropic/claude-sonnet-4-5-20250929",
      });

    const createSession = await request(server)
      .post("/v1/sessions")
      .set(authHeader)
      .send({
        agentId: createAgent.body.id,
        workspaceId: "workspace_cursor",
        title: "Cursor check",
      });

    const enqueue = await request(server)
      .post(`/v1/sessions/${createSession.body.id}/messages`)
      .set(authHeader)
      .send({ content: "Queue for cursor replay" });

    const runId = enqueue.body.runId as string;

    const replay = await request(server)
      .get(`/v1/runs/${runId}/events`)
      .query({ fromSequence: 2 })
      .set(authHeader);

    expect(replay.status).toBe(200);
    expect(Array.isArray(replay.body.events)).toBe(true);
    expect(replay.body.events.length).toBe(1);
    expect(replay.body.events[0].sequence).toBe(2);
    expect(replay.body.nextSequence).toBe(3);

    const stream = await fetch(`${getServerBaseUrl(server)}/v1/runs/${runId}/stream?lastSequence=1`, {
      method: "GET",
      headers: {
        authorization: "Bearer test-token",
      },
    });

    expect(stream.status).toBe(200);

    const reader = stream.body?.getReader();
    expect(reader).toBeDefined();

    const decoder = new TextDecoder();
    const firstChunk = await reader?.read();
    const output = firstChunk?.value ? decoder.decode(firstChunk.value, { stream: true }) : "";

    expect(output).toContain('"sequence":2');
    expect(output).not.toContain('"sequence":1');

    await reader?.cancel();
  });
  it("serves UI session summary and session subscribe endpoints", async () => {
    const createAgent = await request(server)
      .post("/v1/agents")
      .set(authHeader)
      .send({
        name: "ui-session-agent",
        model: "anthropic/claude-sonnet-4-5-20250929",
      });

    const createSession = await request(server)
      .post("/v1/ui/sessions")
      .set(authHeader)
      .send({
        agentId: createAgent.body.id,
        workspaceId: "workspace_ui",
        title: "UI Session",
      });

    expect(createSession.status).toBe(201);

    const list = await request(server)
      .get("/v1/sessions/list")
      .set(authHeader)
      .query({ workspaceId: "workspace_ui" });

    expect(list.status).toBe(200);
    expect(list.body.items).toHaveLength(1);

    const uiSessions = await request(server)
      .get("/v1/ui/sessions")
      .set(authHeader);

    expect(uiSessions.status).toBe(200);
    const uiSession = (uiSessions.body.items as Array<Record<string, unknown>>).find(
      (item) => item.id === createSession.body.id
    );

    expect(uiSession).toMatchObject({
      id: createSession.body.id,
      title: "UI Session",
      status: "idle",
    });

    const response = await fetch(
      `${getServerBaseUrl(server)}/v1/sessions/${createSession.body.id}/subscribe`,
      {
        method: "GET",
        headers: {
          authorization: "Bearer test-token",
        },
      }
    );

    expect(response.status).toBe(200);

    const reader = response.body?.getReader();
    expect(reader).toBeDefined();

    const decoder = new TextDecoder();
    const firstChunk = await reader?.read();
    const output = firstChunk?.value ? decoder.decode(firstChunk.value, { stream: true }) : "";

    expect(output).toContain("session_update");
    expect(output).toContain(`"id":"${createSession.body.id}"`);

    await reader?.cancel();
  });
});

const getServerBaseUrl = (server: Server): string => {
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Expected server to listen on an ephemeral TCP port");
  }

  const { port } = address as AddressInfo;
  return `http://127.0.0.1:${port}`;
};
