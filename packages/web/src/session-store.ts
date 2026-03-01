export type SessionStatus = "idle" | "running" | "waiting_approval" | "failed";

export interface SessionSummary {
  id: string;
  title: string;
  status: SessionStatus;
  updatedAt: string;
}

export interface SessionStore {
  list(): SessionSummary[];
  upsert(session: SessionSummary): void;
  remove(sessionId: string): void;
  applyRunEvent(input: {
    sessionId: string;
    eventType:
      | "message_queued"
      | "approval_required"
      | "approval_decided"
      | "run_completed"
      | "run_failed";
  }): void;
}

export const createSessionStore = (initial: SessionSummary[] = []): SessionStore => {
  const sessions = new Map<string, SessionSummary>(
    initial.map((session) => [session.id, session])
  );

  const list = (): SessionSummary[] =>
    [...sessions.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  const upsert = (session: SessionSummary): void => {
    sessions.set(session.id, session);
  };

  const remove = (sessionId: string): void => {
    sessions.delete(sessionId);
  };

  const applyRunEvent: SessionStore["applyRunEvent"] = ({ sessionId, eventType }) => {
    const existing = sessions.get(sessionId);
    if (!existing) {
      return;
    }

    const status = mapEventTypeToStatus(eventType, existing.status);

    sessions.set(sessionId, {
      ...existing,
      status,
      updatedAt: new Date().toISOString(),
    });
  };

  return {
    list,
    upsert,
    remove,
    applyRunEvent,
  };
};

const mapEventTypeToStatus = (
  eventType: Parameters<SessionStore["applyRunEvent"]>[0]["eventType"],
  previous: SessionStatus
): SessionStatus => {
  switch (eventType) {
    case "message_queued":
      return "running";
    case "approval_required":
      return "waiting_approval";
    case "approval_decided":
      return "running";
    case "run_completed":
      return "idle";
    case "run_failed":
      return "failed";
    default:
      return previous;
  }
};
