# Sprint 4A – Test-User Provisioning

## Ziel
Sichere, kontrollierte Anlage und Verwaltung erster Test-User **ohne öffentliches Self-Signup**.

Ein provisionierter User erhält atomar:
- `users`-Datensatz
- Argon2id-Passwort-Credential
- persönlichen Workspace
- aktive Owner-Membership
- Rolle `tenant_admin` im eigenen persönlichen Workspace
- die im aktuellen Seed definierten Default-Capabilities dieser Rolle

Das entspricht dem bestehenden Personal-Owner-Modell. Unterschiedliche Rollen in gemeinsamen Workspaces folgen in Sprint 4B.

## Neue CLI-Befehle

### User auflisten
```bash
npm run users:list
```

### User provisionieren
Passwort niemals als Kommandozeilenargument übergeben.

```bash
read -p "E-Mail: " FC_USER_EMAIL
read -p "Name: " FC_USER_NAME
read -s -p "Initialpasswort: " FC_USER_PASSWORD; echo
export FC_USER_EMAIL FC_USER_NAME FC_USER_PASSWORD
npm run users:provision
unset FC_USER_EMAIL FC_USER_NAME FC_USER_PASSWORD
```

Optional:
```bash
export FC_USER_LOCALE="de-DE"
export FC_USER_WORKSPACE="Persönlicher Workspace"
```

### User sperren
```bash
export FC_USER_EMAIL="user@example.com"
export FC_USER_STATUS="suspended"
npm run users:set-status
unset FC_USER_EMAIL FC_USER_STATUS
```

Beim Sperren werden alle aktiven Sessions des Users widerrufen.

### User reaktivieren
```bash
export FC_USER_EMAIL="user@example.com"
export FC_USER_STATUS="active"
npm run users:set-status
unset FC_USER_EMAIL FC_USER_STATUS
```

## Sicherheitsgrenze
Diese CLI-Befehle sind Operator-/Deployment-Werkzeuge. Sie sind **keine HTTP-Admin-API** und umgehen deshalb nicht das noch zu vervollständigende Platform-Admin-Modell.

Externe Test-User dürfen trotz existierendem Login **noch nicht produktiv losgelassen werden**. Recipes, Meal Plans und Inventory sind noch nicht vollständig workspace-isoliert. Das folgt in Sprint 5.

## Tests
```bash
npm run smoke
npm run test:identity
npm run test:workspace
npm run test:authorization
npm run test:user-provisioning
npm run users:list
```
