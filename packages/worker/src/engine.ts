import type { WorkerRuntime } from "./runtime.js";
import type {
  RunStreamEventEnvelope,
  WorkerRunContext,
  WorkerRunRequest,
  WorkerRuntimeEvent,
} from "./types.js";

export interface ExecuteRunOptions {
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
