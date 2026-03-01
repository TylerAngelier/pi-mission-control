import type { Server } from "node:http";

import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  InMemoryApprovalController,
  WorkerExecutionEngine,
  type WorkerRuntimeEvent,
} from "@pi-mission-control/worker";
import { startControlApiServer } from "./index.js";

const authHeader = { Authorization: "Bearer test-token" };

describe("control-api + worker flow", () => {
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

  it("handles approval lifecycle across api and worker engine", async () => {
    const createAgent = await request(server)
      .post("/v1/agents")
      .set(authHeader)
      .send({
        name: "worker-flow-agent",
        model: "anthropic/claude-sonnet-4-5-20250929",
      });

    const createSession = await request(server)
      .post("/v1/sessions")
      .set(authHeader)
      .send({
        agentId: createAgent.body.id,
        workspaceId: "workspace_worker_flow",
      });

    const enqueue = await request(server)
      .post(`/v1/sessions/${createSession.body.id}/messages`)
      .set(authHeader)
      .send({ content: "run integration flow" });

    const runId = enqueue.body.runId as string;
    const approvalId = enqueue.body.approvalId as string;

    const runtimeEvents: WorkerRuntimeEvent[] = [
      { type: "run_status", status: "running" },
      {
        type: "approval_required",
        approvalId,
        toolName: "bash",
        riskLevel: "high",
        timeoutMs: 1000,
      },
      { type: "assistant_text_delta", delta: "approval granted" },
      { type: "run_completed" },
    ];

    const runtime = {
      async *streamRun() {
        for (const event of runtimeEvents) {
          yield event;
        }
      },
    };

    const approvalController = new InMemoryApprovalController();
    const engine = new WorkerExecutionEngine(runtime);

    const executionPromise = engine.executeRun(
      {
        sessionId: createSession.body.id,
        runId,
        agentId: createAgent.body.id,
        prompt: "run integration flow",
      },
      { approvalController }
    );

    const approve = await request(server)
      .post(`/v1/runs/${runId}/approve`)
      .set(authHeader)
      .send({
        approvalId,
        actorId: "reviewer_e2e",
        reason: "safe to proceed",
      });

    expect(approve.status).toBe(200);

    approvalController.approve({
      runId,
      approvalId,
      actorId: "reviewer_e2e",
      reason: "safe to proceed",
    });

    const execution = await executionPromise;

    expect(execution.events.map((event) => event.event.type)).toEqual([
      "run_status_changed",
      "approval_required",
      "approval_decided",
      "message_update",
      "run_completed",
    ]);

    const run = await request(server).get(`/v1/runs/${runId}`).set(authHeader);
    expect(run.status).toBe(200);
    expect(run.body.status).toBe("completed");
  });
});
