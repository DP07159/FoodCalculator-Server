# Sprint 5A.1 – Recipe Module Sync Fix

## Ursache
Der aktuell deployte `repository.js` ist bereits workspacefähig, aber
`service.js` stammt noch aus dem alten Single-User-Stand.

Dadurch ruft der Service:

`recipeRepository.findAll()`

ohne `workspaceId` auf. Das Repository filtert korrekt nach Workspace und
liefert deshalb mit `undefined` keine Rezepte zurück.

## Fix
Dieses Paket synchronisiert den kompletten relevanten Recipe-Read-/Assignment-Pfad:

- `repository.js`
- `service.js`
- `controller.js`
- `routes.js`
- `workspaceAssignmentService.js`
- `index.js`

Damit gilt wieder konsistent:

HTTP -> Workspace Middleware -> Controller -> Service(workspaceId) -> Repository(workspaceId)

Der Repository-Fix bleibt defensiv:
Rezepte sind sichtbar, wenn entweder die neue n:m-Zuordnung oder der
bestehende Legacy-Workspace-Anker passt.

Keine Datenbankänderung und keine Migration.
