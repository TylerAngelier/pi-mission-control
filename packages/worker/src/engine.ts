import type { ApprovalController } from "./approval.js";
import type { WorkerRuntime } from "./runtime.js";
import type {
  RunStreamEventEnvelope,
  WorkerRunContext,
  WorkerRunRequest,
  WorkerRuntimeEvent,
} from "./types.js";

export interface ExecuteRunOptions {
  approvalController?: ApprovalController;
  onEvent?: (event: RunStreamEventEnvelope) => void;
}

export interface ExecuteRunResult {
  events: RunStreamEventEnvelope[];
}

export class WorkerExecutionEngine {
  constructor(private readonly runtime: WorkerRuntime) {}

  async executeRun(
    input: WorkerRunRequest,
    options: ExecuteRunOptions = {}
  ): Promise<ExecuteRunResult> {
    const events: RunStreamEventEnvelope[] = [];
    let sequence = 0;

    const publish = (runtimeEvent: WorkerRuntimeEvent): void => {
      sequence += 1;

      const envelope = toEnvelope(
        { sessionId: input.sessionId, runId: input.runId },
        sequence,
        runtimeEvent
      );

      events.push(envelope);
      options.onEvent?.(envelope);
    };

    try {
      for await (const event of this.runtime.streamRun(input)) {
        publish(event);

        if (event.type !== "approval_required") {
          continue;
        }

        const approvalController = options.approvalController;
        if (!approvalController) {
          publish({
            type: "run_failed",
            code: "approval_controller_missing",
            message: "Approval controller is required for approval_required events",
          });
          return { events };
        }

        const decision = await approvalController.waitForDecision({
          runId: input.runId,
          approvalId: event.approvalId,
          timeoutMs: event.timeoutMs,
        });

        publish({
          type: "approval_decided",
          approvalId: event.approvalId,
          state: decision.state,
          actorId: decision.actorId,
          reason: decision.reason,
          decidedAt: decision.decidedAt,
        });

        if (decision.state !== "approved") {
          const failureCode =
            decision.state === "expired" ? "approval_timeout" : "approval_rejected";

          publish({
            type: "run_failed",
            code: failureCode,
            message:
              decision.reason ??
              (decision.state === "expired"
                ? "Approval request timed out"
                : "Approval request rejected"),
          });

          return { events };
        }
      }
    } catch (error) {
      publish({
        type: "run_failed",
        code: "runtime_error",
        message: error instanceof Error ? error.message : "Unknown runtime error",
      });
    }

    return { events };
  }
}

const toEnvelope = (
  context: WorkerRunContext,
  sequence: number,
  runtimeEvent: WorkerRuntimeEvent
): RunStreamEventEnvelope => {
  const normalized = normalizeRuntimeEvent(runtimeEvent);

  return {
    sessionId: context.sessionId,
    runId: context.runId,
    sequence,
    timestamp: new Date().toISOString(),
    event: normalized,
  };
};

export const normalizeRuntimeEvent = (
  runtimeEvent: WorkerRuntimeEvent
): RunStreamEventEnvelope["event"] => {
  switch (runtimeEvent.type) {
    case "assistant_text_delta":
      return {
        type: "message_update",
        payload: {
          assistantMessageEvent: {
            type: "text_delta",
            delta: runtimeEvent.delta,
          },
        },
      };
    case "tool_call_started":
      return {
        type: "tool_call_started",
        payload: {
          toolName: runtimeEvent.toolName,
          callId: runtimeEvent.callId,
          input: runtimeEvent.input,
        },
      };
    case "tool_call_completed":
      return {
        type: "tool_call_completed",
        payload: {
          toolName: runtimeEvent.toolName,
          callId: runtimeEvent.callId,
          output: runtimeEvent.output,
          isError: runtimeEvent.isError ?? false,
        },
      };
    case "run_status":
      return {
        type: "run_status_changed",
        payload: {
          status: runtimeEvent.status,
        },
      };
    case "approval_required":
      return {
        type: "approval_required",
        payload: {
          approvalId: runtimeEvent.approvalId,
          toolName: runtimeEvent.toolName,
          riskLevel: runtimeEvent.riskLevel,
          timeoutMs: runtimeEvent.timeoutMs,
        },
      };
    case "approval_decided":
      return {
        type: "approval_decided",
        payload: {
          approvalId: runtimeEvent.approvalId,
          state: runtimeEvent.state,
          actorId: runtimeEvent.actorId,
          reason: runtimeEvent.reason,
          decidedAt: runtimeEvent.decidedAt,
        },
      };
    case "run_completed":
      return {
        type: "run_completed",
        payload: {
          usage: runtimeEvent.usage ?? null,
        },
      };
    case "run_failed":
      return {
        type: "run_failed",
        payload: {
          code: runtimeEvent.code,
          message: runtimeEvent.message,
        },
      };
  }
};
