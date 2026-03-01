import type { QueryResultRow } from "pg";

import type { Transaction } from "../repository.js";
import type { RunEventEnvelope } from "../types.js";
import { BaseRepository } from "./base.js";

const mapRunEventRow = (row: QueryResultRow): RunEventEnvelope => ({
  sessionId: row.session_id as string,
  runId: row.run_id as string,
  sequence: row.sequence as number,
  timestamp: (row.timestamp as Date).toISOString(),
  event: {
    type: row.event_type as string,
    payload: row.payload_json as Record<string, unknown>,
  },
});

export class PostgresRunEventRepository extends BaseRepository {
  async create(
    input: {
      runId: string;
      sessionId: string;
      type: string;
      payload: Record<string, unknown>;
    },
    tx?: Transaction
  ): Promise<RunEventEnvelope> {
    const nextSequenceResult = await this.query(
      `SELECT COALESCE(MAX(sequence), 0) + 1 AS next_sequence
       FROM run_events WHERE run_id = $1`,
      [input.runId],
      tx
    );

    const nextSequence = Number(this.requiredRow(nextSequenceResult.rows[0], "run sequence").next_sequence);
    const inserted = await this.query(
      `INSERT INTO run_events (run_id, session_id, sequence, event_type, payload_json)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING run_id, session_id, sequence, timestamp, event_type, payload_json`,
      [input.runId, input.sessionId, nextSequence, input.type, input.payload],
      tx
    );

    return mapRunEventRow(this.requiredRow(inserted.rows[0], "run event"));
  }

  async createBatch(
    inputs: Array<{
      runId: string;
      sessionId: string;
      type: string;
      payload: Record<string, unknown>;
    }>,
    tx?: Transaction
  ): Promise<RunEventEnvelope[]> {
    const events: RunEventEnvelope[] = [];

    for (const input of inputs) {
      events.push(await this.create(input, tx));
    }

    return events;
  }

  async list(runId: string, afterSequence = 0): Promise<RunEventEnvelope[]> {
    const result = await this.query(
      `SELECT run_id, session_id, sequence, timestamp, event_type, payload_json
       FROM run_events
       WHERE run_id = $1 AND sequence > $2
       ORDER BY sequence ASC`,
      [runId, afterSequence]
    );

    return result.rows.map(mapRunEventRow);
  }
}
