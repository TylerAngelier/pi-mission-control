import type { PoolClient, QueryResultRow } from "pg";

import type { ControlApiRepository, Transaction } from "../repository.js";
import type {
  Agent,
  Approval,
  IdempotencyKeyRecord,
  Run,
  RunEventEnvelope,
  Session,
  SessionStatus,
  TranscriptEvent,
} from "../types.js";
import { DatabaseManager } from "../database.js";

class PgTransaction implements Transaction {
  constructor(private readonly client: PoolClient) {}

  async query(sql: string, params: unknown[] = []): Promise<{ rows: QueryResultRow[] }> {
    return this.client.query(sql, params);
  }

  async commit(): Promise<void> {
    await this.client.query("COMMIT");
    this.client.release();
  }

  async rollback(): Promise<void> {
    await this.client.query("ROLLBACK");
    this.client.release();
  }
}

const toSession = (row: QueryResultRow): Session => ({
  id: row.id as string,
  agentId: row.agent_id as string,
  workspaceId: row.workspace_id as string,
  status: row.status as SessionStatus,
  title: row.title as string,
  createdBy: row.created_by as string,
  createdAt: (row.created_at as Date).toISOString(),
  updatedAt: (row.updated_at as Date).toISOString(),
});

const toAgent = (row: QueryResultRow): Agent => ({
  id: row.id as string,
  name: row.name as string,
  model: row.model as string,
  defaultTools: row.default_tools as string[],
  policyId: row.policy_id as string,
  createdAt: (row.created_at as Date).toISOString(),
  updatedAt: (row.updated_at as Date).toISOString(),
});

const toRun = (row: QueryResultRow): Run => ({
  id: row.id as string,
  sessionId: row.session_id as string,
  status: row.status as Run["status"],
  startedAt: (row.started_at as Date).toISOString(),
  finishedAt: row.finished_at ? (row.finished_at as Date).toISOString() : null,
  errorCode: (row.error_code as string | null) ?? null,
  costUsd:
    row.cost_usd === null || row.cost_usd === undefined
      ? null
      : Number(row.cost_usd as string | number),
});

const toApproval = (row: QueryResultRow): Approval => ({
  id: row.id as string,
  runId: row.run_id as string,
  state: row.state as Approval["state"],
  createdAt: (row.created_at as Date).toISOString(),
  decidedAt: row.decided_at ? (row.decided_at as Date).toISOString() : null,
  actorId: (row.actor_id as string | null) ?? null,
  reason: (row.reason as string | null) ?? null,
});

const toTranscriptEvent = (row: QueryResultRow): TranscriptEvent => ({
  sequence: row.sequence as number,
  timestamp: (row.timestamp as Date).toISOString(),
  event: {
    type: row.event_type as string,
    payload: row.payload_json as Record<string, unknown>,
  },
});

const toRunEventEnvelope = (row: QueryResultRow): RunEventEnvelope => ({
  sessionId: row.session_id as string,
  runId: row.run_id as string,
  sequence: row.sequence as number,
  timestamp: (row.timestamp as Date).toISOString(),
  event: {
    type: row.event_type as string,
    payload: row.payload_json as Record<string, unknown>,
  },
});

export class PostgresControlApiRepository implements ControlApiRepository {
  constructor(private readonly db: DatabaseManager) {}

  async beginTransaction(): Promise<Transaction> {
    const client = await this.db.getClient();
    await client.query("BEGIN");
    return new PgTransaction(client);
  }

  async listAgents(): Promise<Agent[]> {
    const result = await this.db.query(
      "SELECT * FROM agents ORDER BY created_at DESC"
    );
    return result.rows.map(toAgent);
  }

  async getAgent(agentId: string): Promise<Agent | undefined> {
    const result = await this.db.query("SELECT * FROM agents WHERE id = $1", [agentId]);
    const row = result.rows[0];
    return row ? toAgent(row) : undefined;
  }

  async createAgent(input: {
    id: string;
    name: string;
    model: string;
    defaultTools: string[];
    policyId: string;
  }): Promise<Agent> {
    const result = await this.db.query(
      `INSERT INTO agents (id, name, model, default_tools, policy_id)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [input.id, input.name, input.model, input.defaultTools, input.policyId]
    );

    return toAgent(this.requiredRow(result.rows[0], "agent"));
  }

  async listSessions(status?: SessionStatus): Promise<Session[]> {
    const result = status
      ? await this.db.query(
          "SELECT * FROM sessions WHERE status = $1 ORDER BY updated_at DESC",
          [status]
        )
      : await this.db.query("SELECT * FROM sessions ORDER BY updated_at DESC");

    return result.rows.map(toSession);
  }

  async getSession(sessionId: string): Promise<Session | undefined> {
    const result = await this.db.query("SELECT * FROM sessions WHERE id = $1", [sessionId]);
    const row = result.rows[0];
    return row ? toSession(row) : undefined;
  }

  async createSession(
    input: {
      id: string;
      agentId: string;
      workspaceId: string;
      title: string;
      createdBy: string;
    },
    tx?: Transaction
  ): Promise<Session> {
    const result = await this.query(
      `INSERT INTO sessions (id, agent_id, workspace_id, status, title, created_by)
       VALUES ($1, $2, $3, 'idle', $4, $5)
       RETURNING *`,
      [input.id, input.agentId, input.workspaceId, input.title, input.createdBy],
      tx
    );

    return toSession(this.requiredRow(result.rows[0], "session"));
  }

  async updateSessionStatus(
    input: { sessionId: string; status: SessionStatus },
    tx?: Transaction
  ): Promise<void> {
    await this.query(
      "UPDATE sessions SET status = $2, updated_at = NOW() WHERE id = $1",
      [input.sessionId, input.status],
      tx
    );
  }

  async getRun(runId: string): Promise<Run | undefined> {
    const result = await this.db.query("SELECT * FROM runs WHERE id = $1", [runId]);
    const row = result.rows[0];
    return row ? toRun(row) : undefined;
  }

  async createRun(
    input: {
      id: string;
      sessionId: string;
      status: Run["status"];
    },
    tx?: Transaction
  ): Promise<Run> {
    const result = await this.query(
      `INSERT INTO runs (id, session_id, status)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [input.id, input.sessionId, input.status],
      tx
    );

    return toRun(this.requiredRow(result.rows[0], "run"));
  }

  async updateRun(
    input: {
      runId: string;
      status: Run["status"];
      errorCode?: string | null;
      finishedAt?: Date | null;
    },
    tx?: Transaction
  ): Promise<void> {
    await this.query(
      `UPDATE runs
       SET status = $2,
           error_code = $3,
           finished_at = $4
       WHERE id = $1`,
      [input.runId, input.status, input.errorCode ?? null, input.finishedAt ?? null],
      tx
    );
  }

  async createApproval(
    input: {
      id: string;
      runId: string;
      state: Approval["state"];
    },
    tx?: Transaction
  ): Promise<Approval> {
    const result = await this.query(
      `INSERT INTO approvals (id, run_id, state)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [input.id, input.runId, input.state],
      tx
    );

    return toApproval(this.requiredRow(result.rows[0], "approval"));
  }

  async getApproval(approvalId: string): Promise<Approval | undefined> {
    const result = await this.db.query("SELECT * FROM approvals WHERE id = $1", [approvalId]);
    const row = result.rows[0];
    return row ? toApproval(row) : undefined;
  }

  async updateApprovalDecision(
    input: {
      approvalId: string;
      state: "approved" | "rejected";
      actorId: string;
      reason?: string;
      decidedAt: Date;
    },
    tx?: Transaction
  ): Promise<Approval> {
    const result = await this.query(
      `UPDATE approvals
       SET state = $2,
           actor_id = $3,
           reason = $4,
           decided_at = $5
       WHERE id = $1
       RETURNING *`,
      [input.approvalId, input.state, input.actorId, input.reason ?? null, input.decidedAt],
      tx
    );

    return toApproval(this.requiredRow(result.rows[0], "approval"));
  }

  async addTranscriptEvent(
    input: {
      sessionId: string;
      runId?: string;
      type: string;
      payload: Record<string, unknown>;
    },
    tx?: Transaction
  ): Promise<TranscriptEvent> {
    const sequenceQuery = await this.query(
      `SELECT COALESCE(MAX(sequence), 0) + 1 AS next_sequence
       FROM transcript_events
       WHERE session_id = $1`,
      [input.sessionId],
      tx
    );

    const sequenceRow = this.requiredRow(sequenceQuery.rows[0], "transcript sequence");
    const nextSequence = Number(sequenceRow.next_sequence);
    const inserted = await this.query(
      `INSERT INTO transcript_events (session_id, run_id, sequence, event_type, payload_json)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING sequence, timestamp, event_type, payload_json`,
      [input.sessionId, input.runId ?? null, nextSequence, input.type, input.payload],
      tx
    );

    return toTranscriptEvent(this.requiredRow(inserted.rows[0], "transcript event"));
  }

  async listTranscriptEvents(sessionId: string, fromSequence: number): Promise<TranscriptEvent[]> {
    const result = await this.db.query(
      `SELECT sequence, timestamp, event_type, payload_json
       FROM transcript_events
       WHERE session_id = $1 AND sequence >= $2
       ORDER BY sequence ASC`,
      [sessionId, fromSequence]
    );

    return result.rows.map(toTranscriptEvent);
  }

  async addRunEvent(
    input: {
      runId: string;
      sessionId: string;
      type: string;
      payload: Record<string, unknown>;
    },
    tx?: Transaction
  ): Promise<RunEventEnvelope> {
    const sequenceQuery = await this.query(
      `SELECT COALESCE(MAX(sequence), 0) + 1 AS next_sequence
       FROM run_events
       WHERE run_id = $1`,
      [input.runId],
      tx
    );

    const sequenceRow = this.requiredRow(sequenceQuery.rows[0], "run sequence");
    const nextSequence = Number(sequenceRow.next_sequence);
    const inserted = await this.query(
      `INSERT INTO run_events (run_id, session_id, sequence, event_type, payload_json)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING run_id, session_id, sequence, timestamp, event_type, payload_json`,
      [input.runId, input.sessionId, nextSequence, input.type, input.payload],
      tx
    );

    return toRunEventEnvelope(this.requiredRow(inserted.rows[0], "run event"));
  }

  async listRunEvents(runId: string, afterSequence: number): Promise<RunEventEnvelope[]> {
    const result = await this.db.query(
      `SELECT run_id, session_id, sequence, timestamp, event_type, payload_json
       FROM run_events
       WHERE run_id = $1 AND sequence > $2
       ORDER BY sequence ASC`,
      [runId, afterSequence]
    );

    return result.rows.map(toRunEventEnvelope);
  }

  async putIdempotencyKey(
    input: { key: string; runId: string; approvalId: string },
    tx?: Transaction
  ): Promise<void> {
    await this.query(
      `INSERT INTO idempotency_keys (key, run_id, approval_id)
       VALUES ($1, $2, $3)
       ON CONFLICT (key) DO UPDATE
       SET run_id = EXCLUDED.run_id,
           approval_id = EXCLUDED.approval_id`,
      [input.key, input.runId, input.approvalId],
      tx
    );
  }

  async getIdempotencyKey(key: string): Promise<IdempotencyKeyRecord | undefined> {
    const result = await this.db.query(
      `SELECT key, run_id, approval_id, created_at
       FROM idempotency_keys
       WHERE key = $1 AND expires_at > NOW()`,
      [key]
    );

    const row = result.rows[0];
    if (!row) {
      return undefined;
    }

    return {
      key: row.key as string,
      runId: row.run_id as string,
      approvalId: row.approval_id as string,
      createdAt: row.created_at as Date,
    };
  }

  private async query(
    sql: string,
    params: unknown[] = [],
    tx?: Transaction
  ): Promise<{ rows: QueryResultRow[] }> {
    if (tx) {
      return tx.query(sql, params);
    }

    const result = await this.db.query(sql, params);
    return { rows: result.rows };
  }

  private requiredRow(row: QueryResultRow | undefined, entity: string): QueryResultRow {
    if (!row) {
      throw new Error(`Expected ${entity} row to exist`);
    }

    return row;
  }
}
