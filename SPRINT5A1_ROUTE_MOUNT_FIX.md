# Sprint 5A.1 – Route Mount Fix

Ursache:
`src/modules/recipes/routes.js` enthielt die neuen Endpunkte
`/:id/workspace-assignments`, wurde in `index.js` aber nicht gemountet.

Folge:
Das Frontend konnte die n:m-Workspace-Zuordnung nicht über die vorgesehenen
API-Endpunkte speichern/lesen.

Fix:
`recipeRoutes` wird jetzt explizit unter `/recipes` gemountet:

`app.use("/recipes", recipeRoutes);`

Damit sind erreichbar:
- GET `/recipes`
- GET `/recipes/:id`
- GET `/recipes/:id/workspace-assignments`
- PUT `/recipes/:id/workspace-assignments`
- PATCH `/recipes/:id/favorite`
- DELETE `/recipes/:id`

Die Middleware in `recipeRoutes` bleibt dadurch sauber auf `/recipes/*`
begrenzt und kann `/auth/login` nicht mehr abfangen.
