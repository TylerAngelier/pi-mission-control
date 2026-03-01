/**
 * ApprovalDialog component - displays pending approval requests and handles approve/reject actions.
 */

import React, { useState } from "react";
import type { ApprovalRequiredEvent } from "../types.js";

export interface ApprovalDialogProps {
  isOpen: boolean;
  approval: ApprovalRequiredEvent | null;
  onApprove: (reason?: string) => void;
  onReject: (reason?: string) => void;
  onCancel: () => void;
}

export const ApprovalDialog: React.FC<ApprovalDialogProps> = ({
  isOpen,
  approval,
  onApprove,
  onReject,
  onCancel,
}) => {
  const [reason, setReason] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen || !approval) {
    return null;
  }

  const handleApprove = async () => {
    setIsSubmitting(true);
    try {
      await onApprove(reason || undefined);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReject = async () => {
    setIsSubmitting(true);
    try {
      await onReject(reason || undefined);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    if (!isSubmitting) {
      setReason("");
      onCancel();
    }
  };

  const isExpiringSoon = new Date(approval.expiresAt) < new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

  return (
    <div className="approval-dialog-overlay" data-testid="approval-dialog-overlay">
      <div className="approval-dialog" data-testid="approval-dialog">
        <div className="approval-dialog__header">
          <h2 className="approval-dialog__title">Approval Required</h2>
          <button
            className="approval-dialog__close"
            onClick={handleClose}
            disabled={isSubmitting}
            data-testid="close-approval-dialog"
            aria-label="Close dialog"
          >
            ✕
          </button>
        </div>

        <div className="approval-dialog__content">
          <div className="approval-dialog__risk">
            <span className={`approval-dialog__risk-badge approval-dialog__risk-badge--${approval.riskLevel}`}>
              {approval.riskLevel.toUpperCase()} RISK
            </span>
            {isExpiringSoon && (
              <span className="approval-dialog__expires-soon">
                ⏰ Expires soon
              </span>
            )}
          </div>

          <div className="approval-dialog__summary">
            <h3 className="approval-dialog__summary-title">Summary</h3>
            <p className="approval-dialog__summary-text">{approval.summary}</p>
          </div>

          <div className="approval-dialog__details">
            <h4 className="approval-dialog__details-title">Action Details</h4>
            <div className="approval-dialog__detail-row">
              <span className="approval-dialog__detail-label">Tool:</span>
              <span className="approval-dialog__detail-value">{approval.tool}</span>
            </div>

            <div className="approval-dialog__detail-row">
              <span className="approval-dialog__detail-label">Expires:</span>
              <span className="approval-dialog__detail-value">
                {formatTimestamp(approval.expiresAt)}
              </span>
            </div>

            {approval.approvalId && (
              <div className="approval-dialog__detail-row">
                <span className="approval-dialog__detail-label">Approval ID:</span>
                <code className="approval-dialog__detail-value">{approval.approvalId.slice(0, 12)}...</code>
              </div>
            )}

            {Object.keys(approval.payload).length > 0 && (
              <div className="approval-dialog__payload">
                <details className="approval-dialog__payload-details">
                  <summary className="approval-dialog__payload-toggle">View Payload</summary>
                  <pre className="approval-dialog__payload-content">
                    {JSON.stringify(approval.payload, null, 2)}
                  </pre>
                </details>
              </div>
            )}
          </div>

          <div className="approval-dialog__reason">
            <label htmlFor="approval-reason" className="approval-dialog__reason-label">
              Reason (optional)
            </label>
            <textarea
              id="approval-reason"
              className="approval-dialog__reason-input"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Add a note explaining your decision..."
              rows={3}
              disabled={isSubmitting}
              data-testid="approval-reason-input"
            />
          </div>
        </div>

        <div className="approval-dialog__actions">
          <button
            className="approval-dialog__button approval-dialog__button--reject"
            onClick={handleReject}
            disabled={isSubmitting}
            data-testid="reject-approval"
          >
            {isSubmitting ? "Rejecting..." : "Reject"}
          </button>
          <button
            className="approval-dialog__button approval-dialog__button--approve"
            onClick={handleApprove}
            disabled={isSubmitting}
            data-testid="approve-approval"
          >
            {isSubmitting ? "Approving..." : "Approve"}
          </button>
        </div>
      </div>
    </div>
  );
};

function formatTimestamp(timestamp: string): string {
  const date = new Date(timestamp);
  return date.toLocaleString([], {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
