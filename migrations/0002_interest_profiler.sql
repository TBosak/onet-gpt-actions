-- O*NET GPT Data API — optional saved Interest Profiler profiles
-- Target schema version: 3
-- Conversation-only assessments do not write to this table.
-- Apply after 0001_initial.sql.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS interest_profiles (
  id TEXT PRIMARY KEY,
  access_token_hash TEXT NOT NULL UNIQUE,
  form_id TEXT NOT NULL,
  form_version TEXT NOT NULL,
  scoring_version TEXT NOT NULL,
  matching_version TEXT NOT NULL,
  scores_json TEXT NOT NULL CHECK (json_valid(scores_json)),
  preferences_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(preferences_json)),
  matched_dataset_version TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_accessed_at TEXT,
  expires_at TEXT,
  revoked_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_interest_profiles_expiry
  ON interest_profiles(expires_at, revoked_at);

CREATE INDEX IF NOT EXISTS idx_interest_profiles_dataset
  ON interest_profiles(matched_dataset_version);

INSERT INTO database_metadata(key, value, updated_at)
VALUES
  ('schema_version', '3', CURRENT_TIMESTAMP),
  ('interest_profiler_form', 'mini-ip-30', CURRENT_TIMESTAMP),
  ('interest_profiler_status', 'awaiting_content_and_data', CURRENT_TIMESTAMP)
ON CONFLICT(key) DO UPDATE
SET value = excluded.value, updated_at = excluded.updated_at;
