# Sprint 4B – Membership-, Rollen- und Capability-Verwaltung

## Ziel
Kontrollierte Verwaltung der Effective Permissions eines Workspace-Mitglieds über CLI.

## Neue Befehle

- `npm run users:access`
- `npm run users:set-role`
- `npm run users:grant-capability`
- `npm run users:revoke-capability`
- `npm run test:access-management`

## Variablen

Zielbenutzer:
- `FC_TARGET_EMAIL`

Optional bei mehreren Workspaces:
- `FC_WORKSPACE_ID`

Actor für Änderungen:
- `FC_ACTOR_EMAIL`

Rolle:
- `FC_ROLE_CODE`

Capability:
- `FC_CAPABILITY_CODE`

## Sicherheits-/Architekturregel
Persönliche Workspace-Owner behalten `tenant_admin`.
Für Testzwecke werden ihre effektiven Rechte über Capabilities eingeschränkt.
Damit bleibt organisatorische Ownership getrennt von fachlichen Privileges.

## Beispiel: Zugriff anzeigen

```bash
export FC_TARGET_EMAIL="test@example.com"
npm run users:access
unset FC_TARGET_EMAIL
```

## Beispiel: Capability entziehen

```bash
export FC_TARGET_EMAIL="test@example.com"
export FC_ACTOR_EMAIL="admin@example.com"
export FC_CAPABILITY_CODE="inventory_manager"
npm run users:revoke-capability
unset FC_TARGET_EMAIL FC_ACTOR_EMAIL FC_CAPABILITY_CODE
```

## Beispiel: Capability wieder vergeben

```bash
export FC_TARGET_EMAIL="test@example.com"
export FC_ACTOR_EMAIL="admin@example.com"
export FC_CAPABILITY_CODE="inventory_manager"
npm run users:grant-capability
unset FC_TARGET_EMAIL FC_ACTOR_EMAIL FC_CAPABILITY_CODE
```

Noch keine öffentliche Admin-API und keine UI. Das folgt später nach echter Workspace-Isolation.
