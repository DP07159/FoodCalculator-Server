Food Moment Platform – Debug/Visual Fix R3 – Server Delta – 2026-09-10

Replace the files at the same relative paths in the server deployment.
Changed files:
- src/modules/foodMoments/routes.js
- src/modules/wallet/repository.js
- src/modules/wallet/workspaceAssignmentService.js

Includes:
- transactional, verified Recipe ↔ Food Moment linking
- non-owner users can save a shared-workspace inspiration into their own personal workspace
- existing owner workspace-management behavior remains intact

No database migration is required.
Deploy together with the matching R3 frontend delta.
