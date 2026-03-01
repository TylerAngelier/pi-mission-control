import { describe, expect, it } from "vitest";

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
});
