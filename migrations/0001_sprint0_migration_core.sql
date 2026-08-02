-- Sprint 0: ausschließlich technische Migrations- und Diagnosegrundlage.
-- Keine vorhandene Fachdatentabelle wird gelöscht, umbenannt oder transformiert.

CREATE TABLE IF NOT EXISTS migration_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id TEXT NOT NULL UNIQUE,
    database_path TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('started', 'succeeded', 'failed')),
    started_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    finished_at DATETIME,
    report_json TEXT
);

CREATE TABLE IF NOT EXISTS platform_system_state (
    state_key TEXT PRIMARY KEY,
    state_value TEXT NOT NULL,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO platform_system_state (state_key, state_value)
VALUES ('architecture_version', '2.1');

INSERT OR IGNORE INTO platform_system_state (state_key, state_value)
VALUES ('migration_phase', '0');
