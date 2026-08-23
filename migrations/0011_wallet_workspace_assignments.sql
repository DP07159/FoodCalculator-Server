-- Wallet multi-workspace sharing. Additive only.
-- Mirrors the established recipe workspace-assignment model without copying Wallet items.

CREATE TABLE IF NOT EXISTS wallet_workspace_assignments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    wallet_item_id INTEGER NOT NULL,
    workspace_id INTEGER NOT NULL,
    assigned_by_user_id INTEGER,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(wallet_item_id, workspace_id),
    FOREIGN KEY (wallet_item_id) REFERENCES wallet_items(id) ON DELETE CASCADE,
    FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
    FOREIGN KEY (assigned_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_wallet_workspace_assignments_item
    ON wallet_workspace_assignments(wallet_item_id);
CREATE INDEX IF NOT EXISTS idx_wallet_workspace_assignments_workspace
    ON wallet_workspace_assignments(workspace_id);

-- Every existing Wallet item remains visible in its current workspace.
INSERT OR IGNORE INTO wallet_workspace_assignments (
    wallet_item_id,
    workspace_id,
    assigned_by_user_id
)
SELECT
    wi.id,
    wi.workspace_id,
    wi.created_by_user_id
FROM wallet_items wi;

INSERT INTO platform_system_state (state_key, state_value, updated_at)
VALUES ('migration_phase', '11-wallet-workspace-assignments', CURRENT_TIMESTAMP)
ON CONFLICT(state_key)
DO UPDATE SET state_value = excluded.state_value, updated_at = CURRENT_TIMESTAMP;
