/**
 * RunStatus component - displays current run status indicators.
 */

import React from "react";

export interface RunStatusProps {
  runId?: string;
  status?: "queued" | "running" | "waiting_approval" | "completed" | "failed" | "canceled" | "orphaned";
  costUsd?: number | null;
  startedAt?: string;
  finishedAt?: string | null;
  errorCode?: string | null;
}

export const RunStatus: React.FC<RunStatusProps> = ({
  runId,
  status,
  costUsd,
  startedAt,
  finishedAt,
  errorCode,
}) => {
  if (!runId || !status) {
    return <span className="run-status run-status--none" data-testid="run-status">No active run</span>;
  }

  return (
    <div className="run-status" data-testid="run-status">
      <div className="run-status__header">
        <StatusIcon status={status} />
        <span className="run-status__label">{getStatusLabel(status)}</span>
        <span className="run-status__id">{runId.slice(0, 8)}</span>
      </div>

      {(startedAt || finishedAt) && (
        <div className="run-status__times">
          {startedAt && (
            <span className="run-status__time">
              Started: {formatTime(startedAt)}
            </span>
          )}
          {finishedAt && (
            <span className="run-status__time">
              Finished: {formatTime(finishedAt)}
            </span>
          )}
        </div>
      )}

      {costUsd !== null && costUsd !== undefined && (
        <div className="run-status__cost">
          Cost: ${costUsd.toFixed(4)}
        </div>
      )}

      {errorCode && (
        <div className="run-status__error">
          Error: {errorCode}
        </div>
      )}
    </div>
  );
};

interface StatusIconProps {
  status: NonNullable<RunStatusProps["status"]>;
}

const StatusIcon: React.FC<StatusIconProps> = ({ status }) => {
  const icon = getStatusIcon(status);
  const color = getStatusColor(status);

  return (
    <span
      className="run-status__icon"
      style={{ color }}
      aria-label={status}
    >
      {icon}
    </span>
  );
};

function getStatusIcon(status: NonNullable<RunStatusProps["status"]>): string {
  switch (status) {
    case "queued":
      return "⋯";
    case "running":
      return "◐";
    case "waiting_approval":
      return "⚠";
    case "completed":
      return "✓";
    case "failed":
      return "✕";
    case "canceled":
      return "⊝";
    case "orphaned":
      return "○";
  }
}

function getStatusColor(status: NonNullable<RunStatusProps["status"]>): string {
  switch (status) {
    case "queued":
      return "#9ca3af"; // gray
    case "running":
      return "#10b981"; // green
    case "waiting_approval":
      return "#f59e0b"; // amber
    case "completed":
      return "#3b82f6"; // blue
    case "failed":
      return "#ef4444"; // red
    case "canceled":
      return "#6b7280"; // dark gray
    case "orphaned":
      return "#a855f7"; // purple
  }
}

function getStatusLabel(status: NonNullable<RunStatusProps["status"]>): string {
  switch (status) {
    case "queued":
      return "Queued";
    case "running":
      return "Running";
    case "waiting_approval":
      return "Waiting for Approval";
    case "completed":
      return "Completed";
    case "failed":
      return "Failed";
    case "canceled":
      return "Canceled";
    case "orphaned":
      return "Orphaned";
  }
}

function formatTime(timestamp: string): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
