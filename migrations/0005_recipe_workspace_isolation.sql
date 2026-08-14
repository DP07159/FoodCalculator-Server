-- Sprint 5A: Recipe Workspace Isolation.
-- Bestehende Rezepte werden nicht automatisch einem beliebigen Benutzer zugeordnet.
-- Die explizite Legacy-Zuordnung erfolgt anschließend per CLI.

ALTER TABLE recipes ADD COLUMN workspace_id INTEGER REFERENCES workspaces(id);
ALTER TABLE recipes ADD COLUMN owner_user_id INTEGER REFERENCES users(id);
ALTER TABLE recipes ADD COLUMN visibility TEXT NOT NULL DEFAULT 'workspace'
    CHECK (visibility IN ('workspace', 'published', 'archived'));
ALTER TABLE recipes ADD COLUMN version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE recipes ADD COLUMN created_at DATETIME;
ALTER TABLE recipes ADD COLUMN updated_at DATETIME;

UPDATE recipes
SET created_at = COALESCE(created_at, CURRENT_TIMESTAMP),
    updated_at = COALESCE(updated_at, CURRENT_TIMESTAMP);

CREATE INDEX IF NOT EXISTS idx_recipes_workspace_id ON recipes(workspace_id);
CREATE INDEX IF NOT EXISTS idx_recipes_owner_user_id ON recipes(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_recipes_visibility ON recipes(visibility);

INSERT INTO platform_system_state (state_key, state_value, updated_at)
VALUES ('migration_phase', '5A', CURRENT_TIMESTAMP)
ON CONFLICT(state_key)
DO UPDATE SET state_value = excluded.state_value, updated_at = CURRENT_TIMESTAMP;
