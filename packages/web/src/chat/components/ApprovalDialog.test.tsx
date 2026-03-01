/**
 * Tests for ApprovalDialog component.
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ApprovalDialog } from "./ApprovalDialog.js";
import type { ApprovalRequiredEvent } from "../types.js";

describe("ApprovalDialog", () => {
  const mockApproval: ApprovalRequiredEvent = {
    approvalId: "approval-123",
    tool: "bash",
    riskLevel: "high",
    summary: "Execute shell command that modifies system files",
    payload: { command: "rm -rf /tmp" },
    expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(), // 10 minutes from now
  };

  const mockProps = {
    isOpen: true,
    approval: mockApproval,
    onApprove: vi.fn(),
    onReject: vi.fn(),
    onCancel: vi.fn(),
  };

  describe("rendering", () => {
    it("should render dialog when open and approval provided", () => {
      render(<ApprovalDialog {...mockProps} />);

      expect(screen.getByText("Approval Required")).toBeInTheDocument();
      expect(screen.getByText("HIGH RISK")).toBeInTheDocument();
      expect(screen.getByText(mockApproval.summary)).toBeInTheDocument();
    });

    it("should not render dialog when closed", () => {
      render(<ApprovalDialog {...mockProps} isOpen={false} />);

      expect(screen.queryByText("Approval Required")).not.toBeInTheDocument();
      expect(screen.queryByTestId("approval-dialog")).not.toBeInTheDocument();
    });

    it("should not render dialog when approval is null", () => {
      render(<ApprovalDialog {...mockProps} approval={null} />);

      expect(screen.queryByText("Approval Required")).not.toBeInTheDocument();
    });

    it("should display approval details", () => {
      render(<ApprovalDialog {...mockProps} />);

      expect(screen.getByText(/Tool:/i)).toBeInTheDocument();
      expect(screen.getByText(mockApproval.tool)).toBeInTheDocument();
      expect(screen.getByText(/Approval ID:/i)).toBeInTheDocument();
    });

    it("should display expires soon warning when approval expires in < 5 minutes", () => {
      const expiringApproval: ApprovalRequiredEvent = {
        ...mockApproval,
        expiresAt: new Date(Date.now() + 4 * 60 * 1000).toISOString(), // 4 minutes
      };

      render(<ApprovalDialog {...mockProps} approval={expiringApproval} />);

      expect(screen.getByText("⏰ Expires soon")).toBeInTheDocument();
    });

    it("should not display expires soon warning when approval expires in > 5 minutes", () => {
      render(<ApprovalDialog {...mockProps} />);

      expect(screen.queryByText("⏰ Expires soon")).not.toBeInTheDocument();
    });
  });

  describe("interactions", () => {
    it("should call onCancel when clicking close button", () => {
      render(<ApprovalDialog {...mockProps} />);

      const closeButton = screen.getByTestId("close-approval-dialog");
      fireEvent.click(closeButton);

      expect(mockProps.onCancel).toHaveBeenCalledTimes(1);
    });

    it("should call onApprove when clicking approve button", async () => {
      const onApprove = vi.fn().mockResolvedValue(undefined);
      render(<ApprovalDialog {...mockProps} onApprove={onApprove} />);

      const approveButton = screen.getByTestId("approve-approval");
      fireEvent.click(approveButton);

      await waitFor(() => {
        expect(onApprove).toHaveBeenCalledTimes(1);
      });
    });

    it("should call onReject when clicking reject button", async () => {
      const onReject = vi.fn().mockResolvedValue(undefined);
      render(<ApprovalDialog {...mockProps} onReject={onReject} />);

      const rejectButton = screen.getByTestId("reject-approval");
      fireEvent.click(rejectButton);

      await waitFor(() => {
        expect(onReject).toHaveBeenCalledTimes(1);
      });
    });

    it("should pass reason to onApprove when provided", async () => {
      const onApprove = vi.fn().mockResolvedValue(undefined);
      render(<ApprovalDialog {...mockProps} onApprove={onApprove} />);

      const reasonInput = screen.getByTestId("approval-reason-input");
      fireEvent.change(reasonInput, { target: { value: "This is safe" } });

      const approveButton = screen.getByTestId("approve-approval");
      fireEvent.click(approveButton);

      await waitFor(() => {
        expect(onApprove).toHaveBeenCalledWith("This is safe");
      });
    });

    it("should pass reason to onReject when provided", async () => {
      const onReject = vi.fn().mockResolvedValue(undefined);
      render(<ApprovalDialog {...mockProps} onReject={onReject} />);

      const reasonInput = screen.getByTestId("approval-reason-input");
      fireEvent.change(reasonInput, { target: { value: "Too risky" } });

      const rejectButton = screen.getByTestId("reject-approval");
      fireEvent.click(rejectButton);

      await waitFor(() => {
        expect(onReject).toHaveBeenCalledWith("Too risky");
      });
    });

    it("should disable buttons while submitting", async () => {
      const onApprove = vi.fn().mockImplementation(() => new Promise((resolve) => setTimeout(resolve, 100)));
      render(<ApprovalDialog {...mockProps} onApprove={onApprove} />);

      const approveButton = screen.getByTestId("approve-approval");
      const rejectButton = screen.getByTestId("reject-approval");
      const closeBtn = screen.getByTestId("close-approval-dialog");

      // Initially enabled
      expect(approveButton).not.toBeDisabled();
      expect(rejectButton).not.toBeDisabled();
      expect(closeBtn).not.toBeDisabled();

      // Click to start submission
      fireEvent.click(approveButton);

      // Wait a bit for state to update
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Buttons should be disabled while submitting
      expect(approveButton).toBeDisabled();
      expect(rejectButton).toBeDisabled();
      expect(closeBtn).toBeDisabled();
      expect(screen.getByText("Approving...")).toBeInTheDocument();

      // Wait for submission to complete
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Wait a bit for state to update
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Buttons should be enabled again after submission
      expect(approveButton).not.toBeDisabled();
      expect(rejectButton).not.toBeDisabled();
    });
  });

  describe("risk levels", () => {
    it.each([
      ["low", "LOW RISK"],
      ["medium", "MEDIUM RISK"],
      ["high", "HIGH RISK"],
    ] as const)(
      "should display correct risk badge for %s",
      (riskLevel, expectedBadge) => {
        const approval: ApprovalRequiredEvent = {
          ...mockApproval,
          riskLevel,
        };

        render(<ApprovalDialog {...mockProps} approval={approval} />);

        expect(screen.getByText(expectedBadge)).toBeInTheDocument();
      }
    );
  });

  describe("payload display", () => {
    it("should display payload when present", () => {
      render(<ApprovalDialog {...mockProps} />);

      expect(screen.getByText("View Payload")).toBeInTheDocument();
      expect(screen.getByText(mockApproval.tool)).toBeInTheDocument();
    });

    it("should not display payload section when payload is empty", () => {
      const approval: ApprovalRequiredEvent = {
        ...mockApproval,
        payload: {},
      };

      render(<ApprovalDialog {...mockProps} approval={approval} />);

      expect(screen.queryByText("View Payload")).not.toBeInTheDocument();
    });
  });
});
