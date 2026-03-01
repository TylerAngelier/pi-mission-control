import { Pool, type PoolClient } from "pg";

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

export interface MutableApprovalController extends ApprovalController {
  approve(input: {
    runId: string;
    approvalId: string;
    actorId: string;
    reason?: string;
  }): void | Promise<void>;
  reject(input: {
    runId: string;
    approvalId: string;
    actorId: string;
    reason?: string;
  }): void | Promise<void>;
}

interface PendingApproval {
  request: ApprovalRequest;
  resolve: (decision: ApprovalDecision) => void;
  timeout: NodeJS.Timeout;
}

const toPendingApprovalKey = (runId: string, approvalId: string): string =>
  `${runId}:${approvalId}`;

export class InMemoryApprovalController implements MutableApprovalController {
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

export interface PostgresApprovalControllerOptions {
  connectionString: string;
  pollIntervalMs?: number;
  now?: () => Date;
}

interface ApprovalRow {
  state: "pending" | "approved" | "rejected" | "expired";
  actor_id: string | null;
  reason: string | null;
  decided_at: Date | null;
}

export class PostgresApprovalController implements MutableApprovalController {
  private readonly pool: Pool;
  private readonly pollIntervalMs: number;
  private readonly now: () => Date;

  constructor(options: PostgresApprovalControllerOptions) {
    this.pool = new Pool({ connectionString: options.connectionString });
    this.pollIntervalMs = options.pollIntervalMs ?? 1000;
    this.now = options.now ?? (() => new Date());
  }

  async waitForDecision(input: ApprovalRequest): Promise<ApprovalDecision> {
    const existing = await this.fetchDecision(input.runId, input.approvalId);
    if (existing) {
      return existing;
    }

    const listener = await this.pool.connect();
    const channel = "approval_decided";

    await listener.query(`LISTEN ${channel}`);

    return new Promise<ApprovalDecision>((resolve) => {
      let settled = false;

      const cleanup = async (): Promise<void> => {
        clearInterval(pollTimer);
        clearTimeout(timeout);
        listener.removeListener("notification", onNotification);
        listener.removeListener("error", onError);
        try {
          await listener.query(`UNLISTEN ${channel}`);
        } finally {
          listener.release();
        }
      };

      const settle = (decision: ApprovalDecision): void => {
        if (settled) {
          return;
        }

        settled = true;
        void cleanup();
        resolve(decision);
      };

      const onNotification = async ({ payload }: { payload?: string }): Promise<void> => {
        if (!payload) {
          return;
        }

        try {
          const parsed = JSON.parse(payload) as {
            runId: string;
            approvalId: string;
            state: "approved" | "rejected" | "expired";
            actorId: string | null;
            reason: string | null;
            decidedAt: string;
          };

          if (parsed.runId !== input.runId || parsed.approvalId !== input.approvalId) {
            return;
          }

          settle({
            state: parsed.state,
            actorId: parsed.actorId,
            reason: parsed.reason,
            decidedAt: parsed.decidedAt,
          });
        } catch {
          // ignore invalid payloads
        }
      };

      const onError = (): void => {
        void this.fetchDecision(input.runId, input.approvalId).then((decision) => {
          if (decision) {
            settle(decision);
          }
        });
      };

      listener.on("notification", onNotification);
      listener.on("error", onError);

      const pollTimer = setInterval(() => {
        void this.fetchDecision(input.runId, input.approvalId).then((decision) => {
          if (decision) {
            settle(decision);
          }
        });
      }, this.pollIntervalMs);

      const timeout = setTimeout(() => {
        settle({
          state: "expired",
          actorId: null,
          reason: "Approval request timed out",
          decidedAt: this.now().toISOString(),
        });
      }, input.timeoutMs);
    });
  }

  async approve(input: {
    runId: string;
    approvalId: string;
    actorId: string;
    reason?: string;
  }): Promise<void> {
    await this.decide(input, "approved");
  }

  async reject(input: {
    runId: string;
    approvalId: string;
    actorId: string;
    reason?: string;
  }): Promise<void> {
    await this.decide(input, "rejected");
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  private async decide(
    input: {
      runId: string;
      approvalId: string;
      actorId: string;
      reason?: string;
    },
    state: "approved" | "rejected"
  ): Promise<void> {
    const decidedAt = this.now();

    const query = `
      UPDATE approvals
      SET state = $3,
          actor_id = $4,
          reason = $5,
          decided_at = $6
      WHERE id = $1 AND run_id = $2
    `;

    await this.pool.query(query, [
      input.approvalId,
      input.runId,
      state,
      input.actorId,
      input.reason ?? null,
      decidedAt,
    ]);

    await this.pool.query("SELECT pg_notify($1, $2)", [
      "approval_decided",
      JSON.stringify({
        runId: input.runId,
        approvalId: input.approvalId,
        state,
        actorId: input.actorId,
        reason: input.reason ?? null,
        decidedAt: decidedAt.toISOString(),
      }),
    ]);
  }

  private async fetchDecision(
    runId: string,
    approvalId: string,
    client?: PoolClient
  ): Promise<ApprovalDecision | null> {
    const executor = client ?? this.pool;
    const result = await executor.query<ApprovalRow>(
      `SELECT state, actor_id, reason, decided_at
       FROM approvals
       WHERE run_id = $1 AND id = $2
       LIMIT 1`,
      [runId, approvalId]
    );

    const row = result.rows[0];
    if (!row) {
      throw new Error("Approval not found");
    }

    if (row.state === "pending") {
      return null;
    }

    return {
      state: row.state,
      actorId: row.actor_id,
      reason: row.reason,
      decidedAt: row.decided_at?.toISOString() ?? this.now().toISOString(),
    };
  }
}

export const createApprovalControllerFromEnv = (): ApprovalController => {
  const mode = process.env.PERSISTENCE_MODE ?? "in-memory";

  if (mode === "postgres") {
    const connectionString = process.env.MISSION_CONTROL_DATABASE_URL;
    if (!connectionString) {
      throw new Error("MISSION_CONTROL_DATABASE_URL is required when PERSISTENCE_MODE=postgres");
    }

    return new PostgresApprovalController({ connectionString });
  }

  return new InMemoryApprovalController();
};
