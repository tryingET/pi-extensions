-- Prompt Vault retrieval analytics sidecar schema v1
-- Machine-local append-only telemetry; deliberately outside Dolt history.
PRAGMA journal_mode = WAL;
PRAGMA busy_timeout = 5000;

CREATE TABLE IF NOT EXISTS retrieval_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    entity_type TEXT NOT NULL DEFAULT 'template'
        CHECK (entity_type IN ('template', 'skill')),
    entity_id INTEGER NOT NULL,
    entity_version INTEGER,
    tool TEXT NOT NULL CHECK (tool IN ('vault_query', 'vault_retrieve', 'other')),
    query_context TEXT,
    selected_rank INTEGER,
    result_count INTEGER,
    company TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_re_events_entity
    ON retrieval_events(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_re_events_created
    ON retrieval_events(created_at);

CREATE VIEW IF NOT EXISTS v_retrievals_daily AS
    SELECT date(created_at) AS day,
           entity_type, entity_id, COALESCE(company, '') AS company, tool,
           COUNT(*) AS retrieval_count,
           ROUND(AVG(selected_rank), 2) AS avg_rank,
           MAX(result_count) AS last_result_count
    FROM retrieval_events
    GROUP BY day, entity_type, entity_id, COALESCE(company, ''), tool;

CREATE VIEW IF NOT EXISTS v_retrievals_by_entity AS
    SELECT entity_type, entity_id, COALESCE(company, '') AS company,
           COUNT(*) AS retrieval_count,
           ROUND(AVG(selected_rank), 2) AS avg_rank,
           SUM(CASE WHEN selected_rank = 1 THEN 1 ELSE 0 END) AS top_rank_count,
           MAX(created_at) AS last_retrieved_at
    FROM retrieval_events
    GROUP BY entity_type, entity_id, COALESCE(company, '');

PRAGMA user_version = 1;
