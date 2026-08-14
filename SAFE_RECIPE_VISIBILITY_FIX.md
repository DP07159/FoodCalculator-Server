# Safe Recipe Visibility Fix

Dieser Fix stellt die Rezept-Sichtbarkeit defensiv wieder her.

Ein Rezept gilt für einen Workspace als sichtbar, wenn:
1. `recipes.workspace_id` noch auf diesen Workspace zeigt (Legacy-Anker), ODER
2. eine Zeile in `recipe_workspace_assignments` für diesen Workspace existiert.

Damit bleiben bereits gespeicherte Inhalte sichtbar, während die neue
Multi-Workspace-Zuordnung parallel weiter unterstützt wird.

Es werden keine Daten migriert, gelöscht oder umgeschrieben.
