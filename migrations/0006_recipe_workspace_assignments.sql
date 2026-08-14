-- Sprint 5A.1: Multi-Workspace Recipe Assignment
--
-- recipes.workspace_id bleibt zunächst als Legacy-/Kompatibilitätsanker bestehen,
-- ist aber ab dieser Migration NICHT mehr die Quelle der Sichtbarkeit.
-- Sichtbarkeit erfolgt ausschließlich über recipe_workspace_assignments.

CREATE TABLE IF NOT EXISTS recipe_workspace_assignments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    recipe_id INTEGER NOT NULL,
    workspace_id INTEGER NOT NULL,
    assigned_by_user_id INTEGER,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(recipe_id, workspace_id),
    FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE CASCADE,
    FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
    FOREIGN KEY (assigned_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_recipe_workspace_assignments_recipe
    ON recipe_workspace_assignments(recipe_id);

CREATE INDEX IF NOT EXISTS idx_recipe_workspace_assignments_workspace
    ON recipe_workspace_assignments(workspace_id);

-- Alle bereits workspacegebundenen Rezepte werden verlustfrei übernommen.
INSERT OR IGNORE INTO recipe_workspace_assignments (
    recipe_id,
    workspace_id,
    assigned_by_user_id,
    created_at
)
SELECT
    id,
    workspace_id,
    owner_user_id,
    COALESCE(created_at, CURRENT_TIMESTAMP)
FROM recipes
WHERE workspace_id IS NOT NULL;

INSERT INTO platform_system_state (state_key, state_value, updated_at)
VALUES ('migration_phase', '5A.1', CURRENT_TIMESTAMP)
ON CONFLICT(state_key)
DO UPDATE SET state_value = excluded.state_value, updated_at = CURRENT_TIMESTAMP;
