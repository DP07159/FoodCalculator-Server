-- Food Moment composition: a moment can be part of one larger Food Moment.
-- Presentation uses this relation to avoid duplicate cards in Home/Food Moments.
CREATE TABLE IF NOT EXISTS food_moment_composition_links (
    parent_food_moment_id INTEGER NOT NULL,
    child_food_moment_id INTEGER NOT NULL UNIQUE,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (parent_food_moment_id, child_food_moment_id),
    FOREIGN KEY (parent_food_moment_id) REFERENCES food_moments(id) ON DELETE CASCADE,
    FOREIGN KEY (child_food_moment_id) REFERENCES food_moments(id) ON DELETE CASCADE,
    CHECK (parent_food_moment_id <> child_food_moment_id)
);
CREATE INDEX IF NOT EXISTS idx_food_moment_composition_parent ON food_moment_composition_links(parent_food_moment_id);
CREATE INDEX IF NOT EXISTS idx_food_moment_composition_child ON food_moment_composition_links(child_food_moment_id);
