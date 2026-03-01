import { mkdtemp, mkdir, readlink, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  CodingAgentSdkRpcRuntime,
  InMemoryApprovalController,
  LocalWorkspaceManager,
  WorkerExecutionEngine,
  health,
  normalizeRuntimeEvent,
  type CodingAgentRpcClient,
  type WorkerRuntimeEvent,
} from "./index.js";

describe("worker health", () => {
  it("returns ok status", () => {
    expect(health()).toEqual({ service: "worker", status: "ok" });
  });
});

describe("WorkerExecutionEngine", () => {
  it("streams runtime events and normalizes envelopes with sequence numbers", async () => {
    const events: WorkerRuntimeEvent[] = [
      { type: "run_status", status: "running" },
      { type: "assistant_text_delta", delta: "Working" },
      {
        type: "tool_call_started",
        toolName: "bash",
        callId: "call_1",
        input: { command: "npm test" },
      },
      {
        type: "tool_call_completed",
        toolName: "bash",
        callId: "call_1",
        output: "ok",
      },
      {
        type: "run_completed",
        usage: { inputTokens: 12, outputTokens: 8 },
      },
    ];

    const runtime = {
      async *streamRun() {
        for (const event of events) {
          yield event;
        }
      },
    };

    const engine = new WorkerExecutionEngine(runtime);
    const result = await engine.executeRun({
      sessionId: "sess_123",
      runId: "run_123",
      agentId: "agent_123",
      prompt: "run tests",
    });

    expect(result.events).toHaveLength(5);
    expect(result.events.map((event) => event.sequence)).toEqual([1, 2, 3, 4, 5]);
    expect(result.events[0]?.event.type).toBe("run_status_changed");
    expect(result.events[1]?.event.payload).toEqual({
      assistantMessageEvent: { type: "text_delta", delta: "Working" },
    });
    expect(result.events[2]?.event.type).toBe("tool_call_started");
    expect(result.events[4]?.event).toEqual({
      type: "run_completed",
      payload: {
        usage: { inputTokens: 12, outputTokens: 8 },
      },
    });
  });

  it("emits run_failed when runtime throws", async () => {
    const runtime = {
      async *streamRun() {
        yield { type: "run_status", status: "running" } as const;
        throw new Error("transport disconnected");
      },
    };

    const engine = new WorkerExecutionEngine(runtime);

    const result = await engine.executeRun({
      sessionId: "sess_1",
      runId: "run_1",
      agentId: "agent_1",
      prompt: "hello",
    });

    expect(result.events).toHaveLength(2);
    expect(result.events[1]?.event).toEqual({
      type: "run_failed",
      payload: {
        code: "runtime_error",
        message: "transport disconnected",
      },
    });
  });

  it("pauses for approval and resumes when approved", async () => {
    const runtime = {
      async *streamRun() {
        yield { type: "run_status", status: "running" } as const;
        yield {
          type: "approval_required",
          approvalId: "apr_1",
          toolName: "bash",
          riskLevel: "high",
          timeoutMs: 100,
        } as const;
        yield { type: "assistant_text_delta", delta: "resumed" } as const;
        yield { type: "run_completed" } as const;
      },
    };

    const engine = new WorkerExecutionEngine(runtime);
    const approvalController = new InMemoryApprovalController(
      () => new Date("2026-03-01T00:00:00.000Z")
    );

    const executionPromise = engine.executeRun(
      {
        sessionId: "sess_a",
        runId: "run_a",
        agentId: "agent_a",
        prompt: "do risky thing",
      },
      { approvalController }
    );

    setTimeout(() => {
      approvalController.approve({
        runId: "run_a",
        approvalId: "apr_1",
        actorId: "reviewer_1",
      });
    }, 0);

    const result = await executionPromise;

    expect(result.events.map((event) => event.event.type)).toEqual([
      "run_status_changed",
      "approval_required",
      "approval_decided",
      "message_update",
      "run_completed",
    ]);
  });

  it("fails run when approval is rejected", async () => {
    const runtime = {
      async *streamRun() {
        yield {
          type: "approval_required",
          approvalId: "apr_2",
          toolName: "edit",
          riskLevel: "high",
          timeoutMs: 100,
        } as const;
        yield { type: "run_completed" } as const;
      },
    };

    const engine = new WorkerExecutionEngine(runtime);
    const approvalController = new InMemoryApprovalController();

    const executionPromise = engine.executeRun(
      {
        sessionId: "sess_b",
        runId: "run_b",
        agentId: "agent_b",
        prompt: "edit file",
      },
      { approvalController }
    );

    setTimeout(() => {
      approvalController.reject({
        runId: "run_b",
        approvalId: "apr_2",
        actorId: "reviewer_2",
        reason: "too risky",
      });
    }, 0);

    const result = await executionPromise;

    expect(result.events.at(-1)?.event).toEqual({
      type: "run_failed",
      payload: {
        code: "approval_rejected",
        message: "too risky",
      },
    });
  });

  it("fails run when approval times out", async () => {
    const runtime = {
      async *streamRun() {
        yield {
          type: "approval_required",
          approvalId: "apr_3",
          toolName: "write",
          riskLevel: "high",
          timeoutMs: 1,
        } as const;
      },
    };

    const engine = new WorkerExecutionEngine(runtime);
    const approvalController = new InMemoryApprovalController();

    const result = await engine.executeRun(
      {
        sessionId: "sess_c",
        runId: "run_c",
        agentId: "agent_c",
        prompt: "write file",
      },
      { approvalController }
    );

    expect(result.events.at(-1)?.event).toEqual({
      type: "run_failed",
      payload: {
        code: "approval_timeout",
        message: "Approval request timed out",
      },
    });
  });

  it("fails run when approval controller is missing", async () => {
    const runtime = {
      async *streamRun() {
        yield {
          type: "approval_required",
          approvalId: "apr_4",
          toolName: "bash",
          riskLevel: "high",
          timeoutMs: 100,
        } as const;
      },
    };

    const engine = new WorkerExecutionEngine(runtime);
    const result = await engine.executeRun({
      sessionId: "sess_d",
      runId: "run_d",
      agentId: "agent_d",
      prompt: "dangerous command",
    });

    expect(result.events.at(-1)?.event).toEqual({
      type: "run_failed",
      payload: {
        code: "approval_controller_missing",
        message: "Approval controller is required for approval_required events",
      },
    });
  });
});

describe("CodingAgentSdkRpcRuntime", () => {
  it("delegates to the RPC client stream loop", async () => {
    const clientCalls: Array<{ agentId: string; prompt: string }> = [];

    const client: CodingAgentRpcClient = {
      async *streamRun(input) {
        clientCalls.push(input);
        yield { type: "assistant_text_delta", delta: "hello" };
      },
    };

    const runtime = new CodingAgentSdkRpcRuntime(client);

    const received: WorkerRuntimeEvent[] = [];
    for await (const event of runtime.streamRun({
      sessionId: "sess_44",
      runId: "run_44",
      agentId: "agent_44",
      prompt: "say hello",
    })) {
      received.push(event);
    }

    expect(clientCalls).toEqual([{ agentId: "agent_44", prompt: "say hello" }]);
    expect(received).toEqual([{ type: "assistant_text_delta", delta: "hello" }]);
  });
});

describe("normalizeRuntimeEvent", () => {
  it("maps failures to control-plane event shape", () => {
    expect(
      normalizeRuntimeEvent({
        type: "run_failed",
        code: "approval_timeout",
        message: "approval expired",
      })
    ).toEqual({
      type: "run_failed",
      payload: {
        code: "approval_timeout",
        message: "approval expired",
      },
    });
  });

  it("maps approval required events to control-plane event shape", () => {
    expect(
      normalizeRuntimeEvent({
        type: "approval_required",
        approvalId: "apr_norm",
        toolName: "bash",
        riskLevel: "high",
        timeoutMs: 30000,
      })
    ).toEqual({
      type: "approval_required",
      payload: {
        approvalId: "apr_norm",
        toolName: "bash",
        riskLevel: "high",
        timeoutMs: 30000,
      },
    });
  });
});

describe("InMemoryApprovalController", () => {
  it("throws when resolving unknown approvals", () => {
    const controller = new InMemoryApprovalController();

    expect(() =>
      controller.approve({
        runId: "run_missing",
        approvalId: "apr_missing",
        actorId: "reviewer",
      })
    ).toThrow("Approval not pending");

    expect(() =>
      controller.reject({
        runId: "run_missing",
        approvalId: "apr_missing",
        actorId: "reviewer",
      })
    ).toThrow("Approval not pending");
  });
});

describe("LocalWorkspaceManager", () => {
  it("creates, mounts, and cleans up isolated workspace directories", async () => {
    const baseDirectory = await mkdtemp(join(tmpdir(), "mc-worker-base-"));
    const repoDirectory = await mkdtemp(join(tmpdir(), "mc-worker-repo-"));

    const manager = new LocalWorkspaceManager({
      baseDirectory,
      createId: () => "ws_test",
      now: () => new Date("2026-02-28T00:00:00.000Z"),
    });

    try {
      const workspace = await manager.createWorkspace("sess_abc");
      expect(workspace.id).toBe("ws_test");
      expect(workspace.mountedSourcePath).toBeNull();

      const createdStats = await stat(workspace.rootPath);
      expect(createdStats.isDirectory()).toBe(true);

      const mounted = await manager.mountWorkspace(workspace.id, repoDirectory);
      expect(mounted.mountedSourcePath).toBe(repoDirectory);

      const linkTarget = await readlink(mounted.mountPath);
      expect(linkTarget).toBe(repoDirectory);

      await manager.cleanupWorkspace(workspace.id);
      await expect(stat(workspace.rootPath)).rejects.toThrow();
    } finally {
      await rm(baseDirectory, { recursive: true, force: true });
      await rm(repoDirectory, { recursive: true, force: true });
    }
  });

  it("throws for unknown workspace ids", async () => {
    const baseDirectory = await mkdtemp(join(tmpdir(), "mc-worker-base-"));
    const sourceDirectory = join(baseDirectory, "source");
    await mkdir(sourceDirectory, { recursive: true });

    const manager = new LocalWorkspaceManager({ baseDirectory });

    try {
      await expect(manager.mountWorkspace("missing", sourceDirectory)).rejects.toThrow(
        "Workspace not found"
      );
      await expect(manager.cleanupWorkspace("missing")).rejects.toThrow(
        "Workspace not found"
      );
    } finally {
      await rm(baseDirectory, { recursive: true, force: true });
    }
  });
});
