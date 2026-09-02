CREATE TABLE IF NOT EXISTS product_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_name TEXT NOT NULL,
    event_category TEXT NOT NULL DEFAULT 'module',
    user_id INTEGER,
    workspace_id INTEGER,
    session_id TEXT,
    path TEXT,
    method TEXT,
    entity_type TEXT,
    entity_reference TEXT,
    properties_json TEXT NOT NULL DEFAULT '{}',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_product_events_workspace_created ON product_events(workspace_id, created_at);
CREATE INDEX IF NOT EXISTS idx_product_events_event_created ON product_events(event_name, created_at);
CREATE INDEX IF NOT EXISTS idx_product_events_session ON product_events(session_id, created_at);
