import type {
  Agent,
  Approval,
  Run,
  RunStreamEventEnvelope,
  Session,
  TranscriptEvent,
} from "./types.js";

export interface EnqueueMessageInput {
  sessionId: string;
  content: string;
  idempotencyKey?: string;
}

export interface EnqueueResult {
  run: Run;
  approval: Approval;
}

export interface DecideApprovalInput {
  runId: string;
  approvalId: string;
  state: "approved" | "rejected";
  actorId: string;
  reason?: string;
}

export type RunEventListener = (event: RunStreamEventEnvelope) => void;

export interface ControlApiStore {
  listAgents(): Agent[] | Promise<Agent[]>;
  getAgent(agentId: string): Agent | undefined | Promise<Agent | undefined>;
  createAgent(input: {
    name: string;
    model: string;
    defaultTools?: string[];
    policyId?: string;
  }): Agent | Promise<Agent>;

  listSessions(status?: Session["status"]): Session[] | Promise<Session[]>;
  getSession(sessionId: string): Session | undefined | Promise<Session | undefined>;
  createSession(input: {
    agentId: string;
    workspaceId: string;
    title?: string;
    createdBy?: string;
    seedPrompt?: string;
  }): Session | Promise<Session>;

  getRun(runId: string): Run | undefined | Promise<Run | undefined>;
  getRunEvents(
    runId: string,
    afterSequence?: number
  ): RunStreamEventEnvelope[] | Promise<RunStreamEventEnvelope[]>;
  subscribeToRunEvents(runId: string, listener: RunEventListener): () => void;

  enqueueMessage(input: EnqueueMessageInput): EnqueueResult | Promise<EnqueueResult>;
  decideApproval(input: DecideApprovalInput): Approval | Promise<Approval>;

  getTranscript(sessionId: string, fromSequence?: number):
    | {
        sessionId: string;
        nextSequence: number;
        events: TranscriptEvent[];
      }
    | Promise<{
        sessionId: string;
        nextSequence: number;
        events: TranscriptEvent[];
      }>;
}
