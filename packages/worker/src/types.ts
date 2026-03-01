export interface WorkerRunRequest {
  sessionId: string;
  runId: string;
  agentId: string;
  prompt: string;
}

export interface WorkerRunContext {
  sessionId: string;
  runId: string;
}

export interface RunStreamEventEnvelope {
  sessionId: string;
  runId: string;
  sequence: number;
  timestamp: string;
  event: {
    type: string;
    payload: Record<string, unknown>;
  };
}

export type WorkerRuntimeEvent =
  | {
      type: "assistant_text_delta";
      delta: string;
    }
  | {
      type: "tool_call_started";
      toolName: string;
      callId: string;
      input: Record<string, unknown>;
    }
  | {
      type: "tool_call_completed";
      toolName: string;
      callId: string;
      output: string;
      isError?: boolean;
    }
  | {
      type: "run_status";
      status: "queued" | "running" | "waiting_approval";
    }
  | {
      type: "run_completed";
      usage?: {
        inputTokens: number;
        outputTokens: number;
      };
    }
  | {
      type: "run_failed";
      code: string;
      message: string;
    };
