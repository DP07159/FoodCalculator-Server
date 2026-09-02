-- Reifegrad: Food Moments und Wochenpläne können mehreren Workspaces zugeordnet werden.
CREATE TABLE IF NOT EXISTS food_moment_workspace_assignments (
    food_moment_id INTEGER NOT NULL,
    workspace_id INTEGER NOT NULL,
    assigned_by_user_id INTEGER,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (food_moment_id, workspace_id),
    FOREIGN KEY (food_moment_id) REFERENCES food_moments(id) ON DELETE CASCADE,
    FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
    FOREIGN KEY (assigned_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

INSERT OR IGNORE INTO food_moment_workspace_assignments (food_moment_id, workspace_id, assigned_by_user_id)
SELECT id, workspace_id, owner_user_id FROM food_moments WHERE workspace_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS meal_plan_workspace_assignments (
    meal_plan_id INTEGER NOT NULL,
    workspace_id INTEGER NOT NULL,
    assigned_by_user_id INTEGER,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (meal_plan_id, workspace_id),
    FOREIGN KEY (meal_plan_id) REFERENCES meal_plans(id) ON DELETE CASCADE,
    FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
    FOREIGN KEY (assigned_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_food_moment_workspace_assignments_workspace
ON food_moment_workspace_assignments(workspace_id, food_moment_id);
CREATE INDEX IF NOT EXISTS idx_meal_plan_workspace_assignments_workspace
ON meal_plan_workspace_assignments(workspace_id, meal_plan_id);
