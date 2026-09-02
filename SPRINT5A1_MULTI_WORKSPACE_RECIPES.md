# Sprint 5A.1 – Multi-Workspace Recipe Assignment

## Fachmodell

Ein Rezept existiert genau einmal und kann mehreren Workspaces zugeordnet sein.

`recipes.workspace_id` bleibt vorläufig als Legacy-Kompatibilitätsanker erhalten.
Die echte Sichtbarkeit wird ab `0006` ausschließlich über:

`recipe_workspace_assignments`

bestimmt.

## Regeln

- Ein Recipe-Owner kann ein eigenes Rezept nur Workspaces zuweisen, in denen er selbst eine aktive Membership hat.
- Mehrere Workspaces können in einem Request ausgewählt werden.
- Fremde Workspace-IDs werden serverseitig abgelehnt.
- Ein Rezept muss mindestens einem Workspace zugeordnet bleiben.
- Änderungen am Rezept wirken in allen zugeordneten Workspaces, weil keine Kopie erzeugt wird.
- Entfernen/Löschen im aktuellen Workspace entfernt zunächst nur diese Workspace-Zuordnung.
- Erst wenn keine Workspace-Zuordnung mehr existiert, wird der zugrunde liegende Rezeptdatensatz gelöscht.

## API

GET `/recipes/:id/workspace-assignments`

PUT `/recipes/:id/workspace-assignments`

Payload:

```json
{
  "workspace_public_ids": ["uuid-1", "uuid-2"]
}
```

## Migration

`0006_recipe_workspace_assignments.sql`

Bestehende `recipes.workspace_id`-Zuordnungen werden verlustfrei in die n:m-Tabelle übernommen.
