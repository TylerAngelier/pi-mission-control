/**
 * Sidebar component - displays session list and run status indicators.
 */

import React from "react";
import type { SessionSummary, SessionStatus } from "../../session-store.js";

export interface SidebarProps {
  sessions: SessionSummary[];
  currentSessionId?: string;
  onSelectSession: (sessionId: string) => void;
  onCreateSession: () => void;
  isLoading?: boolean;
}

export const Sidebar: React.FC<SidebarProps> = ({
  sessions,
  currentSessionId,
  onSelectSession,
  onCreateSession,
  isLoading = false,
}) => {
  return (
    <div className="sidebar" data-testid="sidebar">
      <div className="sidebar__header">
        <h2 className="sidebar__title">Sessions</h2>
        <button
          className="sidebar__create-btn"
          onClick={onCreateSession}
          disabled={isLoading}
          data-testid="create-session-btn"
        >
          + New Session
        </button>
      </div>

      <div className="sidebar__content">
        {isLoading ? (
          <div className="sidebar__loading">Loading...</div>
        ) : sessions.length === 0 ? (
          <div className="sidebar__empty">No sessions yet</div>
        ) : (
          <ul className="sidebar__list">
            {sessions.map((session) => (
              <SidebarItem
                key={session.id}
                session={session}
                isActive={session.id === currentSessionId}
                onSelect={() => onSelectSession(session.id)}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

interface SidebarItemProps {
  session: SessionSummary;
  isActive: boolean;
  onSelect: () => void;
}

const SidebarItem: React.FC<SidebarItemProps> = ({ session, isActive, onSelect }) => {
  return (
    <li
      className={`sidebar-item sidebar-item--${session.status} ${isActive ? "sidebar-item--active" : ""}`}
      onClick={onSelect}
      data-testid="sidebar-item"
    >
      <div className="sidebar-item__header">
        <StatusIcon status={session.status} />
        <span className="sidebar-item__title">{session.title}</span>
      </div>
      <div className="sidebar-item__meta">
        <span className="sidebar-item__updated">{formatTimestamp(session.updatedAt)}</span>
      </div>
    </li>
  );
};

interface StatusIconProps {
  status: SessionStatus;
}

const StatusIcon: React.FC<StatusIconProps> = ({ status }) => {
  const icon = getStatusIcon(status);
  const color = getStatusColor(status);

  return (
    <span
      className={`sidebar-item__status sidebar-item__status--${status}`}
      style={{ color }}
      aria-label={status}
    >
      {icon}
    </span>
  );
};

function getStatusIcon(status: SessionStatus): string {
  switch (status) {
    case "idle":
      return "●";
    case "running":
      return "◐";
    case "waiting_approval":
      return "⚠";
    case "failed":
      return "✕";
  }
}

function getStatusColor(status: SessionStatus): string {
  switch (status) {
    case "idle":
      return "#6b7280"; // gray
    case "running":
      return "#10b981"; // green
    case "waiting_approval":
      return "#f59e0b"; // amber
    case "failed":
      return "#ef4444"; // red
  }
}

function formatTimestamp(timestamp: string): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString();
}
