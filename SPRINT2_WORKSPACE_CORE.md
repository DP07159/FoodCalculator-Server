# Sprint 2 – Workspace Core

## Ziel
Umsetzung der Plattformphase 2 aus dem technischen Lastenheft V2.1:
- `workspaces`
- `workspace_memberships`
- `workspace_invitations`
- persönlicher Workspace für jeden aktiven Benutzer
- aktiver Workspace-Kontext

Bestehende Rezepte, Inventardaten und Wochenpläne werden in diesem Sprint **noch nicht** einem Workspace zugeordnet. Das folgt gemäß Migrationsplan erst in Phase 5.

## Neue Endpunkte

### GET /workspaces
Erfordert Bearer-Authentifizierung. Liefert alle aktiven Workspaces des Benutzers.

### GET /workspaces/current
Erfordert Bearer-Authentifizierung und Workspace-Kontext.

Optional kann ein Workspace explizit über den Header angegeben werden:

`X-Workspace-Id: <workspace-public-uuid>`

Ohne Header wird der aktive persönliche Workspace verwendet.

## Bootstrap

Nach Migration:

```bash
npm run workspace:bootstrap
```

Der Befehl ist idempotent:
- fehlende persönliche Workspaces werden angelegt,
- bestehende werden nicht dupliziert,
- Owner-Membership wird aktiv gesetzt.

## Tests

```bash
npm run smoke
npm run test:identity
npm run test:workspace
npm run migrate
npm run workspace:bootstrap
```

## Architekturgrenze
Noch keine Rollen, Capabilities oder Privileges. Diese folgen in Sprint 3 – Authorization.
