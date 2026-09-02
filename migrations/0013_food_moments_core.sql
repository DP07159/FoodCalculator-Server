-- Food Moments core. Additive only.
CREATE TABLE IF NOT EXISTS food_moments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    public_id TEXT NOT NULL UNIQUE,
    workspace_id INTEGER NOT NULL,
    owner_user_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    timing_code TEXT NOT NULL DEFAULT 'open',
    moment_date TEXT,
    moment_time TEXT,
    audience_code TEXT NOT NULL DEFAULT 'open',
    people_count INTEGER,
    status TEXT NOT NULL DEFAULT 'planned',
    notes TEXT DEFAULT '',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
    FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_food_moments_workspace_date
    ON food_moments(workspace_id, moment_date, created_at);

CREATE TABLE IF NOT EXISTS food_moment_recipe_links (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    food_moment_id INTEGER NOT NULL,
    recipe_id INTEGER NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(food_moment_id, recipe_id),
    FOREIGN KEY (food_moment_id) REFERENCES food_moments(id) ON DELETE CASCADE,
    FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS food_moment_wallet_links (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    food_moment_id INTEGER NOT NULL,
    wallet_item_id INTEGER NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(food_moment_id, wallet_item_id),
    FOREIGN KEY (food_moment_id) REFERENCES food_moments(id) ON DELETE CASCADE,
    FOREIGN KEY (wallet_item_id) REFERENCES wallet_items(id) ON DELETE CASCADE
);

INSERT OR IGNORE INTO platform_modules
    (code, name, description, default_enabled, status)
VALUES
    ('food_moments', 'Food Moments', 'Momente als verbindende Ebene zwischen Inspiration, Rezept und Planung', 1, 'active');

INSERT INTO platform_system_state (state_key, state_value, updated_at)
VALUES ('migration_phase', '13-food-moments-core', CURRENT_TIMESTAMP)
ON CONFLICT(state_key)
DO UPDATE SET state_value = excluded.state_value, updated_at = CURRENT_TIMESTAMP;
