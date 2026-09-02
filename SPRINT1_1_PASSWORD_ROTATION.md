# Sprint 1.1 – Password Rotation

## Ziel
Sicherer Passwortwechsel für authentifizierte Benutzer.

## Neuer Endpunkt
`POST /auth/change-password`

Bearer-Token erforderlich. Request:

```json
{
  "current_password": "...",
  "new_password": "...",
  "revoke_other_sessions": true
}
```

Regeln:
- aktuelles Passwort wird mit Argon2id verifiziert
- neues Passwort mindestens 12 Zeichen
- neues Passwort darf nicht identisch sein
- Passwort wird neu mit Argon2id gehasht
- `password_changed_at` wird aktualisiert
- Fehlversuche und Sperre werden zurückgesetzt
- standardmäßig werden alle anderen aktiven Sessions widerrufen
- die aktuelle Session bleibt aktiv

Keine Schema-Migration erforderlich.
