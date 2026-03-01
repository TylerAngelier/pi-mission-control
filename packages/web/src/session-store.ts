export type SessionStatus = "idle" | "running" | "waiting_approval" | "failed";

export interface SessionSummary {
  id: string;
  title: string;
  status: SessionStatus;
  updatedAt: string;
}

interface SessionSummaryResponse {
  items: SessionSummary[];
}

interface BrowserStorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

interface EventSourceLike {
  addEventListener(type: string, listener: (event: MessageEvent) => void): void;
  close(): void;
}

interface EventSourceInitLike {
  headers?: Record<string, string>;
}

export interface SessionStoreOptions {
  apiBaseUrl?: string;
  authToken?: string;
  cacheTtlMs?: number;
  cacheKey?: string;
  now?: () => number;
  fetchFn?: typeof fetch;
  storage?: BrowserStorageLike;
  createEventSource?: (url: string, init?: EventSourceInitLike) => EventSourceLike;
}

export interface SessionStore {
  list(): SessionSummary[];
  upsert(session: SessionSummary): void;
  remove(sessionId: string): void;
  refresh(force?: boolean): Promise<SessionSummary[]>;
  subscribeToSession(
    sessionId: string,
    onUpdate?: (session: SessionSummary) => void
  ): () => void;
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

export const createSessionStore = (
  initial: SessionSummary[] = [],
  options: SessionStoreOptions = {}
): SessionStore => {
  const sessions = new Map<string, SessionSummary>(
    initial.map((session) => [session.id, session])
  );

  const now = options.now ?? (() => Date.now());
  const fetchFn = options.fetchFn ?? globalThis.fetch;
  const cacheTtlMs = options.cacheTtlMs ?? 5_000;
  const cacheKey = options.cacheKey ?? "pi-mission-control:sessions";
  let lastRefreshAt = 0;

  hydrateFromStorage();

  const list = (): SessionSummary[] =>
    [...sessions.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  const upsert = (session: SessionSummary): void => {
    sessions.set(session.id, session);
    persistToStorage();
  };

  const remove = (sessionId: string): void => {
    sessions.delete(sessionId);
    persistToStorage();
  };

  const refresh = async (force = false): Promise<SessionSummary[]> => {
    if (!options.apiBaseUrl || !fetchFn) {
      return list();
    }

    const currentTime = now();
    if (!force && currentTime - lastRefreshAt < cacheTtlMs) {
      return list();
    }

    try {
      const response = await fetchFn(`${options.apiBaseUrl}/v1/ui/sessions`, {
        method: "GET",
        headers: {
          ...(options.authToken
            ? { Authorization: `Bearer ${options.authToken}` }
            : {}),
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to refresh sessions: ${response.status}`);
      }

      const payload = (await response.json()) as SessionSummaryResponse;
      sessions.clear();
      for (const session of payload.items) {
        sessions.set(session.id, session);
      }

      lastRefreshAt = currentTime;
      persistToStorage();

      return list();
    } catch {
      hydrateFromStorage();
      return list();
    }
  };

  const subscribeToSession = (
    sessionId: string,
    onUpdate?: (session: SessionSummary) => void
  ): (() => void) => {
    if (!options.apiBaseUrl || !options.createEventSource) {
      return () => undefined;
    }

    let closed = false;
    let reconnectTimer: NodeJS.Timeout | null = null;
    let eventSource: EventSourceLike | null = null;

    const connect = () => {
      if (closed) {
        return;
      }

      const created = options.createEventSource?.(
        `${options.apiBaseUrl}/v1/sessions/${sessionId}/subscribe`,
        options.authToken
          ? {
              headers: {
                Authorization: `Bearer ${options.authToken}`,
              },
            }
          : undefined
      );

      if (!created) {
        return;
      }

      eventSource = created;

      eventSource.addEventListener("session_update", (event) => {
        const parsed = JSON.parse(event.data) as SessionSummary;
        upsert(parsed);
        onUpdate?.(parsed);
      });

      eventSource.addEventListener("error", () => {
        eventSource?.close();
        if (closed) {
          return;
        }

        reconnectTimer = setTimeout(connect, 1_000);
      });
    };

    connect();

    return () => {
      closed = true;
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
      }

      eventSource?.close();
    };
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

    persistToStorage();
  };

  return {
    list,
    upsert,
    remove,
    refresh,
    subscribeToSession,
    applyRunEvent,
  };

  function persistToStorage(): void {
    if (!options.storage) {
      return;
    }

    options.storage.setItem(cacheKey, JSON.stringify(list()));
  }

  function hydrateFromStorage(): void {
    if (!options.storage) {
      return;
    }

    const raw = options.storage.getItem(cacheKey);
    if (!raw) {
      return;
    }

    try {
      const parsed = JSON.parse(raw) as SessionSummary[];
      for (const session of parsed) {
        sessions.set(session.id, session);
      }
    } catch {
      // ignore invalid cache payload
    }
  }
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
