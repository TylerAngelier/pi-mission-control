/**
 * ToolCall component - displays a tool execution with its status.
 */

import React from "react";
import type { ToolCall as ToolCallType } from "../types.js";

interface ToolCallProps {
  toolCall: ToolCallType;
}

export const ToolCall: React.FC<ToolCallProps> = ({ toolCall }) => {
  const { tool, input, output, error, status, timestamp } = toolCall;

  return (
    <div
      className={`tool-call tool-call--${status}`}
      data-testid="tool-call"
    >
      <div className="tool-call__header">
        <span className="tool-call__name">{tool}</span>
        <span className="tool-call__status">{formatStatus(status)}</span>
        <span className="tool-call__timestamp">{formatTimestamp(timestamp)}</span>
      </div>

      <div className="tool-call__details">
        <div className="tool-call__section">
          <h4 className="tool-call__section-title">Input</h4>
          <pre className="tool-call__json">
            {JSON.stringify(input, null, 2)}
          </pre>
        </div>

        {output && (
          <div className="tool-call__section">
            <h4 className="tool-call__section-title">Output</h4>
            <pre className="tool-call__json">
              {output}
            </pre>
          </div>
        )}

        {error && (
          <div className="tool-call__section tool-call__section--error">
            <h4 className="tool-call__section-title">Error</h4>
            <pre className="tool-call__json tool-call__json--error">
              {error}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
};

function formatStatus(status: ToolCallType["status"]): string {
  switch (status) {
    case "pending":
      return "⏳ Pending";
    case "completed":
      return "✅ Completed";
    case "failed":
      return "❌ Failed";
  }
}

function formatTimestamp(timestamp: string): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
