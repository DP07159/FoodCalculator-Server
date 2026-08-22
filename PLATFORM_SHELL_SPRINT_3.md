# Platform Shell Sprint 3

## Ziel
Responsive Plattformnavigation gemäß Design Principles und visuelle/strukturelle Angleichung des Inventars an die autonomen Capability Modules.

## Umgesetzt
- persistente, schmale Desktop-Sidebar für Home, Wochenplan, Rezepte und Inventar
- separate sekundäre Navigation für kontextabhängige Aktionen/Administration
- Mobile Bottom Navigation mit vier primären Zielen
- Workspace- und User-Kontext in der Desktop-Shell
- Berechtigungslogik der bestehenden Navigation wird auch für Sidebar und Bottom Navigation verwendet
- aktive Modulzustände inklusive Rezept-Unterseiten und Admin-Unterseiten
- Inventar als `module-page inventory-module` mit gleicher Seitenhierarchie wie Recipes und Meal Planning
- bestehendes Burger-Menü bleibt auf Mobile/Tablet als sekundärer Zugang bestehen
- keine Datenbankmigration und keine Fach-API-Änderung

## Architekturbezug
Die Shell trennt primäre Capability-Navigation, sekundäre Bereiche und Workspace-Kontext. Nicht verfügbare Navigationseinträge werden weiterhin über die Effective-Permissions-Auflösung ausgeblendet.
