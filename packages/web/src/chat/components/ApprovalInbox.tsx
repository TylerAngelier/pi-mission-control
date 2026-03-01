/**
 * ApprovalInbox component - manages queue of approval requests and displays active dialog.
 */

import React, { useEffect, useState } from "react";
import type { ApprovalRequiredEvent } from "../types.js";
import { ApprovalDialog } from "./ApprovalDialog.js";

export interface ApprovalInboxProps {
  approvals: ApprovalRequiredEvent[];
  onApprove: (approvalId: string, reason?: string) => Promise<void>;
  onReject: (approvalId: string, reason?: string) => Promise<void>;
}

export const ApprovalInbox: React.FC<ApprovalInboxProps> = ({
  approvals,
  onApprove,
  onReject,
}) => {
  const [activeApprovalId, setActiveApprovalId] = useState<string | null>(null);

  // Find the next pending approval
  const activeApproval = React.useMemo(() => {
    if (activeApprovalId) {
      return approvals.find((a) => a.approvalId === activeApprovalId) || null;
    }
    // If no active approval, show the first pending one
    return approvals.find((a) => isPendingApproval(a)) || null;
  }, [approvals, activeApprovalId]);

  // Auto-select first approval when approvals change
  useEffect(() => {
    if (!activeApprovalId && activeApproval) {
      setActiveApprovalId(activeApproval.approvalId);
    }
  }, [approvals, activeApprovalId, activeApproval]);

  const handleApprove = async (reason?: string) => {
    if (!activeApproval) return;

    try {
      await onApprove(activeApproval.approvalId, reason);
      // Move to next approval or clear
      moveToNext();
    } catch (error) {
      console.error("Failed to approve:", error);
    }
  };

  const handleReject = async (reason?: string) => {
    if (!activeApproval) return;

    try {
      await onReject(activeApproval.approvalId, reason);
      // Move to next approval or clear
      moveToNext();
    } catch (error) {
      console.error("Failed to reject:", error);
    }
  };

  const handleCancel = () => {
    setActiveApprovalId(null);
  };

  const moveToNext = () => {
    // Find current index
    const currentIndex = approvals.findIndex(
      (a) => a.approvalId === activeApprovalId
    );

    // Find next pending approval
    const nextApproval = approvals
      .slice(currentIndex + 1)
      .find(isPendingApproval);

    setActiveApprovalId(nextApproval?.approvalId || null);
  };

  // Calculate pending count
  const pendingCount = approvals.filter(isPendingApproval).length;

  return (
    <>
      {/* Active approval dialog */}
      <ApprovalDialog
        isOpen={!!activeApproval}
        approval={activeApproval}
        onApprove={handleApprove}
        onReject={handleReject}
        onCancel={handleCancel}
      />

      {/* Approval count indicator */}
      {pendingCount > 0 && (
        <div className="approval-inbox" data-testid="approval-inbox">
          <span className="approval-inbox__badge">
            ⚠ {pendingCount} Pending Approval{pendingCount !== 1 ? "s" : ""}
          </span>
        </div>
      )}
    </>
  );
};

/**
 * Check if an approval is still pending (not decided).
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function isPendingApproval(_approval: ApprovalRequiredEvent): boolean {
  // In a real implementation, you would check if the approval exists in the approvals list
  // and has not been decided yet. For now, we assume all approvals in the list are pending.
  return true;
}

/**
 * Hook to manage approval inbox state.
 */
export function useApprovalInbox() {
  const [approvals, setApprovals] = useState<ApprovalRequiredEvent[]>([]);

  const addApproval = (approval: ApprovalRequiredEvent) => {
    setApprovals((prev) => [...prev, approval]);
  };

  const removeApproval = (approvalId: string) => {
    setApprovals((prev) => prev.filter((a) => a.approvalId !== approvalId));
  };

  return {
    approvals,
    addApproval,
    removeApproval,
    clearApprovals: () => setApprovals([]),
  };
}
