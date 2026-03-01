import { randomUUID } from "node:crypto";

import type {
  Agent,
  Approval,
  Run,
  RunStreamEventEnvelope,
  Session,
  TranscriptEvent,
} from "./types.js";

interface EnqueueResult {
  run: Run;
  approval: Approval;
}

type RunEventListener = (event: RunStreamEventEnvelope) => void;

export class InMemoryControlApiStore {
  private readonly agents = new Map<string, Agent>();
  private readonly sessions = new Map<string, Session>();
  private readonly runs = new Map<string, Run>();
  private readonly approvals = new Map<string, Approval>();
  private readonly transcriptEventsBySession = new Map<string, TranscriptEvent[]>();
  private readonly runEventsByRun = new Map<string, RunStreamEventEnvelope[]>();
  private readonly runEventListenersByRun = new Map<string, Set<RunEventListener>>();
  private sequenceBySession = new Map<string, number>();
  private runSequenceByRun = new Map<string, number>();

  listAgents(): Agent[] {
    return [...this.agents.values()];
  }

  getAgent(agentId: string): Agent | undefined {
    return this.agents.get(agentId);
  }

  createAgent(input: {
    name: string;
    model: string;
    defaultTools?: string[];
    policyId?: string;
  }): Agent {
    const now = new Date().toISOString();
    const agent: Agent = {
      id: `agent_${randomUUID()}`,
      name: input.name,
      model: input.model,
      defaultTools: input.defaultTools ?? ["read", "bash", "edit", "write"],
      policyId: input.policyId ?? "policy_default",
      createdAt: now,
      updatedAt: now,
    };
    this.agents.set(agent.id, agent);
    return agent;
  }

  listSessions(status?: Session["status"]): Session[] {
    const sessions = [...this.sessions.values()];
    return status ? sessions.filter((session) => session.status === status) : sessions;
  }

  getSession(sessionId: string): Session | undefined {
    return this.sessions.get(sessionId);
  }

  createSession(input: {
    agentId: string;
    workspaceId: string;
    title?: string;
    createdBy?: string;
    seedPrompt?: string;
  }): Session {
    const now = new Date().toISOString();
    const session: Session = {
      id: `sess_${randomUUID()}`,
      agentId: input.agentId,
      workspaceId: input.workspaceId,
      status: "idle",
      title: input.title ?? "Untitled Session",
      createdBy: input.createdBy ?? "system",
      createdAt: now,
      updatedAt: now,
    };

    this.sessions.set(session.id, session);

    if (input.seedPrompt) {
      this.addTranscriptEvent(session.id, "user_message_seeded", {
        content: input.seedPrompt,
      });
    }

    return session;
  }

  getRun(runId: string): Run | undefined {
    return this.runs.get(runId);
  }

  getRunEvents(runId: string, afterSequence = 0): RunStreamEventEnvelope[] {
    const events = this.runEventsByRun.get(runId) ?? [];
    return events.filter((event) => event.sequence > afterSequence);
  }

  subscribeToRunEvents(runId: string, listener: RunEventListener): () => void {
    const listeners = this.runEventListenersByRun.get(runId) ?? new Set<RunEventListener>();
    listeners.add(listener);
    this.runEventListenersByRun.set(runId, listeners);

    return () => {
      const nextListeners = this.runEventListenersByRun.get(runId);
      if (!nextListeners) {
        return;
      }

      nextListeners.delete(listener);
      if (nextListeners.size === 0) {
        this.runEventListenersByRun.delete(runId);
      }
    };
  }

  enqueueMessage(input: { sessionId: string; content: string }): EnqueueResult {
    const session = this.sessions.get(input.sessionId);
    if (!session) {
      throw new Error("Session not found");
    }

    const run: Run = {
      id: `run_${randomUUID()}`,
      sessionId: input.sessionId,
      status: "waiting_approval",
      startedAt: new Date().toISOString(),
      finishedAt: null,
      errorCode: null,
      costUsd: null,
    };
    this.runs.set(run.id, run);

    const approval: Approval = {
      id: `apr_${randomUUID()}`,
      runId: run.id,
      state: "pending",
      createdAt: new Date().toISOString(),
      decidedAt: null,
      actorId: null,
      reason: null,
    };
    this.approvals.set(approval.id, approval);

    this.sessions.set(input.sessionId, {
      ...session,
      status: "waiting_approval",
      updatedAt: new Date().toISOString(),
    });

    this.addRunAndTranscriptEvent(run.id, input.sessionId, "message_queued", {
      runId: run.id,
      content: input.content,
    });

    this.addRunAndTranscriptEvent(run.id, input.sessionId, "approval_required", {
      runId: run.id,
      approvalId: approval.id,
      tool: "bash",
      riskLevel: "high",
    });

    return { run, approval };
  }

  decideApproval(input: {
    runId: string;
    approvalId: string;
    state: "approved" | "rejected";
    actorId: string;
    reason?: string;
  }): Approval {
    const run = this.runs.get(input.runId);
    if (!run) {
      throw new Error("Run not found");
    }

    const approval = this.approvals.get(input.approvalId);
    if (!approval || approval.runId !== input.runId) {
      throw new Error("Approval not found");
    }

    if (approval.state !== "pending") {
      throw new Error("Approval is not pending");
    }

    const decidedAt = new Date().toISOString();
    const nextApproval: Approval = {
      ...approval,
      state: input.state,
      actorId: input.actorId,
      reason: input.reason ?? null,
      decidedAt,
    };
    this.approvals.set(nextApproval.id, nextApproval);

    const nextRun: Run = {
      ...run,
      status: input.state === "approved" ? "completed" : "failed",
      finishedAt: decidedAt,
      errorCode: input.state === "approved" ? null : "approval_rejected",
    };
    this.runs.set(nextRun.id, nextRun);

    const session = this.sessions.get(run.sessionId);
    if (session) {
      this.sessions.set(run.sessionId, {
        ...session,
        status: input.state === "approved" ? "idle" : "failed",
        updatedAt: decidedAt,
      });
    }

    this.addRunAndTranscriptEvent(run.id, run.sessionId, "approval_decided", {
      runId: run.id,
      approvalId: approval.id,
      state: nextApproval.state,
      actorId: nextApproval.actorId,
    });

    return nextApproval;
  }

  getTranscript(sessionId: string, fromSequence?: number): {
    sessionId: string;
    nextSequence: number;
    events: TranscriptEvent[];
  } {
    const existing = this.transcriptEventsBySession.get(sessionId) ?? [];
    const start = fromSequence ?? 1;
    const filtered = existing.filter((event) => event.sequence >= start);

    return {
      sessionId,
      nextSequence: (this.sequenceBySession.get(sessionId) ?? 0) + 1,
      events: filtered,
    };
  }

  private addRunAndTranscriptEvent(
    runId: string,
    sessionId: string,
    type: string,
    payload: Record<string, unknown>
  ): void {
    this.addTranscriptEvent(sessionId, type, payload);
    this.addRunEvent(runId, sessionId, type, payload);
  }

  private addTranscriptEvent(
    sessionId: string,
    type: string,
    payload: Record<string, unknown>
  ): void {
    const events = this.transcriptEventsBySession.get(sessionId) ?? [];
    const sequence = (this.sequenceBySession.get(sessionId) ?? 0) + 1;
    this.sequenceBySession.set(sessionId, sequence);

    events.push({
      sequence,
      timestamp: new Date().toISOString(),
      event: {
        type,
        payload,
      },
    });

    this.transcriptEventsBySession.set(sessionId, events);
  }

  private addRunEvent(
    runId: string,
    sessionId: string,
    type: string,
    payload: Record<string, unknown>
  ): void {
    const runEvents = this.runEventsByRun.get(runId) ?? [];
    const sequence = (this.runSequenceByRun.get(runId) ?? 0) + 1;
    this.runSequenceByRun.set(runId, sequence);

    const envelope: RunStreamEventEnvelope = {
      sessionId,
      runId,
      sequence,
      timestamp: new Date().toISOString(),
      event: {
        type,
        payload,
      },
    };

    runEvents.push(envelope);
    this.runEventsByRun.set(runId, runEvents);

    const listeners = this.runEventListenersByRun.get(runId);
    if (!listeners) {
      return;
    }

    for (const listener of listeners) {
      listener(envelope);
    }
  }
}
