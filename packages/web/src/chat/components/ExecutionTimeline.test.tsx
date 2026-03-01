/**
 * Tests for ExecutionTimeline component.
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ExecutionTimeline, toTimelineEvents, type TimelineEvent } from "./ExecutionTimeline.js";
import type { ToolCall, ExecutionEvent } from "../types.js";

describe("ExecutionTimeline", () => {
  const mockTimelineEvents: TimelineEvent[] = [
    {
      id: "event-1",
      timestamp: "2026-02-28T12:00:00.000Z",
      type: "state_change",
      title: "Run Started",
      description: "Agent execution began",
    },
    {
      id: "event-2",
      timestamp: "2026-02-28T12:01:00.000Z",
      type: "message",
      title: "Agent Message",
      description: "Agent sent a message",
    },
  ];

  const mockToolCalls: ToolCall[] = [
    {
      id: "tc-1",
      tool: "bash",
      input: { command: "ls -la" },
      status: "completed",
      timestamp: "2026-02-28T12:02:00.000Z",
      output: "file1.txt\nfile2.txt",
    },
  ];

  describe("rendering", () => {
    it("should render timeline when expanded", () => {
      render(
        <ExecutionTimeline
          events={mockTimelineEvents}
          toolCalls={mockToolCalls}
          isExpanded={true}
        />
      );

      expect(screen.getByText("Execution Timeline")).toBeInTheDocument();
      expect(screen.getByText("Run Started")).toBeInTheDocument();
      expect(screen.getByText("Agent Message")).toBeInTheDocument();
    });

    it("should render collapsed state with toggle button", () => {
      render(
        <ExecutionTimeline
          events={mockTimelineEvents}
          toolCalls={mockToolCalls}
          isExpanded={false}
          onToggle={vi.fn()}
        />
      );

      expect(screen.getByText("Show Timeline (3)")).toBeInTheDocument();
      expect(screen.queryByText("Execution Timeline")).not.toBeInTheDocument();
    });

    it("should render empty state when no events", () => {
      render(
        <ExecutionTimeline
          events={[]}
          toolCalls={[]}
          isExpanded={true}
        />
      );

      expect(screen.getByText("No events yet")).toBeInTheDocument();
    });
  });

  describe("interactions", () => {
    it("should call onToggle when clicking collapse button", () => {
      const onToggle = vi.fn();
      render(
        <ExecutionTimeline
          events={mockTimelineEvents}
          toolCalls={mockToolCalls}
          isExpanded={true}
          onToggle={onToggle}
        />
      );

      const toggleButton = screen.getByTestId("toggle-timeline");
      fireEvent.click(toggleButton);

      expect(onToggle).toHaveBeenCalled();
    });

    it("should call onToggle when clicking expand button", () => {
      const onToggle = vi.fn();
      render(
        <ExecutionTimeline
          events={mockTimelineEvents}
          toolCalls={mockToolCalls}
          isExpanded={false}
          onToggle={onToggle}
        />
      );

      const toggleButton = screen.getByTestId("toggle-timeline");
      fireEvent.click(toggleButton);

      expect(onToggle).toHaveBeenCalled();
    });

    it("should display details JSON when event has details", () => {
      const eventWithDetails: TimelineEvent = {
        id: "event-details",
        timestamp: "2026-02-28T12:00:00.000Z",
        type: "tool_call",
        title: "Tool: read",
        details: { file: "test.txt" },
      };

      render(
        <ExecutionTimeline
          events={[eventWithDetails]}
          toolCalls={[]}
          isExpanded={true}
        />
      );

      expect(screen.getByText("View Details")).toBeInTheDocument();
      // Check that JSON is rendered in the details content
      const jsonContent = screen.getByText(/"file":/);
      expect(jsonContent).toBeInTheDocument();
    });
  });

  describe("event rendering", () => {
    it("should render events sorted by timestamp descending", () => {
      const events: TimelineEvent[] = [
        { id: "1", timestamp: "2026-02-28T10:00:00.000Z", type: "message", title: "Earlier" },
        { id: "2", timestamp: "2026-02-28T12:00:00.000Z", type: "message", title: "Later" },
      ];

      render(
        <ExecutionTimeline events={events} toolCalls={[]} isExpanded={true} />
      );

      const items = screen.getAllByTestId("timeline-item");
      expect(items[0]).toHaveTextContent("Later");
      expect(items[1]).toHaveTextContent("Earlier");
    });

    it("should display correct icons for different event types", () => {
      const events: TimelineEvent[] = [
        { id: "1", timestamp: "2026-02-28T12:00:00.000Z", type: "message", title: "Message" },
        { id: "2", timestamp: "2026-02-28T12:00:00.000Z", type: "tool_call", title: "Tool Call" },
        { id: "3", timestamp: "2026-02-28T12:00:00.000Z", type: "state_change", title: "State Change" },
      ];

      render(
        <ExecutionTimeline events={events} toolCalls={[]} isExpanded={true} />
      );

      expect(screen.getByText("💬")).toBeInTheDocument();
      expect(screen.getByText("🔧")).toBeInTheDocument();
      expect(screen.getByText("🔄")).toBeInTheDocument();
    });
  });

  describe("status display", () => {
    it("should display failed status with error icon", () => {
      const events: TimelineEvent[] = [
        {
          id: "1",
          timestamp: "2026-02-28T12:00:00.000Z",
          type: "tool_call",
          title: "Failed Tool",
          status: "failed",
        },
      ];

      render(
        <ExecutionTimeline events={events} toolCalls={[]} isExpanded={true} />
      );

      expect(screen.getByText("✕")).toBeInTheDocument();
    });

    it("should display pending status with dots icon", () => {
      const events: TimelineEvent[] = [
        {
          id: "1",
          timestamp: "2026-02-28T12:00:00.000Z",
          type: "tool_call",
          title: "Pending Tool",
          status: "pending",
        },
      ];

      render(
        <ExecutionTimeline events={events} toolCalls={[]} isExpanded={true} />
      );

      expect(screen.getByText("⋯")).toBeInTheDocument();
    });
  });
});

describe("toTimelineEvents helper", () => {
  const mockExecutionEvents: ExecutionEvent[] = [
    {
      id: "evt-1",
      type: "run_started",
      timestamp: "2026-02-28T12:00:00.000Z",
      data: { runId: "run-123" },
    },
    {
      id: "evt-2",
      type: "approval_required",
      timestamp: "2026-02-28T12:01:00.000Z",
      data: { tool: "bash", riskLevel: "high", summary: "Dangerous command" },
    },
    {
      id: "evt-3",
      type: "run_failed",
      timestamp: "2026-02-28T12:02:00.000Z",
      data: { errorCode: "TIMEOUT" },
    },
  ];

  const mockToolCalls: ToolCall[] = [
    {
      id: "tc-1",
      tool: "read",
      input: { path: "file.txt" },
      status: "completed",
      timestamp: "2026-02-28T12:00:30.000Z",
      output: "file content",
    },
  ];

  it("should convert execution events to timeline events", () => {
    const result = toTimelineEvents(mockExecutionEvents, []);

    expect(result).toHaveLength(3);
    expect(result.at(0)?.title).toBe("Run Failed");
    expect(result.at(1)?.title).toBe("Approval Required");
    expect(result.at(2)?.title).toBe("Run Started");
  });

  it("should convert tool calls to timeline events", () => {
    const result = toTimelineEvents([], mockToolCalls);

    expect(result).toHaveLength(1);
    expect(result.at(0)?.type).toBe("tool_output");
    expect(result.at(0)?.title).toBe("Tool: read");
  });

  it("should merge and sort events by timestamp", () => {
    const result = toTimelineEvents(mockExecutionEvents, mockToolCalls);

    expect(result).toHaveLength(4);

    // Should be sorted descending (newest first)
    expect(result.at(0)?.title).toBe("Run Failed");
    expect(result.at(3)?.title).toBe("Run Started");
  });

  it("should set correct severity for approval events", () => {
    const result = toTimelineEvents(mockExecutionEvents, []);

    const approvalEvent = result.find((e) => e.type === "approval");
    expect(approvalEvent?.severity).toBe("warning");
  });

  it("should set correct severity for failed tool calls", () => {
    const failedToolCall: ToolCall = {
      id: "tc-failed",
      tool: "bash",
      input: {},
      status: "failed",
      timestamp: "2026-02-28T12:00:00.000Z",
      error: "Command failed",
    };

    const result = toTimelineEvents([], [failedToolCall]);

    expect(result.at(0)?.severity).toBe("error");
  });
});
