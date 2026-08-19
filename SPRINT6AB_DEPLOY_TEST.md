# Sprint 6A + 6B – Deploy & Test

## 1. Deploy
Backend vollständig deployen.

## 2. Smoke

```bash
npm run smoke
```

Erwartung:
- `ok: true`
- 7 Migrationen bekannt
- `0007_user_admin_module_entitlements.sql`

## 3. Unit-Test

```bash
npm run test:platform-admin
```

Erwartung:
- `ok: true`

## 4. Migration

```bash
npm run migrate
```

Erwartung:
- `ok: true`
- `totalKnown: 7`

## 5. Ersten Platform Admin bootstrappen

```bash
export FC_PLATFORM_ADMIN_EMAIL="DEINE_ADMIN_EMAIL"
npm run platform-admin:bootstrap
unset FC_PLATFORM_ADMIN_EMAIL
```

Erwartung:
- `ok: true`
- `role: "platform_admin"`

Der Bootstrap funktioniert nur, solange noch kein aktiver Platform Admin
existiert.

## 6. Login-Token holen
Wie beim bisherigen Auth-Test einen frischen Bearer-Token erzeugen.

## 7. Admin-Liste testen

GET `/platform-admin/users`

Erwartung:
- Thomas und Maren
- Status
- aktive Membership-Anzahl

## 8. Userdetail
GET `/platform-admin/users/<PUBLIC_ID>`

Erwartung:
- Memberships
- Workspaces
- Rollen
- Capabilities
- Module

## 9. Modul deaktivieren

PUT `/platform-admin/memberships/<ID>/modules/inventory`

Body:

```json
{"enabled": false}
```

Danach mit genau diesem User und Workspace:
GET `/inventory`

Erwartung:
- HTTP 403
- `code: "MODULE_DISABLED"`

## 10. Modul wieder aktivieren

```json
{"enabled": true}
```

GET `/inventory`

Erwartung:
- kein MODULE_DISABLED mehr

## 11. User suspendieren

PATCH `/platform-admin/users/<PUBLIC_ID>/status`

```json
{"status": "suspended"}
```

Erwartung:
- Sessions werden widerrufen
- nächster authentifizierter Request schlägt fehl

Danach wieder `active` setzen.
