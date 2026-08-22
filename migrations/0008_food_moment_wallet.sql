-- Sprint 9: Food Moment Wallet MVP – clean baseline
--
-- Frühere Wallet-Strukturen stammen aus einem verworfenen Experiment und dürfen
-- vollständig entfernt werden. Migration 0008 stellt deshalb bewusst eine
-- saubere Wallet-Basis her und behält ausschließlich das aktuelle MVP-Modell.
--
-- WICHTIG: Diese Migration ist absichtlich destruktiv für bereits vorhandene
-- Wallet-Experimentdaten. Andere Plattform- und Fachdaten werden nicht berührt.

DROP TABLE IF EXISTS wallet_item_relations;
DROP TABLE IF EXISTS wallet_items;

CREATE TABLE wallet_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    public_id TEXT NOT NULL UNIQUE,
    workspace_id INTEGER NOT NULL,
    created_by_user_id INTEGER,
    source_type TEXT NOT NULL DEFAULT 'link'
        CHECK (source_type IN ('link', 'note')),
    source_url TEXT,
    source_platform TEXT,
    source_external_id TEXT,
    title TEXT,
    note TEXT,
    status TEXT NOT NULL DEFAULT 'saved'
        CHECK (status IN ('saved', 'used', 'archived')),
    saved_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
    FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX idx_wallet_items_workspace_saved
    ON wallet_items(workspace_id, saved_at DESC);
CREATE INDEX idx_wallet_items_workspace_status
    ON wallet_items(workspace_id, status);
CREATE INDEX idx_wallet_items_source_platform
    ON wallet_items(source_platform);

CREATE TABLE wallet_item_relations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    wallet_item_id INTEGER NOT NULL,
    target_type TEXT NOT NULL
        CHECK (target_type IN ('recipe', 'food_moment', 'meal_plan_entry')),
    target_reference TEXT NOT NULL,
    created_by_user_id INTEGER,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(wallet_item_id, target_type, target_reference),
    FOREIGN KEY (wallet_item_id) REFERENCES wallet_items(id) ON DELETE CASCADE,
    FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX idx_wallet_item_relations_wallet
    ON wallet_item_relations(wallet_item_id);

INSERT OR IGNORE INTO platform_modules
    (code, name, description, default_enabled, status)
VALUES
    ('wallet', 'Wallet', 'Gespeicherte Food-Inspirationen aus externen Quellen', 1, 'active');

INSERT INTO platform_system_state (state_key, state_value, updated_at)
VALUES ('migration_phase', '9-wallet-mvp', CURRENT_TIMESTAMP)
ON CONFLICT(state_key)
DO UPDATE SET state_value = excluded.state_value, updated_at = CURRENT_TIMESTAMP;
