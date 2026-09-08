-- Food-Moment-Komposition: Food Moments können Bestandteil eines übergeordneten Food Moments sein.
CREATE TABLE IF NOT EXISTS food_moment_composition_links (
    parent_food_moment_id INTEGER NOT NULL,
    child_food_moment_id INTEGER NOT NULL UNIQUE,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (parent_food_moment_id, child_food_moment_id),
    CHECK (parent_food_moment_id <> child_food_moment_id),
    FOREIGN KEY (parent_food_moment_id) REFERENCES food_moments(id) ON DELETE CASCADE,
    FOREIGN KEY (child_food_moment_id) REFERENCES food_moments(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_food_moment_composition_parent
ON food_moment_composition_links(parent_food_moment_id, child_food_moment_id);

CREATE INDEX IF NOT EXISTS idx_food_moment_composition_child
ON food_moment_composition_links(child_food_moment_id, parent_food_moment_id);

INSERT INTO platform_system_state (state_key, state_value, updated_at)
VALUES ('migration_phase', '17-food-moment-composition', CURRENT_TIMESTAMP)
ON CONFLICT(state_key)
DO UPDATE SET state_value = excluded.state_value, updated_at = CURRENT_TIMESTAMP;
