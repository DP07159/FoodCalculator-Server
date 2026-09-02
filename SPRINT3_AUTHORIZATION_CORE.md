# Sprint 3 – Authorization Core

## Ziel
Umsetzung von Phase 3 des technischen Lastenhefts V2.1:

`User → Membership → Role → Capability → Privilege → Effective Permission`

## Tabellen
- `roles`
- `membership_roles`
- `capabilities`
- `privileges`
- `capability_privileges`
- `membership_capabilities`
- `role_default_capabilities` (optionales, im Lastenheft vorgesehenes Default-Mapping)

## Seed
Systemrollen:
- `platform_admin`
- `tenant_admin`
- `standard_user`
- `guest`
- `family_user`
- `medic`

Inventar als Referenzimplementierung:
- Capabilities: `inventory_viewer`, `inventory_stock_editor`, `inventory_manager`
- atomare Inventar-Privileges gemäß Zugriffsmatrix

Der initiale Workspace-Owner erhält:
- Rolle `tenant_admin`
- Inventar Viewer
- Bestandsbearbeiter
- Inventar Manager

## Wichtige Architekturentscheidung
Berechtigungen werden **nicht** am User gespeichert. Sie werden zur Laufzeit aus der aktiven Membership und den zugewiesenen Capabilities berechnet.

Ein nicht vorhandenes Privilege bedeutet keine Erlaubnis. Explizite Deny-/Policy-Ebenen folgen in den vorgesehenen Folgesprints.

## Endpunkt
`GET /authorization/effective-permissions`

Erfordert:
- Bearer-Authentifizierung
- aktiven Workspace-Kontext

## Middleware
`authorization.middleware.requirePrivilege("inventory.view")`

Die Middleware ist implementiert, wird in diesem Sprint aber noch nicht auf die bestehenden Inventarrouten geschaltet. So kann die Berechtigungsengine zuerst isoliert abgenommen werden.

## Bootstrap und Tests

```bash
npm run smoke
npm run test:identity
npm run test:workspace
npm run test:authorization
npm run migrate
npm run authorization:bootstrap
```

Danach kann der Effektivberechtigungs-Endpunkt mit einem gültigen Login-Token getestet werden.
