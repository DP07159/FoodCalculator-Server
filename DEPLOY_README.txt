Food Moment Platform – Shopping Share R14 – Collaborative additions – 2026-09-11

Server-only hotfix based on R13.

Changed:
- src/modules/shopping/service.js

Behavior:
- If a workspace receives exactly one shared shopping list, newly added manual items are written to the origin workspace and then mirrored back to all participating target workspaces.
- This also makes amount changes performed by adding/adjusting the same shopping item through the existing add flow visible in the origin list.
- Origin-workspace additions continue to work as before and are mirrored to all shared workspaces.
- If a workspace receives multiple different shared lists, additions remain local to avoid silently assigning an item to the wrong origin list.

No migration required.
