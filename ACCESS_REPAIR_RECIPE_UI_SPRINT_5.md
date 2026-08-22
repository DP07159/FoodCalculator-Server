# Sprint 5 · Access Repair & Recipe UI

## Behobene Regressionen

### Workspace-Wechsel
Der Workspace-Wechsel war technisch weiterhin in `auth-shell.js` vorhanden, wurde nach Einführung der persistenten Sidebar aber nicht mehr in der neuen Shell gerendert. Die neue Navigation rendert nun einen Workspace-Selektor sowohl in der Desktop-Sidebar als auch im mobilen/Burger-Kontext. Bei nur einem Workspace bleibt eine ruhige statische Anzeige bestehen.

### Platform Admin
Die Navigation hatte `platform_admin` fälschlich aus `/authorization/effective-permissions` erwartet. Diese API liefert workspacebezogene Rollen; `platform_admin` liegt jedoch als globale Rolle in `user_platform_roles`. Die Navigation prüft den globalen Adminzugang nun über einen geschützten Platform-Admin-Endpunkt (`/platform-admin/catalog`). Nur ein erfolgreicher Zugriff blendet den Adminbereich ein.

## Fortsetzung UI-Konsolidierung
- Rezept anlegen und Rezept bearbeiten als echte Modul-Screens mit einheitlichem Header.
- Formflächen von der großen Card-Hülle gelöst.
- Primäre Speicheraktion klar hervorgehoben.
- Kochansicht ruhiger und flächiger gestaltet.
- `Rezept bearbeiten` als ausgeschriebene Hauptaktion statt reinem Icon.

## Unverändert
- Keine Datenbankmigration.
- Keine Änderung der Rezept-API.
- Keine Änderung des Berechtigungsmodells im Backend.
- Keine Änderung der Food-Moment-Fachspezifikation.
