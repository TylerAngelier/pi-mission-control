import { describe, expect, it, vi } from "vitest";

import { createSessionStore } from "./session-store.js";

describe("createSessionStore", () => {
  it("sorts sessions by updatedAt descending", () => {
    const store = createSessionStore([
      {
        id: "sess_old",
        title: "Old",
        status: "idle",
        updatedAt: "2026-02-01T00:00:00.000Z",
      },
      {
        id: "sess_new",
        title: "New",
        status: "running",
        updatedAt: "2026-02-02T00:00:00.000Z",
      },
    ]);

    expect(store.list().map((session) => session.id)).toEqual(["sess_new", "sess_old"]);
  });

  it("maps run events to session statuses", () => {
    const store = createSessionStore([
      {
        id: "sess_1",
        title: "Build",
        status: "idle",
        updatedAt: "2026-02-01T00:00:00.000Z",
      },
    ]);

    store.applyRunEvent({ sessionId: "sess_1", eventType: "message_queued" });
    expect(store.list()[0]?.status).toBe("running");

    store.applyRunEvent({ sessionId: "sess_1", eventType: "approval_required" });
    expect(store.list()[0]?.status).toBe("waiting_approval");

    store.applyRunEvent({ sessionId: "sess_1", eventType: "approval_decided" });
    expect(store.list()[0]?.status).toBe("running");

    store.applyRunEvent({ sessionId: "sess_1", eventType: "run_completed" });
    expect(store.list()[0]?.status).toBe("idle");

    store.applyRunEvent({ sessionId: "sess_1", eventType: "run_failed" });
    expect(store.list()[0]?.status).toBe("failed");
  });

  it("supports upsert and remove", () => {
    const store = createSessionStore();

    store.upsert({
      id: "sess_2",
      title: "Review",
      status: "running",
      updatedAt: "2026-02-02T00:00:00.000Z",
    });

    expect(store.list()).toHaveLength(1);

    store.remove("sess_2");
    expect(store.list()).toHaveLength(0);
  });

  it("refreshes from API with cache TTL", async () => {
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValue({
        ok: true,
        json: async () => ({
          items: [
            {
              id: "sess_remote",
              title: "Remote",
              status: "running",
              updatedAt: "2026-02-10T00:00:00.000Z",
            },
          ],
        }),
      } as unknown as Response);

    let time = 10_000;
    const store = createSessionStore([], {
      apiBaseUrl: "http://localhost:8787",
      authToken: "test-token",
      fetchFn,
      cacheTtlMs: 1_000,
      now: () => time,
    });

    await store.refresh();
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(store.list()[0]?.id).toBe("sess_remote");

    await store.refresh();
    expect(fetchFn).toHaveBeenCalledTimes(1);

    time += 1_500;
    await store.refresh();
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it("subscribes to session updates via event source", () => {
    const listeners = new Map<string, (event: MessageEvent) => void>();

    const store = createSessionStore([], {
      apiBaseUrl: "http://localhost:8787",
      createEventSource: () => ({
        addEventListener(type, listener) {
          listeners.set(type, listener);
        },
        close() {
          // noop
        },
      }),
    });

    const observed: string[] = [];
    const unsubscribe = store.subscribeToSession("sess_1", (session) => {
      observed.push(session.status);
    });

    const updateListener = listeners.get("session_update");
    expect(updateListener).toBeDefined();

    updateListener?.({
      data: JSON.stringify({
        id: "sess_1",
        title: "Updated",
        status: "waiting_approval",
        updatedAt: "2026-02-11T00:00:00.000Z",
      }),
    } as MessageEvent);

    expect(store.list()[0]?.status).toBe("waiting_approval");
    expect(observed).toEqual(["waiting_approval"]);

    unsubscribe();
  });
});
