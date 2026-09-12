-- Platform-Admin-Rezeptfreigaben
-- Separiert Plattformfreigaben von normalen Workspace-Zuordnungen.

CREATE TABLE IF NOT EXISTS platform_recipe_releases (
    recipe_id INTEGER PRIMARY KEY,
    mode TEXT NOT NULL CHECK(mode IN ('selected','global')),
    updated_by_user_id INTEGER,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE CASCADE,
    FOREIGN KEY (updated_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS platform_recipe_release_workspaces (
    recipe_id INTEGER NOT NULL,
    workspace_id INTEGER NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (recipe_id, workspace_id),
    FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE CASCADE,
    FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
);

-- Merkt ausschließlich Workspace-Zuordnungen, die durch eine Plattformfreigabe
-- neu erzeugt wurden. Bereits vorhandene Shares bleiben beim Entfernen einer
-- Plattformfreigabe unangetastet.
CREATE TABLE IF NOT EXISTS platform_recipe_assignment_grants (
    recipe_id INTEGER NOT NULL,
    workspace_id INTEGER NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (recipe_id, workspace_id),
    FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE CASCADE,
    FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_platform_recipe_release_mode
    ON platform_recipe_releases(mode);
CREATE INDEX IF NOT EXISTS idx_platform_recipe_release_ws_workspace
    ON platform_recipe_release_workspaces(workspace_id);
