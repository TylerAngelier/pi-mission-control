/**
 * ExecutionTimeline component - displays chronological timeline of tool calls, logs, and state transitions.
 */

import React from "react";
import type { ToolCall, ExecutionEvent } from "../types.js";

export interface TimelineEvent {
  id: string;
  timestamp: string;
  type: "message" | "tool_call" | "tool_output" | "state_change" | "approval" | "error";
  title: string;
  description?: string;
  details?: Record<string, unknown>;
  status?: "pending" | "completed" | "failed";
  severity?: "info" | "warning" | "error";
}

export interface ExecutionTimelineProps {
  events: TimelineEvent[];
  toolCalls: ToolCall[];
  isExpanded?: boolean;
  onToggle?: () => void;
}

export const ExecutionTimeline: React.FC<ExecutionTimelineProps> = ({
  events,
  toolCalls,
  isExpanded = true,
  onToggle,
}) => {
  // Merge timeline events with tool calls for comprehensive view
  const timelineEvents = React.useMemo(() => {
    const merged: TimelineEvent[] = [...events];

    // Add tool calls that aren't already in the timeline
    toolCalls.forEach((toolCall) => {
      const exists = merged.some(
        (e) => e.type === "tool_call" && e.id === toolCall.id
      );

      if (!exists) {
        merged.push({
          id: toolCall.id,
          timestamp: toolCall.timestamp,
          type: "tool_call",
          title: `Tool: ${toolCall.tool}`,
          description: toolCall.status === "pending"
            ? "Tool execution in progress"
            : toolCall.status === "completed"
            ? "Tool completed successfully"
            : "Tool execution failed",
          details: {
            tool: toolCall.tool,
            input: toolCall.input,
            output: toolCall.output,
            error: toolCall.error,
          },
          status: toolCall.status,
          severity: toolCall.status === "failed" ? "error" : "info",
        });
      }
    });

    // Sort by timestamp descending (newest first)
    return merged.sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  }, [events, toolCalls]);

  if (!isExpanded) {
    return (
      <div className="execution-timeline execution-timeline--collapsed" data-testid="execution-timeline">
        <button
          className="execution-timeline__toggle"
          onClick={onToggle}
          data-testid="toggle-timeline"
        >
          <span className="execution-timeline__toggle-icon">▶</span>
          <span className="execution-timeline__toggle-text">Show Timeline ({timelineEvents.length})</span>
        </button>
      </div>
    );
  }

  return (
    <div className="execution-timeline" data-testid="execution-timeline">
      <div className="execution-timeline__header">
        <h3 className="execution-timeline__title">Execution Timeline</h3>
        <button
          className="execution-timeline__toggle"
          onClick={onToggle}
          data-testid="toggle-timeline"
        >
          <span className="execution-timeline__toggle-icon">▼</span>
          <span className="execution-timeline__toggle-text">Collapse</span>
        </button>
      </div>

      <div className="execution-timeline__content">
        {timelineEvents.length === 0 ? (
          <div className="execution-timeline__empty">No events yet</div>
        ) : (
          <ul className="execution-timeline__list">
            {timelineEvents.map((event) => (
              <TimelineItem key={event.id} event={event} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

interface TimelineItemProps {
  event: TimelineEvent;
}

const TimelineItem: React.FC<TimelineItemProps> = ({ event }) => {
  const icon = getEventIcon(event.type, event.status);
  const color = getEventColor(event.severity, event.status);

  return (
    <li
      className={`timeline-item timeline-item--${event.type} timeline-item--${event.severity || "info"}`}
      data-testid="timeline-item"
    >
      <div className="timeline-item__marker" style={{ color }}>
        {icon}
      </div>

      <div className="timeline-item__content">
        <div className="timeline-item__header">
          <span className="timeline-item__title">{event.title}</span>
          <span className="timeline-item__timestamp">{formatTimestamp(event.timestamp)}</span>
        </div>

        {event.description && (
          <div className="timeline-item__description">{event.description}</div>
        )}

        {event.details && Object.keys(event.details).length > 0 && (
          <details className="timeline-item__details">
            <summary className="timeline-item__details-toggle">View Details</summary>
            <pre className="timeline-item__details-content">
              {JSON.stringify(event.details, null, 2)}
            </pre>
          </details>
        )}
      </div>
    </li>
  );
};

function getEventIcon(type: TimelineEvent["type"], status?: TimelineEvent["status"]): string {
  if (status === "failed") return "✕";
  if (status === "pending") return "⋯";

  switch (type) {
    case "message":
      return "💬";
    case "tool_call":
      return "🔧";
    case "tool_output":
      return "📤";
    case "state_change":
      return "🔄";
    case "approval":
      return "⚠";
    case "error":
      return "❌";
    default:
      return "•";
  }
}

function getEventColor(severity?: TimelineEvent["severity"], status?: TimelineEvent["status"]): string {
  if (status === "failed") return "#ef4444"; // red
  if (status === "pending") return "#9ca3af"; // gray

  switch (severity) {
    case "error":
      return "#ef4444"; // red
    case "warning":
      return "#f59e0b"; // amber
    case "info":
    default:
      return "#3b82f6"; // blue
  }
}

function formatTimestamp(timestamp: string): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

/**
 * Helper function to convert ExecutionEvent and ToolCall to TimelineEvent.
 */
export function toTimelineEvents(
  executionEvents: ExecutionEvent[],
  toolCalls: ToolCall[]
): TimelineEvent[] {
  const timelineEvents: TimelineEvent[] = executionEvents.map((evt) => ({
    id: evt.id,
    timestamp: evt.timestamp,
    type: evt.type === "run_started" || evt.type === "run_completed" || evt.type === "run_failed"
      ? "state_change"
      : evt.type === "approval_required" || evt.type === "approval_decided"
      ? "approval"
      : "message",
    title: formatEventTitle(evt.type, evt.data),
    description: formatEventDescription(evt.type, evt.data),
    details: evt.data,
    severity: evt.type === "approval_required" ? "warning" : "info",
  }));

  // Add tool calls
  toolCalls.forEach((toolCall) => {
    timelineEvents.push({
      id: toolCall.id,
      timestamp: toolCall.timestamp,
      type: toolCall.output || toolCall.error ? "tool_output" : "tool_call",
      title: `Tool: ${toolCall.tool}`,
      description: toolCall.status === "pending"
        ? "Tool execution in progress"
        : toolCall.status === "completed"
        ? "Tool completed successfully"
        : "Tool execution failed",
      details: {
        tool: toolCall.tool,
        input: toolCall.input,
        output: toolCall.output,
        error: toolCall.error,
      },
      status: toolCall.status,
      severity: toolCall.status === "failed" ? "error" : "info",
    });
  });

  // Sort by timestamp descending
  return timelineEvents.sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );
}

function formatEventTitle(type: string, data: Record<string, unknown>): string {
  switch (type) {
    case "run_started":
      return "Run Started";
    case "run_completed":
      return "Run Completed";
    case "run_failed":
      return "Run Failed";
    case "approval_required":
      return "Approval Required";
    case "approval_decided": {
      const decision = data.decision === "approved" ? "Approved" : "Rejected";
      return `Approval ${decision}`;
    }
    default:
      return type;
  }
}

function formatEventDescription(type: string, data: Record<string, unknown>): string | undefined {
  switch (type) {
    case "approval_required":
      return `Tool: ${String(data.tool || "unknown")}, Risk: ${String(data.riskLevel || "unknown")}`;
    case "approval_decided":
      return `By: ${String(data.actorId || "unknown")}`;
    case "run_failed":
      return `Error: ${String(data.errorCode || "unknown")}`;
    default:
      return undefined;
  }
}
