import { createServer, type Server } from "node:http";

import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createControlApiApp } from "@pi-mission-control/control-api";
import { createSessionStore } from "./session-store.js";

describe("session-store integration", () => {
  const authToken = "test-token";
  const authHeader = { Authorization: `Bearer ${authToken}` };

  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    const app = createControlApiApp({ authToken });
    server = createServer(app);

    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => resolve());
    });

    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("Expected TCP server address");
    }

    baseUrl = `http://127.0.0.1:${address.port}`;

    const createAgent = await request(server).post("/v1/agents").set(authHeader).send({
      name: "web-integration-agent",
      model: "anthropic/claude-sonnet-4-5-20250929",
    });

    await request(server).post("/v1/ui/sessions").set(authHeader).send({
      agentId: createAgent.body.id,
      workspaceId: "workspace_web_int",
      title: "web integration session",
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
  });

  it("refreshes from real API backend", async () => {
    const store = createSessionStore([], {
      apiBaseUrl: baseUrl,
      authToken,
      fetchFn: fetch,
      cacheTtlMs: 0,
    });

    const sessions = await store.refresh(true);
    expect(sessions.length).toBeGreaterThan(0);
    expect(sessions[0]?.title).toBeDefined();
  });

  it("reconnects after event source error and still applies updates", () => {
    const sources: Array<{
      listeners: Map<string, (event: MessageEvent) => void>;
      closeCalls: number;
    }> = [];

    const store = createSessionStore([], {
      apiBaseUrl: baseUrl,
      authToken,
      createEventSource: () => {
        const listeners = new Map<string, (event: MessageEvent) => void>();
        const source = {
          listeners,
          closeCalls: 0,
        };

        sources.push(source);

        return {
          addEventListener(type, listener) {
            listeners.set(type, listener);
          },
          close() {
            source.closeCalls += 1;
          },
        };
      },
    });

    const unsubscribe = store.subscribeToSession("sess_reconnect");

    const firstSource = sources[0];
    expect(firstSource).toBeDefined();

    firstSource?.listeners.get("error")?.({} as MessageEvent);

    setTimeout(() => {
      const secondSource = sources[1];
      secondSource?.listeners.get("session_update")?.({
        data: JSON.stringify({
          id: "sess_reconnect",
          title: "Reconnect Session",
          status: "running",
          updatedAt: new Date().toISOString(),
        }),
      } as MessageEvent);
    }, 1_100);

    return new Promise<void>((resolve) => {
      setTimeout(() => {
        expect(sources.length).toBeGreaterThanOrEqual(2);
        expect(store.list()[0]?.id).toBe("sess_reconnect");
        unsubscribe();
        resolve();
      }, 1_300);
    });
  });
});
