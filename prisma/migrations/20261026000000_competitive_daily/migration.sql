ALTER TABLE puzzles ADD COLUMN title TEXT NOT NULL DEFAULT '', ADD COLUMN rules JSONB,
  ADD COLUMN availability_revision BIGINT NOT NULL DEFAULT 0, ADD COLUMN board_revision BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN canceled_at TIMESTAMP(3), ADD COLUMN cancellation_message TEXT;
CREATE TABLE guests (
  id TEXT PRIMARY KEY, session_hash TEXT NOT NULL UNIQUE, nickname TEXT NOT NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, expires_at TIMESTAMP(3) NOT NULL,
  nickname_updated_at TIMESTAMP(3)
);
CREATE TABLE guest_progress (
  guest_id TEXT NOT NULL REFERENCES guests(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  puzzle_id TEXT NOT NULL REFERENCES puzzles(puzzle_id) ON DELETE RESTRICT ON UPDATE CASCADE,
  revision BIGINT NOT NULL DEFAULT 0, attempts_started INTEGER NOT NULL DEFAULT 0,
  first_solve_attempts INTEGER, best_daily JSONB, best_archive JSONB,
  PRIMARY KEY (guest_id, puzzle_id)
);
CREATE INDEX guest_progress_puzzle_idx ON guest_progress(puzzle_id);
CREATE TABLE competitive_runs (
  id TEXT PRIMARY KEY, request_id TEXT NOT NULL UNIQUE,
  guest_id TEXT NOT NULL REFERENCES guests(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  puzzle_id TEXT NOT NULL REFERENCES puzzles(puzzle_id) ON DELETE RESTRICT ON UPDATE CASCADE,
  start_hash TEXT NOT NULL, placement JSONB NOT NULL,
  attempt_ordinal INTEGER NOT NULL, started_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  revision BIGINT NOT NULL DEFAULT 1, state TEXT NOT NULL DEFAULT 'accepted', completion JSONB,
  result JSONB, rejection JSONB, daily_eligible BOOLEAN NOT NULL DEFAULT false,
  lease_token TEXT, lease_until TIMESTAMP(3), verification_failures INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX competitive_runs_guest_started_idx ON competitive_runs(guest_id, started_at);
CREATE INDEX competitive_runs_puzzle_state_idx ON competitive_runs(puzzle_id, state, daily_eligible);
CREATE TABLE api_rate_limits (key TEXT PRIMARY KEY, count INTEGER NOT NULL, expires_at TIMESTAMP(3) NOT NULL);
CREATE INDEX api_rate_limits_expiry_idx ON api_rate_limits(expires_at);
CREATE TABLE service_settings (name TEXT PRIMARY KEY, value TEXT NOT NULL);
