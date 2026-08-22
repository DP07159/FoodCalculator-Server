# Sprint 7 · Module Registry + collision-safe Mobile Header

## Ziel
Die Platform Shell soll Navigation und Home-Actions nicht länger aus fest codierten Frontend-Modulnamen zusammensetzen. Gleichzeitig wird die mobile Header-Kollision zwischen Workspace-Auswahl, Wortmarke und Logout strukturell beseitigt.

## Server
- Neuer Platform-Core-Bereich `src/core/moduleRegistry/`.
- `registry.js` beschreibt UI-neutrale Plattformmetadaten der Capability Modules: Code, Name, Navigation, sekundäre Navigation, Home-Actions und Intent-Schlüssel.
- Neuer geschützter Endpoint `GET /platform/context`.
- Der Endpoint verbindet Registry-Metadaten mit Effective Permissions und Module Entitlements des aktiven Workspace.
- Er unterscheidet `module_not_enabled` und `missing_privilege`.
- Keine Datenbankmigration nötig; `platform_modules` und `membership_module_access` bleiben die Entitlement-Quelle.

## Frontend
- `navigation.js` bezieht Capability-Module über `/platform/context` und baut Sidebar, Bottom Navigation und Burger-Menü daraus auf.
- `index.html` enthält keine hart codierten Home-Actions mehr.
- `home.js` rendert die verfügbaren Home-Actions aus dem Registry-Kontext und nutzt deren Intent-Schlüssel für die einfache Intent-Auflösung.
- Home und Administration bleiben Platform-Shell-/Utility-Einstiege und keine Capability Modules.

## Mobile Header Repair
Ursache der Kollision war eine doppelte Verantwortlichkeit: `AuthShell` fügte Workspace/User/Logout direkt in `.app-header` ein, während die neue Platform Shell dort zugleich Burger und Wortmarke platzierte.

Neue Regel:
- Mobile Header: ausschließlich Burger + Food-Moment-Wortmarke.
- Workspace-Auswahl, User und Logout: Burger-Menü.
- Desktop: Workspace/User in der persistenten Sidebar.
- `AuthShell` rendert seine Legacy-Header-Controls nur noch als Fallback, wenn keine Platform Navigation vorhanden ist.
- CSS besitzt zusätzlich einen defensiven Mobile-Fallback, der Legacy-Controls im Header ausblendet.

Damit ist das Layout unabhängig von der Länge von Workspace- und Benutzernamen stabil.

## Tests
- JS-Syntaxchecks für geänderte Frontend- und Serverdateien.
- `tests/module-registry.test.js` prüft Registry-Codes, Navigation, Home-Action und Inventory-Privilege.
- Keine Migrationen und keine Änderungen an Fachdaten.
