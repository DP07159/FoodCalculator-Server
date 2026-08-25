-- Wallet categories and recipe links. Additive only.
ALTER TABLE wallet_items ADD COLUMN category TEXT;

CREATE TABLE IF NOT EXISTS wallet_recipe_links (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    wallet_item_id INTEGER NOT NULL,
    recipe_id INTEGER NOT NULL,
    linked_by_user_id INTEGER,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(wallet_item_id, recipe_id),
    FOREIGN KEY (wallet_item_id) REFERENCES wallet_items(id) ON DELETE CASCADE,
    FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE CASCADE,
    FOREIGN KEY (linked_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_wallet_recipe_links_wallet_item
    ON wallet_recipe_links(wallet_item_id);
CREATE INDEX IF NOT EXISTS idx_wallet_recipe_links_recipe
    ON wallet_recipe_links(recipe_id);
CREATE INDEX IF NOT EXISTS idx_wallet_items_category
    ON wallet_items(category);

INSERT INTO platform_system_state (state_key, state_value, updated_at)
VALUES ('migration_phase', '12-wallet-categories-recipe-links', CURRENT_TIMESTAMP)
ON CONFLICT(state_key)
DO UPDATE SET state_value = excluded.state_value, updated_at = CURRENT_TIMESTAMP;
