import { randomUUID } from "node:crypto";

import type {
  ControlApiStore,
  DecideApprovalInput,
  EnqueueMessageInput,
  EnqueueResult,
  RunEventListener,
} from "../control-api-store.js";
import type {
  Agent,
  Approval,
  Run,
  RunStreamEventEnvelope,
  Session,
  TranscriptEvent,
} from "../types.js";
import type { ControlApiRepository } from "./repository.js";
import { PostgresNotifyManager } from "./notify.js";

export class PostgresControlApiStore implements ControlApiStore {
  constructor(
    private readonly repository: ControlApiRepository,
    private readonly notifyManager: PostgresNotifyManager
  ) {}

  listAgents(): Promise<Agent[]> {
    return this.repository.listAgents();
  }

  getAgent(agentId: string): Promise<Agent | undefined> {
    return this.repository.getAgent(agentId);
  }

  async createAgent(input: {
    name: string;
    model: string;
    defaultTools?: string[];
    policyId?: string;
  }): Promise<Agent> {
    return this.repository.createAgent({
      id: `agent_${randomUUID()}`,
      name: input.name,
      model: input.model,
      defaultTools: input.defaultTools ?? ["read", "bash", "edit", "write"],
      policyId: input.policyId ?? "policy_default",
    });
  }

  listSessions(status?: Session["status"]): Promise<Session[]> {
    return this.repository.listSessions(status);
  }

  getSession(sessionId: string): Promise<Session | undefined> {
    return this.repository.getSession(sessionId);
  }

  async createSession(input: {
    agentId: string;
    workspaceId: string;
    title?: string;
    createdBy?: string;
    seedPrompt?: string;
  }): Promise<Session> {
    const tx = await this.repository.beginTransaction();
    const sessionId = `sess_${randomUUID()}`;

    try {
      const session = await this.repository.createSession(
        {
          id: sessionId,
          agentId: input.agentId,
          workspaceId: input.workspaceId,
          title: input.title ?? "Untitled Session",
          createdBy: input.createdBy ?? "system",
        },
        tx
      );

      if (input.seedPrompt) {
        await this.repository.addTranscriptEvent(
          {
            sessionId,
            type: "user_message_seeded",
            payload: { content: input.seedPrompt },
          },
          tx
        );
      }

      await tx.commit();
      return session;
    } catch (error) {
      await tx.rollback();
      throw error;
    }
  }

  getRun(runId: string): Promise<Run | undefined> {
    return this.repository.getRun(runId);
  }

  getRunEvents(runId: string, afterSequence = 0): Promise<RunStreamEventEnvelope[]> {
    return this.repository.listRunEvents(runId, afterSequence);
  }

  subscribeToRunEvents(runId: string, listener: RunEventListener): () => void {
    const channel = `run_events:${runId}`;
    let active = true;
    let unsubscribe: (() => Promise<void>) | null = null;

    void this.notifyManager
      .subscribe(channel, (payload) => {
        if (!active) {
          return;
        }

        const raw = JSON.parse(payload) as {
          session_id: string;
          run_id: string;
          sequence: number;
          timestamp: string;
          event_type: string;
          payload_json: Record<string, unknown>;
        };

        listener({
          sessionId: raw.session_id,
          runId: raw.run_id,
          sequence: raw.sequence,
          timestamp: new Date(raw.timestamp).toISOString(),
          event: {
            type: raw.event_type,
            payload: raw.payload_json,
          },
        });
      })
      .then((value) => {
        unsubscribe = value;
      });

    return () => {
      active = false;
      if (unsubscribe) {
        void unsubscribe();
      }
    };
  }

  async enqueueMessage(input: EnqueueMessageInput): Promise<EnqueueResult> {
    if (input.idempotencyKey) {
      const existing = await this.repository.getIdempotencyKey(input.idempotencyKey);
      if (existing) {
        const run = await this.repository.getRun(existing.runId);
        const approval = await this.repository.getApproval(existing.approvalId);
        if (run && approval) {
          return { run, approval };
        }
      }
    }

    const tx = await this.repository.beginTransaction();
    const runId = `run_${randomUUID()}`;
    const approvalId = `apr_${randomUUID()}`;

    try {
      const run = await this.repository.createRun(
        {
          id: runId,
          sessionId: input.sessionId,
          status: "waiting_approval",
        },
        tx
      );

      const approval = await this.repository.createApproval(
        {
          id: approvalId,
          runId,
          state: "pending",
        },
        tx
      );

      await this.repository.updateSessionStatus(
        {
          sessionId: input.sessionId,
          status: "waiting_approval",
        },
        tx
      );

      await this.repository.addTranscriptEvent(
        {
          sessionId: input.sessionId,
          runId,
          type: "message_queued",
          payload: { runId, content: input.content },
        },
        tx
      );

      await this.repository.addRunEvent(
        {
          runId,
          sessionId: input.sessionId,
          type: "message_queued",
          payload: { runId, content: input.content },
        },
        tx
      );

      await this.repository.addTranscriptEvent(
        {
          sessionId: input.sessionId,
          runId,
          type: "approval_required",
          payload: {
            runId,
            approvalId,
            tool: "bash",
            riskLevel: "high",
          },
        },
        tx
      );

      await this.repository.addRunEvent(
        {
          runId,
          sessionId: input.sessionId,
          type: "approval_required",
          payload: {
            runId,
            approvalId,
            tool: "bash",
            riskLevel: "high",
          },
        },
        tx
      );

      if (input.idempotencyKey) {
        await this.repository.putIdempotencyKey(
          {
            key: input.idempotencyKey,
            runId,
            approvalId,
          },
          tx
        );
      }

      await tx.commit();
      return { run, approval };
    } catch (error) {
      await tx.rollback();
      throw error;
    }
  }

  async decideApproval(input: DecideApprovalInput): Promise<Approval> {
    const run = await this.repository.getRun(input.runId);
    if (!run) {
      throw new Error("Run not found");
    }

    const approval = await this.repository.getApproval(input.approvalId);
    if (!approval || approval.runId !== input.runId) {
      throw new Error("Approval not found");
    }

    if (approval.state !== "pending") {
      throw new Error("Approval is not pending");
    }

    const tx = await this.repository.beginTransaction();

    try {
      const decidedAt = new Date();
      const nextApproval = await this.repository.updateApprovalDecision(
        {
          approvalId: input.approvalId,
          state: input.state,
          actorId: input.actorId,
          reason: input.reason,
          decidedAt,
        },
        tx
      );

      await this.repository.updateRun(
        {
          runId: input.runId,
          status: input.state === "approved" ? "completed" : "failed",
          errorCode: input.state === "approved" ? null : "approval_rejected",
          finishedAt: decidedAt,
        },
        tx
      );

      await this.repository.updateSessionStatus(
        {
          sessionId: run.sessionId,
          status: input.state === "approved" ? "idle" : "failed",
        },
        tx
      );

      const payload = {
        runId: input.runId,
        approvalId: input.approvalId,
        state: input.state,
        actorId: input.actorId,
      };

      await this.repository.addTranscriptEvent(
        {
          sessionId: run.sessionId,
          runId: input.runId,
          type: "approval_decided",
          payload,
        },
        tx
      );

      await this.repository.addRunEvent(
        {
          runId: input.runId,
          sessionId: run.sessionId,
          type: "approval_decided",
          payload,
        },
        tx
      );

      await tx.commit();
      return nextApproval;
    } catch (error) {
      await tx.rollback();
      throw error;
    }
  }

  async getTranscript(
    sessionId: string,
    fromSequence?: number
  ): Promise<{
    sessionId: string;
    nextSequence: number;
    events: TranscriptEvent[];
  }> {
    const start = fromSequence ?? 1;
    const events = await this.repository.listTranscriptEvents(sessionId, start);
    const lastEvent = events.at(-1);
    const nextSequence = lastEvent ? lastEvent.sequence + 1 : start;

    return {
      sessionId,
      nextSequence,
      events,
    };
  }
}
