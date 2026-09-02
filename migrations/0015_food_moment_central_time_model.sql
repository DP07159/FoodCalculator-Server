-- Paket 1: Food Moment Core & zentrales Zeitmodell.
-- Additiv und rückwärtskompatibel: moment_date/moment_time bleiben für bestehende Clients erhalten.
-- @ensure-column food_moments starts_at TEXT
-- @ensure-column food_moments ends_at TEXT
-- @ensure-column food_moments is_all_day INTEGER NOT NULL DEFAULT 0
-- @ensure-column food_moments source_code TEXT NOT NULL DEFAULT 'manual'
-- @ensure-column food_moments source_reference TEXT
-- @ensure-column food_moments repeated_from_food_moment_id INTEGER REFERENCES food_moments(id) ON DELETE SET NULL
-- @ensure-column meal_plans plan_kind TEXT NOT NULL DEFAULT 'template'

-- Auf einer komplett frischen Datenbank wird `meal_plans` historisch erst in ensureSchema()
-- erzeugt. Da Migrationen vorher laufen, stellen wir die Basistabelle hier erstmals
-- migrationssicher bereit. Auf bestehenden Installationen ist dies ein No-op.
CREATE TABLE IF NOT EXISTS meal_plans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    data TEXT NOT NULL,
    owner_user_id INTEGER,
    plan_kind TEXT NOT NULL DEFAULT 'template'
);

UPDATE food_moments
SET starts_at = CASE
    WHEN moment_date IS NULL OR TRIM(moment_date) = '' THEN NULL
    WHEN moment_time IS NULL OR TRIM(moment_time) = '' THEN moment_date || 'T00:00:00'
    ELSE moment_date || 'T' || moment_time || CASE WHEN LENGTH(moment_time) = 5 THEN ':00' ELSE '' END
END
WHERE starts_at IS NULL;

UPDATE food_moments
SET is_all_day = 1
WHERE moment_date IS NOT NULL
  AND TRIM(moment_date) <> ''
  AND (moment_time IS NULL OR TRIM(moment_time) = '')
  AND COALESCE(is_all_day, 0) = 0;

UPDATE food_moments
SET source_code = 'manual'
WHERE source_code IS NULL OR TRIM(source_code) = '';

UPDATE meal_plans
SET plan_kind = 'template'
WHERE plan_kind IS NULL OR TRIM(plan_kind) = '';

CREATE INDEX IF NOT EXISTS idx_food_moments_workspace_starts_at
    ON food_moments(workspace_id, starts_at, created_at);

CREATE INDEX IF NOT EXISTS idx_food_moments_repeat_origin
    ON food_moments(repeated_from_food_moment_id);

INSERT INTO platform_system_state (state_key, state_value, updated_at)
VALUES ('migration_phase', '15-food-moment-central-time-model', CURRENT_TIMESTAMP)
ON CONFLICT(state_key)
DO UPDATE SET state_value = excluded.state_value, updated_at = CURRENT_TIMESTAMP;
