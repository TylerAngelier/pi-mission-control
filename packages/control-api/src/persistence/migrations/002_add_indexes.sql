CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status);
CREATE INDEX IF NOT EXISTS idx_sessions_updated_at ON sessions(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_runs_session_id ON runs(session_id);
CREATE INDEX IF NOT EXISTS idx_runs_status ON runs(status);
CREATE INDEX IF NOT EXISTS idx_approvals_run_id ON approvals(run_id);
CREATE INDEX IF NOT EXISTS idx_approvals_state ON approvals(state);
CREATE INDEX IF NOT EXISTS idx_transcript_events_session_sequence ON transcript_events(session_id, sequence);
CREATE INDEX IF NOT EXISTS idx_transcript_events_payload_gin ON transcript_events USING GIN(payload_json);
CREATE INDEX IF NOT EXISTS idx_run_events_run_sequence ON run_events(run_id, sequence);
CREATE INDEX IF NOT EXISTS idx_run_events_payload_gin ON run_events USING GIN(payload_json);
CREATE INDEX IF NOT EXISTS idx_idempotency_keys_expires_at ON idempotency_keys(expires_at);

CREATE OR REPLACE FUNCTION notify_run_event_insert() RETURNS TRIGGER AS $$
DECLARE
  channel_name TEXT;
BEGIN
  channel_name := 'run_events:' || NEW.run_id;
  PERFORM pg_notify(channel_name, row_to_json(NEW)::text);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_notify_run_event_insert ON run_events;

CREATE TRIGGER trg_notify_run_event_insert
AFTER INSERT ON run_events
FOR EACH ROW
EXECUTE FUNCTION notify_run_event_insert();
