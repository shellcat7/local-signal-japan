INSERT OR IGNORE INTO data_source_snapshots (
  id,
  source_name,
  source_url_label,
  area_code,
  retrieved_at,
  published_at,
  license_note,
  processing_note,
  is_mock
) VALUES
  (
    'mock-estat-population-13101-2026-05-09',
    'Mock e-Stat population',
    'mock://estat/population/13101',
    '13101',
    '2026-05-09',
    'demo-only',
    '架空デモデータ。実在統計ではありません。',
    'MVP fixture. No upstream API request was made.',
    1
  ),
  (
    'mock-real-estate-13101-2026-05-09',
    'Mock real estate library',
    'mock://real-estate/price/13101',
    '13101',
    '2026-05-09',
    'demo-only',
    '架空デモデータ。実在統計ではありません。',
    'MVP fixture. No upstream API request was made.',
    1
  );
