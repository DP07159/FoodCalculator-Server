# Consolidated Sprint 5A.1 Backend Sync

This package consolidates the files that must exist together.

Critical checks after deployment:

1. `src/core/workspaces/service.js` exports `resolveWorkspaceContextForUser`.
2. `src/core/workspaces/middleware.js` sets `req.workspaceId`.
3. `src/modules/recipes/service.js` calls `recipeRepository.findAll(workspaceId)`.
4. `src/modules/recipes/repository.js` contains `listWorkspaceAssignments`.
5. `index.js` mounts `recipeRoutes` at `/recipes`.
6. `package.json` contains `test:recipe-multi-workspace`.
7. Migration `0006_recipe_workspace_assignments.sql` is present.

No database file is included.
