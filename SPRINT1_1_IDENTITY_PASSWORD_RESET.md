# Sprint 1.1 – Identity Password Reset

Ein einmaliger CLI-Sicherheitsweg für den Fall, dass das Bootstrap-Passwort nicht mehr sicher oder nicht mehr bekannt ist.

## Aufruf

Empfohlen über Shell-Variablen:

```bash
read -p "E-Mail: " IDENTITY_RESET_EMAIL
read -s -p "Neues Passwort: " IDENTITY_RESET_PASSWORD; echo
export IDENTITY_RESET_EMAIL IDENTITY_RESET_PASSWORD
npm run identity:reset-password
unset IDENTITY_RESET_EMAIL IDENTITY_RESET_PASSWORD
```

Eigenschaften:
- mindestens 12 Zeichen
- Argon2id
- `password_changed_at` wird aktualisiert
- Fehlversuche und Lock werden zurückgesetzt
- alle bestehenden Sessions des Benutzers werden widerrufen
- kein Benutzer wird neu angelegt
