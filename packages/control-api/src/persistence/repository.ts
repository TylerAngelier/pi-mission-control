import type {
  Agent,
  Approval,
  IdempotencyKeyRecord,
  Run,
  RunEventEnvelope,
  Session,
  SessionStatus,
  TranscriptEvent,
} from "./types.js";

import type { QueryResultRow } from "pg";

export interface Transaction {
  query(sql: string, params?: unknown[]): Promise<{ rows: QueryResultRow[] }>;
  commit(): Promise<void>;
  rollback(): Promise<void>;
}

export interface ControlApiRepository {
  beginTransaction(): Promise<Transaction>;

  listAgents(): Promise<Agent[]>;
  getAgent(agentId: string): Promise<Agent | undefined>;
  createAgent(input: {
    id: string;
    name: string;
    model: string;
    defaultTools: string[];
    policyId: string;
  }): Promise<Agent>;

  listSessions(status?: SessionStatus): Promise<Session[]>;
  getSession(sessionId: string): Promise<Session | undefined>;
  createSession(
    input: {
      id: string;
      agentId: string;
      workspaceId: string;
      title: string;
      createdBy: string;
    },
    tx?: Transaction
  ): Promise<Session>;
  updateSessionStatus(
    input: { sessionId: string; status: SessionStatus },
    tx?: Transaction
  ): Promise<void>;

  getRun(runId: string): Promise<Run | undefined>;
  createRun(
    input: {
      id: string;
      sessionId: string;
      status: Run["status"];
    },
    tx?: Transaction
  ): Promise<Run>;
  updateRun(
    input: {
      runId: string;
      status: Run["status"];
      errorCode?: string | null;
      finishedAt?: Date | null;
    },
    tx?: Transaction
  ): Promise<void>;

  createApproval(
    input: {
      id: string;
      runId: string;
      state: Approval["state"];
    },
    tx?: Transaction
  ): Promise<Approval>;
  getApproval(approvalId: string): Promise<Approval | undefined>;
  updateApprovalDecision(
    input: {
      approvalId: string;
      state: "approved" | "rejected";
      actorId: string;
      reason?: string;
      decidedAt: Date;
    },
    tx?: Transaction
  ): Promise<Approval>;

  addTranscriptEvent(
    input: {
      sessionId: string;
      runId?: string;
      type: string;
      payload: Record<string, unknown>;
    },
    tx?: Transaction
  ): Promise<TranscriptEvent>;
  listTranscriptEvents(sessionId: string, fromSequence: number): Promise<TranscriptEvent[]>;

  addRunEvent(
    input: {
      runId: string;
      sessionId: string;
      type: string;
      payload: Record<string, unknown>;
    },
    tx?: Transaction
  ): Promise<RunEventEnvelope>;
  listRunEvents(runId: string, afterSequence: number): Promise<RunEventEnvelope[]>;

  putIdempotencyKey(
    input: { key: string; runId: string; approvalId: string },
    tx?: Transaction
  ): Promise<void>;
  getIdempotencyKey(key: string): Promise<IdempotencyKeyRecord | undefined>;
}
