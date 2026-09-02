# Sprint 5A – HTTP Scope Fix

## Fehler
`recipeQueryRoutes` und `recipeWriteRoutes` waren mit:

`router.use(requireAuthentication)`

global auf dem Router geschützt und in `index.js` ohne Prefix gemountet.

Dadurch liefen auch fachfremde Requests wie `/auth/login` zuerst durch die
Recipe-Authentication und erhielten `401 Anmeldung erforderlich.`

## Fix
Authentication und Workspace-Kontext werden nur noch an den tatsächlich
geschützten `/recipes/...`-Routen registriert.

Betroffen:
- `src/modules/recipes/queryRoutes.js`
- `src/modules/recipes/writeRoutes.js`

`/auth/login`, `/workspaces`, `/authorization` und andere Module werden dadurch
nicht mehr von Recipe-Middleware abgefangen.
