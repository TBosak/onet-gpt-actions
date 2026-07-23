-- O*NET GPT Data API — schema version 2
-- This mirrors the live D1 schema created on 2026-07-23.
-- The database is currently empty; the first O*NET import has not run.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS database_metadata (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS dataset_versions (
  version TEXT PRIMARY KEY,
  source_url TEXT,
  source_sha256 TEXT,
  imported_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  activated_at TEXT,
  occupation_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL CHECK (status IN ('staging','active','superseded','failed')),
  notes TEXT
);

CREATE TABLE IF NOT EXISTS occupations (
  code TEXT NOT NULL,
  dataset_version TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  job_zone INTEGER CHECK (job_zone IS NULL OR job_zone BETWEEN 1 AND 5),
  job_family_code TEXT,
  job_family_title TEXT,
  bright_outlook INTEGER NOT NULL DEFAULT 0 CHECK (bright_outlook IN (0,1)),
  stem INTEGER NOT NULL DEFAULT 0 CHECK (stem IN (0,1)),
  profile_json TEXT NOT NULL DEFAULT '{}',
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (code, dataset_version),
  FOREIGN KEY (dataset_version) REFERENCES dataset_versions(version)
);

CREATE INDEX IF NOT EXISTS idx_occupations_title
  ON occupations(dataset_version, title);
CREATE INDEX IF NOT EXISTS idx_occupations_job_zone
  ON occupations(dataset_version, job_zone);
CREATE INDEX IF NOT EXISTS idx_occupations_job_family
  ON occupations(dataset_version, job_family_code);
CREATE INDEX IF NOT EXISTS idx_occupations_outlook
  ON occupations(dataset_version, bright_outlook, stem);

CREATE TABLE IF NOT EXISTS occupation_aliases (
  occupation_code TEXT NOT NULL,
  title TEXT NOT NULL,
  title_type TEXT NOT NULL DEFAULT 'alternate',
  dataset_version TEXT NOT NULL,
  PRIMARY KEY (occupation_code, title, dataset_version),
  FOREIGN KEY (occupation_code, dataset_version)
    REFERENCES occupations(code, dataset_version) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_aliases_title
  ON occupation_aliases(dataset_version, title);

CREATE TABLE IF NOT EXISTS elements (
  id TEXT NOT NULL,
  dataset_version TEXT NOT NULL,
  category TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  parent_id TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  PRIMARY KEY (id, dataset_version),
  FOREIGN KEY (parent_id, dataset_version)
    REFERENCES elements(id, dataset_version)
);

CREATE INDEX IF NOT EXISTS idx_elements_category_name
  ON elements(dataset_version, category, name);

CREATE TABLE IF NOT EXISTS occupation_scores (
  occupation_code TEXT NOT NULL,
  element_id TEXT NOT NULL,
  scale_id TEXT NOT NULL,
  value REAL NOT NULL,
  dataset_version TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  PRIMARY KEY (occupation_code, element_id, scale_id, dataset_version),
  FOREIGN KEY (occupation_code, dataset_version)
    REFERENCES occupations(code, dataset_version) ON DELETE CASCADE,
  FOREIGN KEY (element_id, dataset_version)
    REFERENCES elements(id, dataset_version)
);

CREATE INDEX IF NOT EXISTS idx_scores_element_value
  ON occupation_scores(dataset_version, element_id, scale_id, value DESC);
CREATE INDEX IF NOT EXISTS idx_scores_occupation
  ON occupation_scores(dataset_version, occupation_code);

CREATE TABLE IF NOT EXISTS occupation_text_items (
  occupation_code TEXT NOT NULL,
  category TEXT NOT NULL,
  item_id TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL,
  importance REAL,
  sequence INTEGER,
  dataset_version TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  PRIMARY KEY (occupation_code, category, item_id, dataset_version),
  FOREIGN KEY (occupation_code, dataset_version)
    REFERENCES occupations(code, dataset_version) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_text_items_category
  ON occupation_text_items(dataset_version, category, occupation_code);

CREATE TABLE IF NOT EXISTS technologies (
  id TEXT NOT NULL,
  dataset_version TEXT NOT NULL,
  name TEXT NOT NULL,
  category TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  PRIMARY KEY (id, dataset_version)
);

CREATE INDEX IF NOT EXISTS idx_technologies_name
  ON technologies(dataset_version, name);

CREATE TABLE IF NOT EXISTS occupation_technologies (
  occupation_code TEXT NOT NULL,
  technology_id TEXT NOT NULL,
  hot_technology INTEGER NOT NULL DEFAULT 0 CHECK (hot_technology IN (0,1)),
  in_demand INTEGER NOT NULL DEFAULT 0 CHECK (in_demand IN (0,1)),
  dataset_version TEXT NOT NULL,
  PRIMARY KEY (occupation_code, technology_id, dataset_version),
  FOREIGN KEY (occupation_code, dataset_version)
    REFERENCES occupations(code, dataset_version) ON DELETE CASCADE,
  FOREIGN KEY (technology_id, dataset_version)
    REFERENCES technologies(id, dataset_version)
);

CREATE INDEX IF NOT EXISTS idx_occ_tech_technology
  ON occupation_technologies(dataset_version, technology_id, occupation_code);

CREATE TABLE IF NOT EXISTS related_occupations (
  occupation_code TEXT NOT NULL,
  related_code TEXT NOT NULL,
  relation_type TEXT NOT NULL DEFAULT 'related',
  score REAL,
  dataset_version TEXT NOT NULL,
  PRIMARY KEY (occupation_code, related_code, relation_type, dataset_version),
  FOREIGN KEY (occupation_code, dataset_version)
    REFERENCES occupations(code, dataset_version) ON DELETE CASCADE,
  FOREIGN KEY (related_code, dataset_version)
    REFERENCES occupations(code, dataset_version) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_related_source
  ON related_occupations(dataset_version, occupation_code, score DESC);

CREATE VIRTUAL TABLE IF NOT EXISTS occupation_search USING fts5(
  code UNINDEXED,
  dataset_version UNINDEXED,
  title,
  description,
  alternate_titles,
  tasks,
  skills,
  technologies,
  tokenize = 'unicode61 remove_diacritics 2'
);

INSERT INTO database_metadata(key, value, updated_at)
VALUES
  ('schema_version', '2', CURRENT_TIMESTAMP),
  ('active_dataset_version', '', CURRENT_TIMESTAMP),
  ('source', 'O*NET Database downloadable data', CURRENT_TIMESTAMP),
  ('api_status', 'awaiting_import', CURRENT_TIMESTAMP)
ON CONFLICT(key) DO UPDATE
SET value = excluded.value, updated_at = excluded.updated_at;
