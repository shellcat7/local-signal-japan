CREATE TABLE IF NOT EXISTS data_source_snapshots (
  id TEXT PRIMARY KEY,
  source_name TEXT NOT NULL,
  source_url_label TEXT NOT NULL,
  area_code TEXT,
  retrieved_at TEXT NOT NULL,
  published_at TEXT,
  license_note TEXT NOT NULL,
  processing_note TEXT NOT NULL,
  is_mock INTEGER NOT NULL DEFAULT 1 CHECK (is_mock IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_data_source_snapshots_area_code
  ON data_source_snapshots(area_code);

CREATE INDEX IF NOT EXISTS idx_data_source_snapshots_retrieved_at
  ON data_source_snapshots(retrieved_at);
