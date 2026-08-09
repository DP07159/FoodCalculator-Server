# Sprint 1 – Platform Core / Identity

## Ziel
Implementierung der Identity-Grundlage gemäß Technischem Lastenheft Plattformarchitektur V2.1.

## Implementiert
- Migration `0002_identity_core.sql`
- Tabellen `users`, `user_credentials`, `user_sessions`
- interne User-ID: `INTEGER PRIMARY KEY`
- externe User-ID: `public_id` als UUID
- Passwort-Hashing mit Argon2id
- serverseitige Sessions; nur SHA-256-Hash des Sessiontokens wird gespeichert
- Login-Lock nach 5 Fehlversuchen für 15 Minuten
- API: `POST /auth/login`
- API: `POST /auth/logout`
- API: `GET /auth/me`
- API: `GET /auth/sessions`
- API: `DELETE /auth/sessions/:id`
- CLI-Bootstrap für den allerersten Benutzer

## Bewusste Abgrenzung
- Noch keine Workspaces.
- Noch keine Rollen, Capabilities oder Privileges.
- Bestehende Fachrouten werden in Sprint 1 noch nicht geschützt.
- Der initiale Benutzer ist eine aktive Identität; die Rolle `platform_admin` wird erst im Authorization-Sprint zugewiesen.
- Kein Login-Frontend in diesem Sprint.

## Initialen Benutzer anlegen
Empfohlen über Render Environment Variables:

- `INITIAL_USER_EMAIL`
- `INITIAL_USER_DISPLAY_NAME`
- `INITIAL_USER_PASSWORD`
- optional `INITIAL_USER_LOCALE` (Default `de-DE`)
- optional `IP_HASH_SECRET` für pseudonymisierte IP-Sicherheitsinformation

Danach einmalig:

```bash
npm run identity:bootstrap
```

Der Bootstrap ist absichtlich gesperrt, sobald bereits ein Benutzer existiert.

## Authentifizierung testen
Login:

```bash
curl -X POST https://foodcalculator-server.onrender.com/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"DEINE_EMAIL","password":"DEIN_PASSWORT"}'
```

Die Antwort enthält ein einmaliges Bearer-Sessiontoken. Dieses Token wird nie im Klartext in SQLite gespeichert.

Aktuellen Benutzer prüfen:

```bash
curl https://foodcalculator-server.onrender.com/auth/me \
  -H "Authorization: Bearer DEIN_TOKEN"
```

Logout:

```bash
curl -X POST https://foodcalculator-server.onrender.com/auth/logout \
  -H "Authorization: Bearer DEIN_TOKEN"
```

## Abnahme
1. `npm run smoke`
2. `npm run test:identity`
3. `npm run migrate` → `0002_identity_core.sql` muss einmalig angewendet sein
4. `npm run identity:bootstrap`
5. Login erfolgreich
6. `/auth/me` mit Token erfolgreich
7. `/auth/me` ohne Token → HTTP 401
8. Logout erfolgreich
9. `/auth/me` mit ausgeloggtem Token → HTTP 401
10. Bestehende Food-Calculator-Funktionen weiterhin funktionsfähig
