-- Sprint 6A + 6B
-- Global Platform-Administration + Workspace-bezogene Modulfreischaltung.
--
-- Architektur:
-- - Platform-Rollen hängen NICHT an Workspace-Memberships.
-- - Workspace-Rollen/Capabilities bleiben membershipbezogen.
-- - Module Access ist ein eigener Gate vor Role/Capability/Privilege.

CREATE TABLE IF NOT EXISTS user_platform_roles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    role_id INTEGER NOT NULL,
    assigned_by_user_id INTEGER NOT NULL,
    valid_from DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    valid_until DATETIME,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, role_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE RESTRICT,
    FOREIGN KEY (assigned_by_user_id) REFERENCES users(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS platform_modules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    description TEXT,
    default_enabled INTEGER NOT NULL DEFAULT 1 CHECK (default_enabled IN (0, 1)),
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS membership_module_access (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    membership_id INTEGER NOT NULL,
    module_id INTEGER NOT NULL,
    enabled INTEGER NOT NULL CHECK (enabled IN (0, 1)),
    assigned_by_user_id INTEGER NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(membership_id, module_id),
    FOREIGN KEY (membership_id) REFERENCES workspace_memberships(id) ON DELETE CASCADE,
    FOREIGN KEY (module_id) REFERENCES platform_modules(id) ON DELETE CASCADE,
    FOREIGN KEY (assigned_by_user_id) REFERENCES users(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_user_platform_roles_user
    ON user_platform_roles(user_id);

CREATE INDEX IF NOT EXISTS idx_user_platform_roles_role
    ON user_platform_roles(role_id);

CREATE INDEX IF NOT EXISTS idx_membership_module_access_membership
    ON membership_module_access(membership_id);

CREATE INDEX IF NOT EXISTS idx_membership_module_access_module
    ON membership_module_access(module_id);

INSERT OR IGNORE INTO platform_modules
    (code, name, description, default_enabled, status)
VALUES
    ('recipes', 'Rezepte', 'Rezeptbuch und Rezeptfunktionen', 1, 'active'),
    ('meal_plan', 'Wochenplan', 'Wochenplanung und gespeicherte Wochenpläne', 1, 'active'),
    ('inventory', 'Inventar', 'Bestände, Lagerorte und Inventarverwaltung', 1, 'active');

INSERT INTO platform_system_state (state_key, state_value, updated_at)
VALUES ('migration_phase', '6AB', CURRENT_TIMESTAMP)
ON CONFLICT(state_key)
DO UPDATE SET state_value = excluded.state_value, updated_at = CURRENT_TIMESTAMP;
