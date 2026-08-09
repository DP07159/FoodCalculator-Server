-- Sprint 3: Platform Core / Authorization.
-- Rollen, Capabilities und Privileges werden global definiert und pro Membership wirksam.

CREATE TABLE IF NOT EXISTS roles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    scope TEXT NOT NULL CHECK (scope IN ('platform', 'workspace')),
    is_system INTEGER NOT NULL DEFAULT 1 CHECK (is_system IN (0, 1)),
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS membership_roles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    membership_id INTEGER NOT NULL,
    role_id INTEGER NOT NULL,
    assigned_by_user_id INTEGER NOT NULL,
    valid_from DATETIME,
    valid_until DATETIME,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(membership_id, role_id),
    FOREIGN KEY (membership_id) REFERENCES workspace_memberships(id) ON DELETE CASCADE,
    FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE RESTRICT,
    FOREIGN KEY (assigned_by_user_id) REFERENCES users(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS capabilities (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    module_code TEXT NOT NULL,
    description TEXT,
    is_system INTEGER NOT NULL DEFAULT 1 CHECK (is_system IN (0, 1)),
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS privileges (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT NOT NULL UNIQUE,
    module_code TEXT NOT NULL,
    resource TEXT NOT NULL,
    action TEXT NOT NULL,
    description TEXT
);

CREATE TABLE IF NOT EXISTS capability_privileges (
    capability_id INTEGER NOT NULL,
    privilege_id INTEGER NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (capability_id, privilege_id),
    FOREIGN KEY (capability_id) REFERENCES capabilities(id) ON DELETE CASCADE,
    FOREIGN KEY (privilege_id) REFERENCES privileges(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS membership_capabilities (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    membership_id INTEGER NOT NULL,
    capability_id INTEGER NOT NULL,
    assigned_by_user_id INTEGER NOT NULL,
    source TEXT NOT NULL CHECK (source IN ('manual', 'role_default', 'package', 'automation')),
    valid_from DATETIME,
    valid_until DATETIME,
    revoked_at DATETIME,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (membership_id) REFERENCES workspace_memberships(id) ON DELETE CASCADE,
    FOREIGN KEY (capability_id) REFERENCES capabilities(id) ON DELETE RESTRICT,
    FOREIGN KEY (assigned_by_user_id) REFERENCES users(id) ON DELETE RESTRICT
);

-- Optionales, im Lastenheft vorgesehenes Seed-Mapping für Rollen-Defaults.
CREATE TABLE IF NOT EXISTS role_default_capabilities (
    role_id INTEGER NOT NULL,
    capability_id INTEGER NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (role_id, capability_id),
    FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE,
    FOREIGN KEY (capability_id) REFERENCES capabilities(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_membership_capabilities_active_unique
    ON membership_capabilities(membership_id, capability_id)
    WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_membership_roles_membership_id ON membership_roles(membership_id);
CREATE INDEX IF NOT EXISTS idx_membership_roles_role_id ON membership_roles(role_id);
CREATE INDEX IF NOT EXISTS idx_capabilities_module_code ON capabilities(module_code);
CREATE INDEX IF NOT EXISTS idx_privileges_module_code ON privileges(module_code);
CREATE INDEX IF NOT EXISTS idx_membership_capabilities_membership_id ON membership_capabilities(membership_id);
CREATE INDEX IF NOT EXISTS idx_membership_capabilities_capability_id ON membership_capabilities(capability_id);
CREATE INDEX IF NOT EXISTS idx_membership_capabilities_revoked_at ON membership_capabilities(revoked_at);

-- Rollen gemäß beschlossenem Rollenmodell.
INSERT OR IGNORE INTO roles (code, name, scope, is_system) VALUES
    ('platform_admin', 'Plattformadministrator', 'platform', 1),
    ('tenant_admin', 'Mandantenadministrator', 'workspace', 1),
    ('standard_user', 'Standard User', 'workspace', 1),
    ('guest', 'Gast', 'workspace', 1),
    ('family_user', 'Family User', 'workspace', 1),
    ('medic', 'Medic', 'workspace', 1);

-- Inventar-Privileges als erste Referenzimplementierung.
INSERT OR IGNORE INTO privileges (code, module_code, resource, action, description) VALUES
    ('inventory.view', 'inventory', 'inventory', 'view', 'Inventar anzeigen'),
    ('inventory.stock.receive', 'inventory', 'stock', 'receive', 'Bestand hinzufügen'),
    ('inventory.stock.consume', 'inventory', 'stock', 'consume', 'Bestand verbrauchen'),
    ('inventory.stock.correct', 'inventory', 'stock', 'correct', 'Bestand korrigieren'),
    ('inventory.location.manage', 'inventory', 'location', 'manage', 'Lagerorte verwalten'),
    ('inventory.item.create', 'inventory', 'item', 'create', 'Inventarartikel anlegen'),
    ('inventory.item.edit', 'inventory', 'item', 'edit', 'Inventarartikel bearbeiten'),
    ('inventory.item.delete', 'inventory', 'item', 'delete', 'Inventarartikel löschen');

INSERT OR IGNORE INTO capabilities (code, name, module_code, description, is_system) VALUES
    ('inventory_viewer', 'Inventar Viewer', 'inventory', 'Inventar und Bestände lesen', 1),
    ('inventory_stock_editor', 'Bestandsbearbeiter', 'inventory', 'Bestände empfangen und verbrauchen', 1),
    ('inventory_manager', 'Inventar Manager', 'inventory', 'Inventarstruktur und kritische Bestandsaktionen verwalten', 1);

-- Capability -> Privilege
INSERT OR IGNORE INTO capability_privileges (capability_id, privilege_id)
SELECT c.id, p.id
FROM capabilities c
JOIN privileges p ON p.code = 'inventory.view'
WHERE c.code = 'inventory_viewer';

INSERT OR IGNORE INTO capability_privileges (capability_id, privilege_id)
SELECT c.id, p.id
FROM capabilities c
JOIN privileges p ON p.code IN ('inventory.view', 'inventory.stock.receive', 'inventory.stock.consume')
WHERE c.code = 'inventory_stock_editor';

INSERT OR IGNORE INTO capability_privileges (capability_id, privilege_id)
SELECT c.id, p.id
FROM capabilities c
JOIN privileges p ON p.code IN (
    'inventory.view',
    'inventory.stock.receive',
    'inventory.stock.consume',
    'inventory.stock.correct',
    'inventory.location.manage',
    'inventory.item.create',
    'inventory.item.edit',
    'inventory.item.delete'
)
WHERE c.code = 'inventory_manager';

-- Tenant Admin erhält im initialen Referenzmodell alle drei Inventar-Capabilities.
INSERT OR IGNORE INTO role_default_capabilities (role_id, capability_id)
SELECT r.id, c.id
FROM roles r
CROSS JOIN capabilities c
WHERE r.code = 'tenant_admin'
  AND c.code IN ('inventory_viewer', 'inventory_stock_editor', 'inventory_manager');

INSERT INTO platform_system_state (state_key, state_value, updated_at)
VALUES ('migration_phase', '3', CURRENT_TIMESTAMP)
ON CONFLICT(state_key)
DO UPDATE SET state_value = excluded.state_value, updated_at = CURRENT_TIMESTAMP;
