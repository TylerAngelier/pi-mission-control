import type { QueryResultRow } from "pg";

import type { Transaction } from "../repository.js";
import type { TranscriptEvent } from "../types.js";
import { BaseRepository } from "./base.js";

const mapTranscriptEventRow = (row: QueryResultRow): TranscriptEvent => ({
  sequence: row.sequence as number,
  timestamp: (row.timestamp as Date).toISOString(),
  event: {
    type: row.event_type as string,
    payload: row.payload_json as Record<string, unknown>,
  },
});

export class PostgresTranscriptEventRepository extends BaseRepository {
  async create(
    input: {
      sessionId: string;
      runId?: string;
      type: string;
      payload: Record<string, unknown>;
    },
    tx?: Transaction
  ): Promise<TranscriptEvent> {
    const nextSequenceResult = await this.query(
      `SELECT COALESCE(MAX(sequence), 0) + 1 AS next_sequence
       FROM transcript_events WHERE session_id = $1`,
      [input.sessionId],
      tx
    );

    const nextSequence = Number(this.requiredRow(nextSequenceResult.rows[0], "transcript sequence").next_sequence);
    const inserted = await this.query(
      `INSERT INTO transcript_events (session_id, run_id, sequence, event_type, payload_json)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING sequence, timestamp, event_type, payload_json`,
      [input.sessionId, input.runId ?? null, nextSequence, input.type, input.payload],
      tx
    );

    return mapTranscriptEventRow(this.requiredRow(inserted.rows[0], "transcript event"));
  }

  async createBatch(
    inputs: Array<{
      sessionId: string;
      runId?: string;
      type: string;
      payload: Record<string, unknown>;
    }>,
    tx?: Transaction
  ): Promise<TranscriptEvent[]> {
    const events: TranscriptEvent[] = [];

    for (const input of inputs) {
      events.push(await this.create(input, tx));
    }

    return events;
  }

  async list(sessionId: string, fromSequence: number): Promise<TranscriptEvent[]> {
    const result = await this.query(
      `SELECT sequence, timestamp, event_type, payload_json
       FROM transcript_events
       WHERE session_id = $1 AND sequence >= $2
       ORDER BY sequence ASC`,
      [sessionId, fromSequence]
    );

    return result.rows.map(mapTranscriptEventRow);
  }
}
