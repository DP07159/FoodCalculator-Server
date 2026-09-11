-- Reparatur/Fallback für Einkaufslisten-Freigaben.
-- Idempotent: stellt die Share-Tabelle sicher, falls 0019 in einem Delta-Deploy
-- nicht auf dem Server gelandet ist oder noch nicht angewendet wurde.
CREATE TABLE IF NOT EXISTS shopping_list_shares (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source_workspace_id INTEGER NOT NULL,
    target_workspace_id INTEGER NOT NULL,
    shared_by_user_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(source_workspace_id, target_workspace_id),
    FOREIGN KEY (source_workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
    FOREIGN KEY (target_workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
    FOREIGN KEY (shared_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
    CHECK (source_workspace_id <> target_workspace_id)
);

CREATE INDEX IF NOT EXISTS idx_shopping_list_shares_source
ON shopping_list_shares(source_workspace_id, target_workspace_id);

CREATE INDEX IF NOT EXISTS idx_shopping_list_shares_target
ON shopping_list_shares(target_workspace_id, source_workspace_id);

INSERT INTO platform_system_state (state_key, state_value, updated_at)
VALUES ('migration_phase', '20-shopping-list-shares-repair', CURRENT_TIMESTAMP)
ON CONFLICT(state_key)
DO UPDATE SET state_value = excluded.state_value, updated_at = CURRENT_TIMESTAMP;
