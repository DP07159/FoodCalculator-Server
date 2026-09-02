# User & Access Management V1

## Ziel

Die Benutzer- und Zugriffsverwaltung wird als eigener Plattformbereich
produktreif aufgebaut.

Die Zielkette bleibt:

User
→ Platform Role
→ Workspace Membership
→ Module Access
→ Workspace Role
→ Capability
→ Privilege

## Sprint 6A – User Admin API

Umgesetzt:

- globale Platform-Admin-Rolle getrennt von Workspace-Rollen
- initialer Platform-Admin-Bootstrap per CLI
- User-Liste mit Suche und Statusfilter
- User-Detail mit allen Workspace-Memberships
- Aktivieren / Pending / Suspendieren
- bei Suspend/Pending werden aktive Sessions widerrufen
- alle Sessions eines Users manuell widerrufen
- Rollen pro Membership verwalten
- Capabilities pro Membership an-/abschalten
- Admin-Katalog für spätere UI

### Admin-Endpunkte

- GET `/platform-admin/users`
- GET `/platform-admin/users/:publicId`
- PATCH `/platform-admin/users/:publicId/status`
- POST `/platform-admin/users/:publicId/revoke-sessions`
- GET `/platform-admin/catalog`
- PUT `/platform-admin/memberships/:membershipId/role`
- PUT `/platform-admin/memberships/:membershipId/capabilities/:capabilityCode`
- PUT `/platform-admin/memberships/:membershipId/modules/:moduleCode`

Alle Endpunkte benötigen:
1. gültige Session
2. globale Platform-Admin-Rolle

## Sprint 6B – Module Entitlements

Umgesetzt:

- eigener Modul-Katalog
- `recipes`
- `meal_plan`
- `inventory`
- Modulzugriff pro Workspace-Membership
- Default bleibt für bestehende Memberships aktiviert
- expliziter Admin-Override kann ein Modul aktivieren/deaktivieren
- Server-Gate liefert bei deaktiviertem Modul HTTP 403 / `MODULE_DISABLED`

Wichtig:
Module Access ist bewusst getrennt von Capabilities.

Beispiel:
`inventory = disabled`
→ Inventar ist komplett gesperrt.

`inventory = enabled`, aber Capability fehlt
→ Modul ist erreichbar, einzelne Aktionen können später durch Privileges
  eingeschränkt werden.

## Danach

### Sprint 6C – Self Registration
- öffentliche Registrierung
- neuer User zunächst `pending`
- Passwort-Credential
- persönlicher Workspace
- Owner-Membership
- Freischaltung durch Admin
- später optional E-Mail-Verifikation

### Sprint 6D – Forgot Password
- Reset-Anforderung
- gehashtes Einmal-Token
- Ablaufzeit
- Passwort setzen
- Token invalidieren
- Sessions widerrufen

### Sprint 6E – Admin Frontend
- Userübersicht
- Userdetail
- Status
- Memberships
- Module
- Rollen
- Capabilities

### Sprint 6F – Registration / Password Reset Frontend
- Registrierungsseite
- Pending-Status
- Passwort-vergessen
- Passwort-neu-setzen

## Sicherheitsregeln

- Kein Platform Admin über Workspace-Membership.
- Ein persönlicher Workspace-Owner bleibt organisatorisch `tenant_admin`.
- Fachliche Einschränkung erfolgt über Module/Capabilities.
- Modul-Sperren werden serverseitig durchgesetzt.
- Suspendierte User verlieren bestehende Sessions.
