export type SessionStatus =
  | "idle"
  | "running"
  | "waiting_approval"
  | "failed"
  | "archived";

export type RunStatus =
  | "queued"
  | "running"
  | "waiting_approval"
  | "completed"
  | "failed"
  | "canceled"
  | "orphaned";

export type ApprovalState = "pending" | "approved" | "rejected" | "expired";

export interface Agent {
  id: string;
  name: string;
  model: string;
  defaultTools: string[];
  policyId: string;
  createdAt: string;
  updatedAt: string;
}

export interface Session {
  id: string;
  agentId: string;
  workspaceId: string;
  status: SessionStatus;
  title: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface Run {
  id: string;
  sessionId: string;
  status: RunStatus;
  startedAt: string;
  finishedAt: string | null;
  errorCode: string | null;
  costUsd: number | null;
}

export interface Approval {
  id: string;
  runId: string;
  state: ApprovalState;
  createdAt: string;
  decidedAt: string | null;
  actorId: string | null;
  reason: string | null;
}

export interface TranscriptEvent {
  sequence: number;
  timestamp: string;
  event: {
    type: string;
    payload: Record<string, unknown>;
  };
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
