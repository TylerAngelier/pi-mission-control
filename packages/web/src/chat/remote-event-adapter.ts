/**
 * Remote event adapter for connecting to the control API's SSE stream.
 */

import type {
  ApprovalDecidedEvent,
  ApprovalRequiredEvent,
  ChatMessage,
  ChatState,
  ExecutionEvent,
  MessageUpdateEvent,
  RemoteEventAdapterOptions,
  RunStreamEventEnvelope,
  StreamEventType,
  ToolCall,
  ToolCallEvent,
  ToolOutputEvent,
} from "./types.js";

export { type RunStreamEventEnvelope } from "./types.js";

export class RemoteEventAdapter {
  private options: RemoteEventAdapterOptions;
  private eventSource: EventSource | null = null;
  private reconnectTimer: number | null = null;
  private closed = false;
  private currentRunId: string | null = null;
  private pendingToolCalls = new Map<string, ToolCall>();
  private currentMessageContent = "";

  constructor(options: RemoteEventAdapterOptions) {
    this.options = options;
  }

  connect(): void {
    if (this.closed) {
      return;
    }

    const streamUrl = `${this.options.apiBaseUrl}/v1/sessions/${this.options.sessionId}/subscribe`;

    this.eventSource = new EventSource(streamUrl, {
      withCredentials: true,
    });

    this.eventSource.addEventListener("session_update", (event) => {
      try {
        const envelope = JSON.parse(event.data) as RunStreamEventEnvelope;
        this.handleEnvelope(envelope);
      } catch (error) {
        this.options.onError?.(error instanceof Error ? error : new Error(String(error)));
      }
    });

    this.eventSource.addEventListener("error", () => {
      this.eventSource?.close();
      if (!this.closed && !this.reconnectTimer) {
        this.reconnectTimer = window.setTimeout(() => {
          this.reconnectTimer = null;
          this.connect();
        }, 1000);
      }
    });

    this.options.onStateChange?.({ isStreaming: true });
  }

  disconnect(): void {
    this.closed = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.eventSource?.close();
    this.eventSource = null;
    this.options.onStateChange?.({ isStreaming: false });
  }

  private handleEnvelope(envelope: RunStreamEventEnvelope): void {
    const { runId, event } = envelope;

    if (runId !== this.currentRunId) {
      this.currentRunId = runId;
      this.currentMessageContent = "";
    }

    const eventType = event.type as StreamEventType;

    switch (eventType) {
      case "message_update":
        this.handleMessageUpdate(event.payload as unknown as MessageUpdateEvent, envelope);
        break;
      case "tool_call":
        this.handleToolCall(event.payload as unknown as ToolCallEvent, envelope);
        break;
      case "tool_output":
        this.handleToolOutput(event.payload as unknown as ToolOutputEvent, envelope);
        break;
      case "approval_required":
        this.handleApprovalRequired(event.payload as unknown as ApprovalRequiredEvent, envelope);
        break;
      case "approval_decided":
        this.handleApprovalDecided(event.payload as unknown as ApprovalDecidedEvent, envelope);
        break;
      case "run_started":
        this.handleRunStarted(envelope);
        break;
      case "run_completed":
        this.handleRunCompleted(envelope);
        break;
      case "run_failed":
        this.handleRunFailed(envelope);
        break;
      default:
        // Emit unknown events as execution events
        this.emitExecutionEvent(eventType, envelope);
    }
  }

  private handleMessageUpdate(event: MessageUpdateEvent, envelope: RunStreamEventEnvelope): void {
    const { role, delta, content } = event;

    if (event.type === "text_complete" && content !== undefined) {
      // Final message content received
      const message: ChatMessage = {
        id: `${envelope.sequence}-${Date.now()}`,
        role,
        content,
        timestamp: envelope.timestamp,
        runId: envelope.runId,
      };

      this.options.onMessage?.(message);
      this.currentMessageContent = "";
    } else if (delta) {
      // Streaming delta - accumulate content
      this.currentMessageContent += delta;
    }
  }

  private handleToolCall(event: ToolCallEvent, envelope: RunStreamEventEnvelope): void {
    const toolCallId = `tc-${envelope.sequence}-${Date.now()}`;

    const toolCall: ToolCall = {
      id: toolCallId,
      tool: event.tool,
      input: event.input,
      status: "pending",
      timestamp: envelope.timestamp,
    };

    this.pendingToolCalls.set(toolCallId, toolCall);
    this.options.onToolCall?.(toolCall);
  }

  private handleToolOutput(event: ToolOutputEvent, envelope: RunStreamEventEnvelope): void {
    const { toolCallId, output, error } = event;

    const toolCall = this.pendingToolCalls.get(toolCallId);
    if (!toolCall) {
      // Tool call not tracked, emit as execution event
      this.emitExecutionEvent("tool_output", envelope);
      return;
    }

    const updated: ToolCall = {
      ...toolCall,
      output,
      error,
      status: error ? "failed" : "completed",
    };

    this.pendingToolCalls.set(toolCallId, updated);
    this.options.onToolCall?.(updated);
  }

  private handleApprovalRequired(event: ApprovalRequiredEvent, envelope: RunStreamEventEnvelope): void {
    const executionEvent: ExecutionEvent = {
      id: `evt-${envelope.sequence}`,
      type: "approval_required",
      timestamp: envelope.timestamp,
      data: event,
    };

    this.options.onEvent?.(executionEvent);
  }

  private handleApprovalDecided(event: ApprovalDecidedEvent, envelope: RunStreamEventEnvelope): void {
    const executionEvent: ExecutionEvent = {
      id: `evt-${envelope.sequence}`,
      type: "approval_decided",
      timestamp: envelope.timestamp,
      data: event,
    };

    this.options.onEvent?.(executionEvent);
  }

  private handleRunStarted(envelope: RunStreamEventEnvelope): void {
    const executionEvent: ExecutionEvent = {
      id: `evt-${envelope.sequence}`,
      type: "run_started",
      timestamp: envelope.timestamp,
      data: { runId: envelope.runId },
    };

    this.options.onEvent?.(executionEvent);
    this.options.onStateChange?.({ currentRunId: envelope.runId });
  }

  private handleRunCompleted(envelope: RunStreamEventEnvelope): void {
    const executionEvent: ExecutionEvent = {
      id: `evt-${envelope.sequence}`,
      type: "run_completed",
      timestamp: envelope.timestamp,
      data: { runId: envelope.runId },
    };

    this.options.onEvent?.(executionEvent);
    this.options.onStateChange?.({ currentRunId: undefined });
    this.currentRunId = null;

    // Clear pending tool calls
    this.pendingToolCalls.clear();
  }

  private handleRunFailed(envelope: RunStreamEventEnvelope): void {
    const executionEvent: ExecutionEvent = {
      id: `evt-${envelope.sequence}`,
      type: "run_failed",
      timestamp: envelope.timestamp,
      data: { runId: envelope.runId },
    };

    this.options.onEvent?.(executionEvent);
    this.options.onStateChange?.({ currentRunId: undefined });
    this.currentRunId = null;

    // Clear pending tool calls
    this.pendingToolCalls.clear();
  }

  private emitExecutionEvent(type: string, envelope: RunStreamEventEnvelope): void {
    const executionEvent: ExecutionEvent = {
      id: `evt-${envelope.sequence}`,
      type,
      timestamp: envelope.timestamp,
      data: envelope.event.payload,
    };

    this.options.onEvent?.(executionEvent);
  }

  getCurrentState(): Partial<ChatState> {
    return {
      sessionId: this.options.sessionId,
      currentRunId: this.currentRunId ?? undefined,
      isStreaming: !this.closed && !!this.eventSource,
      toolCalls: Array.from(this.pendingToolCalls.values()),
    };
  }
}

/**
 * Factory function to create a remote event adapter.
 */
export function createRemoteEventAdapter(options: RemoteEventAdapterOptions): RemoteEventAdapter {
  return new RemoteEventAdapter(options);
}
