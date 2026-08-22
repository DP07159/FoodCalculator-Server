-- Sprint 9: Food Moment Wallet MVP
-- Externe Inspirationen werden workspacebezogen gespeichert und bleiben fachlich
-- getrennt von Recipes, Meal Planning und künftigen Food Moments.
--
-- WICHTIG FÜR BESTEHENDE INSTALLATIONEN:
-- CREATE TABLE IF NOT EXISTS erweitert eine bereits vorhandene wallet_items-Tabelle
-- nicht. Der Migration Runner verarbeitet deshalb die folgenden @ensure-column-
-- Direktiven vor dem eigentlichen SQL. Damit bleibt die Migration tolerant, falls
-- eine ältere/experimentelle Wallet-Tabelle bereits existiert.

-- @ensure-column wallet_items public_id TEXT
-- @ensure-column wallet_items workspace_id INTEGER REFERENCES workspaces(id)
-- @ensure-column wallet_items created_by_user_id INTEGER REFERENCES users(id)
-- @ensure-column wallet_items source_type TEXT DEFAULT 'link'
-- @ensure-column wallet_items source_url TEXT
-- @ensure-column wallet_items source_platform TEXT
-- @ensure-column wallet_items source_external_id TEXT
-- @ensure-column wallet_items title TEXT
-- @ensure-column wallet_items note TEXT
-- @ensure-column wallet_items status TEXT DEFAULT 'saved'
-- @ensure-column wallet_items saved_at DATETIME
-- @ensure-column wallet_items created_at DATETIME
-- @ensure-column wallet_items updated_at DATETIME

CREATE TABLE IF NOT EXISTS wallet_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    public_id TEXT NOT NULL UNIQUE,
    workspace_id INTEGER NOT NULL,
    created_by_user_id INTEGER,
    source_type TEXT NOT NULL DEFAULT 'link' CHECK (source_type IN ('link', 'note')),
    source_url TEXT,
    source_platform TEXT,
    source_external_id TEXT,
    title TEXT,
    note TEXT,
    status TEXT NOT NULL DEFAULT 'saved' CHECK (status IN ('saved', 'used', 'archived')),
    saved_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
    FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

-- Bereits vorhandene experimentelle Wallet-Zeilen werden technisch kompatibel
-- gemacht, ohne ihnen stillschweigend einen Workspace zuzuordnen. Neue Einträge
-- erhalten workspace_id regulär über das Wallet-Modul.
UPDATE wallet_items
SET public_id = COALESCE(NULLIF(public_id, ''), 'legacy-wallet-' || id),
    source_type = CASE
        WHEN source_type IN ('link', 'note') THEN source_type
        ELSE 'link'
    END,
    status = CASE
        WHEN status IN ('saved', 'used', 'archived') THEN status
        ELSE 'saved'
    END,
    saved_at = COALESCE(saved_at, CURRENT_TIMESTAMP),
    created_at = COALESCE(created_at, CURRENT_TIMESTAMP),
    updated_at = COALESCE(updated_at, CURRENT_TIMESTAMP);

-- Auf einer Legacy-Tabelle können NOT NULL/UNIQUE nicht per ALTER TABLE
-- nachgerüstet werden. Die fachlich relevanten Regeln werden daher zusätzlich
-- über Index und Trigger abgesichert.
CREATE UNIQUE INDEX IF NOT EXISTS idx_wallet_items_public_id
    ON wallet_items(public_id);

CREATE INDEX IF NOT EXISTS idx_wallet_items_workspace_saved
    ON wallet_items(workspace_id, saved_at DESC);
CREATE INDEX IF NOT EXISTS idx_wallet_items_workspace_status
    ON wallet_items(workspace_id, status);
CREATE INDEX IF NOT EXISTS idx_wallet_items_source_platform
    ON wallet_items(source_platform);

CREATE TRIGGER IF NOT EXISTS trg_wallet_items_workspace_insert_guard
BEFORE INSERT ON wallet_items
FOR EACH ROW
WHEN NEW.workspace_id IS NULL
BEGIN
    SELECT RAISE(ABORT, 'Wallet-Eintrag benötigt workspace_id');
END;

CREATE TRIGGER IF NOT EXISTS trg_wallet_items_state_insert_guard
BEFORE INSERT ON wallet_items
FOR EACH ROW
WHEN NEW.public_id IS NULL
   OR NEW.public_id = ''
   OR NEW.source_type IS NULL
   OR NEW.source_type NOT IN ('link', 'note')
   OR NEW.status IS NULL
   OR NEW.status NOT IN ('saved', 'used', 'archived')
BEGIN
    SELECT RAISE(ABORT, 'Ungültiger Wallet-Zustand');
END;

CREATE TRIGGER IF NOT EXISTS trg_wallet_items_state_update_guard
BEFORE UPDATE OF workspace_id, public_id, source_type, status ON wallet_items
FOR EACH ROW
WHEN NEW.workspace_id IS NULL
   OR NEW.public_id IS NULL
   OR NEW.public_id = ''
   OR NEW.source_type IS NULL
   OR NEW.source_type NOT IN ('link', 'note')
   OR NEW.status IS NULL
   OR NEW.status NOT IN ('saved', 'used', 'archived')
BEGIN
    SELECT RAISE(ABORT, 'Ungültiger Wallet-Zustand');
END;

-- @ensure-column wallet_item_relations wallet_item_id INTEGER REFERENCES wallet_items(id)
-- @ensure-column wallet_item_relations target_type TEXT
-- @ensure-column wallet_item_relations target_reference TEXT
-- @ensure-column wallet_item_relations created_by_user_id INTEGER REFERENCES users(id)
-- @ensure-column wallet_item_relations created_at DATETIME

CREATE TABLE IF NOT EXISTS wallet_item_relations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    wallet_item_id INTEGER NOT NULL,
    target_type TEXT NOT NULL CHECK (target_type IN ('recipe', 'food_moment', 'meal_plan_entry')),
    target_reference TEXT NOT NULL,
    created_by_user_id INTEGER,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(wallet_item_id, target_type, target_reference),
    FOREIGN KEY (wallet_item_id) REFERENCES wallet_items(id) ON DELETE CASCADE,
    FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

UPDATE wallet_item_relations
SET created_at = COALESCE(created_at, CURRENT_TIMESTAMP);

CREATE UNIQUE INDEX IF NOT EXISTS idx_wallet_item_relations_unique
    ON wallet_item_relations(wallet_item_id, target_type, target_reference);
CREATE INDEX IF NOT EXISTS idx_wallet_item_relations_wallet
    ON wallet_item_relations(wallet_item_id);

INSERT OR IGNORE INTO platform_modules
    (code, name, description, default_enabled, status)
VALUES
    ('wallet', 'Wallet', 'Gespeicherte Food-Inspirationen aus externen Quellen', 1, 'active');

INSERT INTO platform_system_state (state_key, state_value, updated_at)
VALUES ('migration_phase', '9-wallet-mvp', CURRENT_TIMESTAMP)
ON CONFLICT(state_key)
DO UPDATE SET state_value = excluded.state_value, updated_at = CURRENT_TIMESTAMP;
