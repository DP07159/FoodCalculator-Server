-- Workspace-bezogene Rezeptfavoriten
CREATE TABLE IF NOT EXISTS recipe_workspace_favorites (
    recipe_id INTEGER NOT NULL,
    workspace_id INTEGER NOT NULL,
    is_favorite INTEGER NOT NULL DEFAULT 1 CHECK (is_favorite IN (0,1)),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (recipe_id, workspace_id),
    FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE CASCADE,
    FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_recipe_workspace_favorites_workspace
    ON recipe_workspace_favorites(workspace_id, recipe_id);

-- Bestehende Favoriten bleiben im bisherigen Ursprungs-Workspace erhalten.
INSERT OR IGNORE INTO recipe_workspace_favorites (recipe_id, workspace_id, is_favorite)
SELECT r.id, r.workspace_id, 1
FROM recipes r
WHERE COALESCE(r.is_favorite, 0) = 1
  AND r.workspace_id IS NOT NULL;

-- Das Legacy-Feld darf künftig keine workspace-übergreifende Semantik mehr tragen.
UPDATE recipes SET is_favorite = 0 WHERE COALESCE(is_favorite, 0) <> 0;
