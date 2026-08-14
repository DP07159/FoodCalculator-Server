# Sprint 5A – Migration Fix

Problem:
`recipes.workspace_id` und die weiteren V2-Rezeptspalten waren in der
Produktivdatenbank bereits vorhanden, obwohl Migration `0005` noch nicht
in `schema_migrations` registriert war.

Ursache:
Der historische `ensureSchema()`-Mechanismus kann Spalten ergänzen,
unabhängig vom versionierten Migration Runner.

Fix:
- `0005` verwendet `@ensure-column`-Direktiven.
- Der Migration Runner ergänzt eine Spalte nur, wenn Tabelle vorhanden
  und Spalte tatsächlich noch nicht vorhanden ist.
- Fehlt die Tabelle in einer frischen Smoke-Test-DB, legt `0005` sie
  vollständig an.
- Bereits vorhandene produktive Spalten werden nicht verändert.
- Bestehende Daten werden nur für `visibility`, `version`,
  `created_at` und `updated_at` vervollständigt.
- `workspace_id` und `owner_user_id` werden noch nicht automatisch gesetzt.
- Trigger erzwingen künftig die Pflichtregeln für `visibility` und `version`.

Keine bestehende Recipe-ID wird verändert oder gelöscht.
