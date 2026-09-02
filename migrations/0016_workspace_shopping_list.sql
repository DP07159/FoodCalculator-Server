-- Paket 5: eine gemeinsame Einkaufsliste je Workspace.
CREATE TABLE IF NOT EXISTS shopping_list_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    workspace_id INTEGER NOT NULL,
    canonical_key TEXT NOT NULL,
    display_name TEXT NOT NULL,
    amount REAL,
    unit TEXT NOT NULL DEFAULT '',
    completed INTEGER NOT NULL DEFAULT 0,
    source_type TEXT NOT NULL DEFAULT 'manual',
    source_reference TEXT,
    source_label TEXT,
    recipe_id INTEGER,
    food_moment_id INTEGER,
    created_by_user_id INTEGER,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
    FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE SET NULL,
    FOREIGN KEY (food_moment_id) REFERENCES food_moments(id) ON DELETE SET NULL,
    FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_shopping_list_workspace_completed
ON shopping_list_entries(workspace_id, completed, canonical_key, unit);

CREATE UNIQUE INDEX IF NOT EXISTS idx_shopping_list_source_unique
ON shopping_list_entries(workspace_id, source_type, source_reference, canonical_key, unit)
WHERE source_reference IS NOT NULL;

INSERT OR IGNORE INTO platform_modules
    (code, name, description, default_enabled, status)
VALUES
    ('shopping', 'Einkauf', 'Gemeinsame Einkaufsliste eines Workspaces', 1, 'active');

INSERT INTO platform_system_state (state_key, state_value, updated_at)
VALUES ('migration_phase', '16-workspace-shopping-list', CURRENT_TIMESTAMP)
ON CONFLICT(state_key)
DO UPDATE SET state_value = excluded.state_value, updated_at = CURRENT_TIMESTAMP;
