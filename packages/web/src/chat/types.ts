/**
 * Chat component types for Pi Mission Control web application.
 */

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

export type ChatMessageRole = "user" | "assistant" | "system";

export interface ChatMessage {
  id: string;
  role: ChatMessageRole;
  content: string;
  timestamp: string;
  runId?: string;
}

export interface ToolCall {
  id: string;
  tool: string;
  input: Record<string, unknown>;
  output?: string;
  error?: string;
  status: "pending" | "completed" | "failed";
  timestamp: string;
}

export interface ExecutionEvent {
  id: string;
  type: string;
  timestamp: string;
  data: Record<string, unknown>;
}

export interface ChatState {
  sessionId: string;
  messages: ChatMessage[];
  toolCalls: ToolCall[];
  events: ExecutionEvent[];
  isStreaming: boolean;
  currentRunId?: string;
}

export interface RemoteEventAdapterOptions {
  apiBaseUrl: string;
  authToken: string;
  sessionId: string;
  onMessage?: (message: ChatMessage) => void;
  onToolCall?: (toolCall: ToolCall) => void;
  onEvent?: (event: ExecutionEvent) => void;
  onStateChange?: (state: Partial<ChatState>) => void;
  onError?: (error: Error) => void;
}

/**
 * Event envelope types from control API
 */
export type StreamEventType =
  | "message_update"
  | "tool_call"
  | "tool_output"
  | "approval_required"
  | "approval_decided"
  | "run_started"
  | "run_completed"
  | "run_failed";

export interface MessageUpdateEvent {
  type: "text_delta" | "text_complete";
  delta?: string;
  content?: string;
  role: ChatMessageRole;
}

export interface ToolCallEvent {
  tool: string;
  input: Record<string, unknown>;
}

export interface ToolOutputEvent {
  toolCallId: string;
  output?: string;
  error?: string;
}

export interface ApprovalRequiredEvent extends Record<string, unknown> {
  approvalId: string;
  tool: string;
  riskLevel: "low" | "medium" | "high";
  summary: string;
  payload: Record<string, unknown>;
  expiresAt: string;
}

export interface ApprovalDecidedEvent extends Record<string, unknown> {
  approvalId: string;
  decision: "approved" | "rejected";
  actorId: string;
  reason?: string;
}
