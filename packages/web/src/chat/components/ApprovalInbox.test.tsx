/**
 * Tests for ApprovalInbox component.
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { ApprovalInbox } from "./ApprovalInbox.js";
import type { ApprovalRequiredEvent } from "../types.js";

describe("ApprovalInbox", () => {
  const mockApprovals: ApprovalRequiredEvent[] = [
    {
      approvalId: "approval-1",
      tool: "bash",
      riskLevel: "high",
      summary: "Execute high-risk command",
      payload: { command: "rm -rf /tmp" },
      expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    },
    {
      approvalId: "approval-2",
      tool: "write",
      riskLevel: "medium",
      summary: "Write to system file",
      payload: { path: "/etc/config", content: "data" },
      expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    },
    {
      approvalId: "approval-3",
      tool: "edit",
      riskLevel: "low",
      summary: "Edit configuration file",
      payload: { path: "/config.json", changes: {} },
      expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    },
  ];

  const mockProps = {
    approvals: mockApprovals,
    onApprove: vi.fn().mockResolvedValue(undefined),
    onReject: vi.fn().mockResolvedValue(undefined),
  };

  describe("rendering", () => {
    it("should display pending approval badge when approvals exist", () => {
      render(<ApprovalInbox {...mockProps} />);

      expect(screen.getByTestId("approval-inbox")).toBeInTheDocument();
      expect(screen.getByText(/3 Pending Approvals/i)).toBeInTheDocument();
    });

    it("should display singular form for single approval", () => {
      render(<ApprovalInbox {...mockProps} approvals={[mockApprovals[0]]} />);

      expect(screen.getByText(/1 Pending Approval/i)).toBeInTheDocument();
    });

    it("should not display badge when no approvals", () => {
      render(<ApprovalInbox {...mockProps} approvals={[]} />);

      expect(screen.queryByTestId("approval-inbox")).not.toBeInTheDocument();
    });

    it("should open dialog for first approval", () => {
      render(<ApprovalInbox {...mockProps} />);

      expect(screen.getByText("Approval Required")).toBeInTheDocument();
      expect(screen.getByText(mockApprovals.at(0)!.summary)).toBeInTheDocument();
    });
  });

  describe("interactions", () => {
    it("should call onApprove with correct approval ID", async () => {
      const onApprove = vi.fn().mockResolvedValue(undefined);
      render(<ApprovalInbox {...mockProps} onApprove={onApprove} />);

      const approveButton = screen.getByTestId("approve-approval");
      approveButton.click();

      await waitFor(() => {
        expect(onApprove).toHaveBeenCalled();
      });
    });

    it("should call onReject with correct approval ID", async () => {
      const onReject = vi.fn().mockResolvedValue(undefined);
      render(<ApprovalInbox {...mockProps} onReject={onReject} />);

      const rejectButton = screen.getByTestId("reject-approval");
      rejectButton.click();

      await waitFor(() => {
        expect(onReject).toHaveBeenCalled();
      });
    });
  });
});
