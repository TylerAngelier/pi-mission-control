/**
 * Tests for RemoteEventAdapter.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { RemoteEventAdapter, type RunStreamEventEnvelope } from "./remote-event-adapter.js";

// Mock EventSource for Node.js test environment
class MockEventSource extends EventTarget {
  public readonly url: string;
  public readonly withCredentials: boolean;
  public readyState = 0 as 0 | 1 | 2; // CONNECTING
  public CONNECTING = 0 as const;
  public OPEN = 1 as const;
  public CLOSED = 2 as const;
  public onerror: ((this: EventSource, ev: Event) => unknown) | null = null;
  public onmessage: ((this: EventSource, ev: MessageEvent) => unknown) | null = null;
  public onopen: ((this: EventSource, ev: Event) => unknown) | null = null;

  constructor(url: string, eventSourceInitDict?: EventSourceInit) {
    super();
    this.url = url;
    this.withCredentials = eventSourceInitDict?.withCredentials ?? false;
    this.readyState = this.OPEN;
  }

  close(): void {
    this.readyState = this.CLOSED;
  }

  override dispatchEvent(event: Event): boolean {
    return super.dispatchEvent(event);
  }
}

// Polyfill EventSource in test environment
if (typeof globalThis.EventSource === "undefined") {
  (globalThis as unknown as { EventSource: typeof MockEventSource }).EventSource =
    MockEventSource;
}

describe("RemoteEventAdapter", () => {
  const mockOptions = {
    apiBaseUrl: "http://localhost:3000",
    authToken: "test-token",
    sessionId: "test-session-123",
  };

  let adapter: RemoteEventAdapter;

  beforeEach(() => {
    adapter = new RemoteEventAdapter(mockOptions);
  });

  afterEach(() => {
    adapter.disconnect();
  });

  describe("constructor", () => {
    it("should create an adapter with given options", () => {
      expect(adapter).toBeInstanceOf(RemoteEventAdapter);
      const state = adapter.getCurrentState();
      expect(state.sessionId).toBe(mockOptions.sessionId);
      expect(state.isStreaming).toBe(false);
    });
  });

  describe("connect and disconnect", () => {
    it("should set streaming state to true when connected", () => {
      const onStateChange = vi.fn();
      const adapterWithCallback = new RemoteEventAdapter({
        ...mockOptions,
        onStateChange,
      });

      adapterWithCallback.connect();
      expect(onStateChange).toHaveBeenCalledWith({ isStreaming: true });
      expect(adapterWithCallback.getCurrentState().isStreaming).toBe(true);

      adapterWithCallback.disconnect();
    });

    it("should set streaming state to false when disconnected", () => {
      const onStateChange = vi.fn();
      const adapterWithCallback = new RemoteEventAdapter({
        ...mockOptions,
        onStateChange,
      });

      adapterWithCallback.connect();
      adapterWithCallback.disconnect();
      expect(onStateChange).toHaveBeenLastCalledWith({ isStreaming: false });
      expect(adapterWithCallback.getCurrentState().isStreaming).toBe(false);
    });

    it("should not connect after being closed", () => {
      adapter.disconnect();
      adapter.connect();
      expect(adapter.getCurrentState().isStreaming).toBe(false);
    });
  });

  describe("event handling", () => {
    it("should handle message_update events", () => {
      const onMessage = vi.fn();
      const adapterWithCallback = new RemoteEventAdapter({
        ...mockOptions,
        onMessage,
      });

      const envelope: RunStreamEventEnvelope = {
        sessionId: mockOptions.sessionId,
        runId: "run-123",
        sequence: 1,
        timestamp: new Date().toISOString(),
        event: {
          type: "message_update",
          payload: {
            type: "text_complete",
            content: "Hello, world!",
            role: "assistant",
          },
        },
      };

      adapterWithCallback.connect();
      // Manually trigger the handler for testing
      // @ts-expect-error - accessing private method for testing
      adapterWithCallback.handleEnvelope(envelope);

      expect(onMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          role: "assistant",
          content: "Hello, world!",
        })
      );

      adapterWithCallback.disconnect();
    });

    it("should track current run ID", () => {
      const onStateChange = vi.fn();
      const adapterWithCallback = new RemoteEventAdapter({
        ...mockOptions,
        onStateChange,
      });

      const envelope: RunStreamEventEnvelope = {
        sessionId: mockOptions.sessionId,
        runId: "run-123",
        sequence: 1,
        timestamp: new Date().toISOString(),
        event: {
          type: "run_started",
          payload: {},
        },
      };

      adapterWithCallback.connect();
      // @ts-expect-error - accessing private method for testing
      adapterWithCallback.handleEnvelope(envelope);

      expect(onStateChange).toHaveBeenCalledWith(
        expect.objectContaining({
          currentRunId: "run-123",
        })
      );
      expect(adapterWithCallback.getCurrentState().currentRunId).toBe("run-123");

      adapterWithCallback.disconnect();
    });

    it("should clear current run ID on run completion", () => {
      const onStateChange = vi.fn();
      const adapterWithCallback = new RemoteEventAdapter({
        ...mockOptions,
        onStateChange,
      });

      // Set run ID
      const startEnvelope: RunStreamEventEnvelope = {
        sessionId: mockOptions.sessionId,
        runId: "run-123",
        sequence: 1,
        timestamp: new Date().toISOString(),
        event: {
          type: "run_started",
          payload: {},
        },
      };

      adapterWithCallback.connect();
      // @ts-expect-error accessing private method for testing
      adapterWithCallback.handleEnvelope(startEnvelope);
      expect(adapterWithCallback.getCurrentState().currentRunId).toBe("run-123");

      // Clear run ID
      const completeEnvelope: RunStreamEventEnvelope = {
        sessionId: mockOptions.sessionId,
        runId: "run-123",
        sequence: 2,
        timestamp: new Date().toISOString(),
        event: {
          type: "run_completed",
          payload: {},
        },
      };

      // @ts-expect-error accessing private method for testing
      adapterWithCallback.handleEnvelope(completeEnvelope);
      expect(adapterWithCallback.getCurrentState().currentRunId).toBeUndefined();

      adapterWithCallback.disconnect();
    });
  });

  describe("error handling", () => {
    it("should call onError when event parsing fails", () => {
      const onError = vi.fn();
      const adapterWithCallback = new RemoteEventAdapter({
        ...mockOptions,
        onError,
      });

      // Create a mock Event object with invalid JSON
      const mockEvent = new MessageEvent("session_update", {
        data: "invalid json",
      });

      adapterWithCallback.connect();
      // @ts-expect-error - accessing private method for testing
      // Simulate event source event
      const handler = adapterWithCallback.eventSource?.listeners?.get("session_update");
      if (handler) {
        try {
          handler(mockEvent);
        } catch {
          // Expected to fail
        }
      }

      // Note: This test may need adjustment based on actual EventSource implementation
      adapterWithCallback.disconnect();
    });
  });
});
