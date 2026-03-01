/**
 * Tests for Sidebar component.
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Sidebar } from "./Sidebar.js";
import type { SessionSummary } from "../../session-store.js";

describe("Sidebar", () => {
  const mockSessions: SessionSummary[] = [
    {
      id: "session-1",
      title: "Test Session 1",
      status: "idle",
      updatedAt: new Date(Date.now() - 300000).toISOString(), // 5 minutes ago
    },
    {
      id: "session-2",
      title: "Test Session 2",
      status: "running",
      updatedAt: new Date(Date.now() - 60000).toISOString(), // 1 minute ago
    },
    {
      id: "session-3",
      title: "Test Session 3",
      status: "waiting_approval",
      updatedAt: new Date(Date.now() - 120000).toISOString(), // 2 minutes ago
    },
  ];

  describe("rendering", () => {
    it("should render session list", () => {
      render(
        <Sidebar
          sessions={mockSessions}
          onSelectSession={vi.fn()}
          onCreateSession={vi.fn()}
        />
      );

      expect(screen.getByText("Sessions")).toBeInTheDocument();
      expect(screen.getByText("Test Session 1")).toBeInTheDocument();
      expect(screen.getByText("Test Session 2")).toBeInTheDocument();
      expect(screen.getByText("Test Session 3")).toBeInTheDocument();
    });

    it("should render empty state when no sessions", () => {
      render(
        <Sidebar
          sessions={[]}
          onSelectSession={vi.fn()}
          onCreateSession={vi.fn()}
        />
      );

      expect(screen.getByText("No sessions yet")).toBeInTheDocument();
    });

    it("should render loading state", () => {
      render(
        <Sidebar
          sessions={[]}
          onSelectSession={vi.fn()}
          onCreateSession={vi.fn()}
          isLoading={true}
        />
      );

      expect(screen.getByText("Loading...")).toBeInTheDocument();
    });

    it("should highlight active session", () => {
      render(
        <Sidebar
          sessions={mockSessions}
          currentSessionId="session-2"
          onSelectSession={vi.fn()}
          onCreateSession={vi.fn()}
        />
      );

      const activeItem = screen.getAllByTestId("sidebar-item").at(1);
      expect(activeItem).toHaveClass("sidebar-item--active");
    });
  });

  describe("interactions", () => {
    it("should call onSelectSession when clicking a session", () => {
      const onSelectSession = vi.fn();
      render(
        <Sidebar
          sessions={mockSessions}
          onSelectSession={onSelectSession}
          onCreateSession={vi.fn()}
        />
      );

      const sessionItems = screen.getAllByTestId("sidebar-item");
      fireEvent.click(sessionItems.at(0)!);

      expect(onSelectSession).toHaveBeenCalledWith("session-1");
    });

    it("should call onCreateSession when clicking create button", () => {
      const onCreateSession = vi.fn();
      render(
        <Sidebar
          sessions={mockSessions}
          onSelectSession={vi.fn()}
          onCreateSession={onCreateSession}
        />
      );

      const createButton = screen.getByTestId("create-session-btn");
      fireEvent.click(createButton);

      expect(onCreateSession).toHaveBeenCalled();
    });

    it("should disable create button when loading", () => {
      render(
        <Sidebar
          sessions={mockSessions}
          onSelectSession={vi.fn()}
          onCreateSession={vi.fn()}
          isLoading={true}
        />
      );

      const createButton = screen.getByTestId("create-session-btn");
      expect(createButton).toBeDisabled();
    });
  });

  describe("status icons", () => {
    it.each([
      ["idle", "●"],
      ["running", "◐"],
      ["waiting_approval", "⚠"],
      ["failed", "✕"],
    ] as const)(
      "should render correct icon for %s status",
      (status, expectedIcon) => {
        const session: SessionSummary = {
          id: "test-session",
          title: "Test",
          status,
          updatedAt: new Date().toISOString(),
        };

        render(
          <Sidebar
            sessions={[session]}
            onSelectSession={vi.fn()}
            onCreateSession={vi.fn()}
          />
        );

        expect(screen.getByText(expectedIcon)).toBeInTheDocument();
      }
    );
  });

  describe("timestamp formatting", () => {
    it("should format recent timestamps correctly", () => {
      const now = Date.now();
      const sessions: SessionSummary[] = [
        {
          id: "session-1",
          title: "Just now",
          status: "idle",
          updatedAt: new Date(now - 30000).toISOString(), // 30 seconds
        },
        {
          id: "session-2",
          title: "Minutes ago",
          status: "idle",
          updatedAt: new Date(now - 3600000).toISOString(), // 1 hour
        },
      ];

      render(
        <Sidebar
          sessions={sessions}
          onSelectSession={vi.fn()}
          onCreateSession={vi.fn()}
        />
      );

      expect(screen.getByText("just now")).toBeInTheDocument();
      expect(screen.getByText("1h ago")).toBeInTheDocument();
    });
  });
});
