/**
 * Tests for RunStatus component.
 */

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { RunStatus } from "./RunStatus.js";

describe("RunStatus", () => {
  const baseProps = {
    runId: "test-run-123",
    status: "running" as const,
    startedAt: new Date().toISOString(),
  };

  describe("rendering", () => {
    it("should render run status when active", () => {
      render(<RunStatus {...baseProps} />);

      expect(screen.getByTestId("run-status")).toBeInTheDocument();
      expect(screen.getByText("Running")).toBeInTheDocument();
    });

    it("should render none status when no run ID", () => {
      render(<RunStatus status="queued" />);

      expect(screen.getByText("No active run")).toBeInTheDocument();
    });

    it("should render status label correctly", () => {
      const { rerender } = render(<RunStatus {...baseProps} status="queued" />);
      expect(screen.getByText("Queued")).toBeInTheDocument();

      rerender(<RunStatus {...baseProps} status="completed" />);
      expect(screen.getByText("Completed")).toBeInTheDocument();

      rerender(<RunStatus {...baseProps} status="failed" />);
      expect(screen.getByText("Failed")).toBeInTheDocument();
    });
  });

  describe("status icons", () => {
    it.each([
      ["queued", "⋯"],
      ["running", "◐"],
      ["waiting_approval", "⚠"],
      ["completed", "✓"],
      ["failed", "✕"],
      ["canceled", "⊝"],
      ["orphaned", "○"],
    ] as const)(
      "should render correct icon for %s status",
      (status, expectedIcon) => {
        render(<RunStatus {...baseProps} status={status} />);

        expect(screen.getByText(expectedIcon)).toBeInTheDocument();
      }
    );
  });

  describe("metadata display", () => {
    it("should display run ID", () => {
      render(<RunStatus {...baseProps} runId="abc123def456" />);

      expect(screen.getByText("abc123de")).toBeInTheDocument();
    });

    it("should display cost when provided", () => {
      render(<RunStatus {...baseProps} costUsd={0.0234} />);

      expect(screen.getByText(/0\.0234/)).toBeInTheDocument();
    });

    it("should display started time", () => {
      const startedAt = "2026-02-28T12:00:00.000Z";
      render(<RunStatus {...baseProps} startedAt={startedAt} />);

      expect(screen.getByText(/Started:/)).toBeInTheDocument();
    });

    it("should display finished time when provided", () => {
      const finishedAt = "2026-02-28T12:30:00.000Z";
      render(<RunStatus {...baseProps} finishedAt={finishedAt} />);

      expect(screen.getByText(/Finished:/)).toBeInTheDocument();
    });

    it("should display error code when provided", () => {
      render(<RunStatus {...baseProps} status="failed" errorCode="TIMEOUT_ERROR" />);

      expect(screen.getByText("Error: TIMEOUT_ERROR")).toBeInTheDocument();
    });
  });

  describe("edge cases", () => {
    it("should handle null cost", () => {
      render(<RunStatus {...baseProps} costUsd={null} />);

      expect(screen.queryByText(/Cost:/)).not.toBeInTheDocument();
    });

    it("should handle undefined cost", () => {
      render(<RunStatus {...baseProps} costUsd={undefined} />);

      expect(screen.queryByText(/Cost:/)).not.toBeInTheDocument();
    });

    it("should display cost with 4 decimal places", () => {
      render(<RunStatus {...baseProps} costUsd={0.12345} />);

      // Should format to 4 decimal places
      expect(screen.getByText(/0\.1235/)).toBeInTheDocument();
    });
  });
});
