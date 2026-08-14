-- Sprint 5A: Recipe Workspace Isolation.
-- Diese Migration ist absichtlich tolerant gegenüber Spalten,
-- die durch den bisherigen ensureSchema()-Mechanismus bereits existieren.
--
-- Der Migration Runner verarbeitet die folgenden Direktiven nur dann,
-- wenn die Tabelle bereits existiert und die jeweilige Spalte noch fehlt.

-- @ensure-column recipes workspace_id INTEGER REFERENCES workspaces(id)
-- @ensure-column recipes owner_user_id INTEGER REFERENCES users(id)
-- @ensure-column recipes visibility TEXT DEFAULT 'workspace'
-- @ensure-column recipes version INTEGER DEFAULT 1
-- @ensure-column recipes created_at DATETIME
-- @ensure-column recipes updated_at DATETIME

-- Für frische technische Smoke-Test-Datenbanken ist die Migration
-- gleichzeitig selbsttragend. Auf einer bestehenden V1-Datenbank ist
-- CREATE TABLE IF NOT EXISTS ein No-op.
CREATE TABLE IF NOT EXISTS recipes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    calories INTEGER NOT NULL,
    portions INTEGER,
    mealTypes TEXT NOT NULL,
    ingredients TEXT DEFAULT '',
    instructions TEXT DEFAULT '',
    is_favorite INTEGER DEFAULT 0,
    workspace_id INTEGER REFERENCES workspaces(id),
    owner_user_id INTEGER REFERENCES users(id),
    visibility TEXT NOT NULL DEFAULT 'workspace'
        CHECK (visibility IN ('workspace', 'published', 'archived')),
    version INTEGER NOT NULL DEFAULT 1,
    created_at DATETIME,
    updated_at DATETIME
);

UPDATE recipes
SET visibility = COALESCE(NULLIF(visibility, ''), 'workspace'),
    version = CASE WHEN version IS NULL OR version < 1 THEN 1 ELSE version END,
    created_at = COALESCE(created_at, CURRENT_TIMESTAMP),
    updated_at = COALESCE(updated_at, CURRENT_TIMESTAMP);

CREATE INDEX IF NOT EXISTS idx_recipes_workspace_id
    ON recipes(workspace_id);

CREATE INDEX IF NOT EXISTS idx_recipes_owner_user_id
    ON recipes(owner_user_id);

CREATE INDEX IF NOT EXISTS idx_recipes_visibility
    ON recipes(visibility);

-- Bestehende Installationen können die Spalten bereits ohne NOT-NULL-
-- Constraint besitzen. Diese Trigger erzwingen die V2-Regeln künftig
-- auch dort, ohne die produktive Tabelle neu aufzubauen.
CREATE TRIGGER IF NOT EXISTS trg_recipes_v2_insert_guard
BEFORE INSERT ON recipes
FOR EACH ROW
WHEN NEW.visibility IS NULL
   OR NEW.visibility NOT IN ('workspace', 'published', 'archived')
   OR NEW.version IS NULL
   OR NEW.version < 1
BEGIN
    SELECT RAISE(ABORT, 'Ungültiger V2-Rezeptzustand');
END;

CREATE TRIGGER IF NOT EXISTS trg_recipes_v2_update_guard
BEFORE UPDATE OF visibility, version ON recipes
FOR EACH ROW
WHEN NEW.visibility IS NULL
   OR NEW.visibility NOT IN ('workspace', 'published', 'archived')
   OR NEW.version IS NULL
   OR NEW.version < 1
BEGIN
    SELECT RAISE(ABORT, 'Ungültiger V2-Rezeptzustand');
END;

INSERT INTO platform_system_state (state_key, state_value, updated_at)
VALUES ('migration_phase', '5A', CURRENT_TIMESTAMP)
ON CONFLICT(state_key)
DO UPDATE SET state_value = excluded.state_value, updated_at = CURRENT_TIMESTAMP;
