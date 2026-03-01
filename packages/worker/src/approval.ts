type ApprovalDecisionState = "approved" | "rejected" | "expired";

export interface ApprovalRequest {
  runId: string;
  approvalId: string;
  timeoutMs: number;
}

export interface ApprovalDecision {
  state: ApprovalDecisionState;
  actorId: string | null;
  reason: string | null;
  decidedAt: string;
}

export interface ApprovalController {
  waitForDecision(input: ApprovalRequest): Promise<ApprovalDecision>;
}

interface PendingApproval {
  request: ApprovalRequest;
  resolve: (decision: ApprovalDecision) => void;
  timeout: NodeJS.Timeout;
}

const toPendingApprovalKey = (runId: string, approvalId: string): string =>
  `${runId}:${approvalId}`;

export class InMemoryApprovalController implements ApprovalController {
  private readonly pending = new Map<string, PendingApproval>();

  constructor(private readonly now: () => Date = () => new Date()) {}

  async waitForDecision(input: ApprovalRequest): Promise<ApprovalDecision> {
    const key = toPendingApprovalKey(input.runId, input.approvalId);

    if (this.pending.has(key)) {
      throw new Error("Approval is already pending");
    }

    return new Promise<ApprovalDecision>((resolve) => {
      const timeout = setTimeout(() => {
        this.pending.delete(key);
        resolve({
          state: "expired",
          actorId: null,
          reason: "Approval request timed out",
          decidedAt: this.now().toISOString(),
        });
      }, input.timeoutMs);

      this.pending.set(key, {
        request: input,
        resolve,
        timeout,
      });
    });
  }

  approve(input: {
    runId: string;
    approvalId: string;
    actorId: string;
    reason?: string;
  }): void {
    this.resolvePendingApproval({
      runId: input.runId,
      approvalId: input.approvalId,
      state: "approved",
      actorId: input.actorId,
      reason: input.reason,
    });
  }

  reject(input: {
    runId: string;
    approvalId: string;
    actorId: string;
    reason?: string;
  }): void {
    this.resolvePendingApproval({
      runId: input.runId,
      approvalId: input.approvalId,
      state: "rejected",
      actorId: input.actorId,
      reason: input.reason,
    });
  }

  private resolvePendingApproval(input: {
    runId: string;
    approvalId: string;
    state: "approved" | "rejected";
    actorId: string;
    reason?: string;
  }): void {
    const key = toPendingApprovalKey(input.runId, input.approvalId);
    const pending = this.pending.get(key);
    if (!pending) {
      throw new Error("Approval not pending");
    }

    clearTimeout(pending.timeout);
    this.pending.delete(key);

    pending.resolve({
      state: input.state,
      actorId: input.actorId,
      reason: input.reason ?? null,
      decidedAt: this.now().toISOString(),
    });
  }
}
