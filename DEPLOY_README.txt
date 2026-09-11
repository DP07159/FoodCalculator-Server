Food Moment Platform – Shopping Share Completed-State Fix R12 – Server Delta – 2026-09-11

Deploy this delta on top of the current R11 server.

Changed files:
- src/modules/shopping/service.js
- src/modules/shopping/routes.js

Fixes:
- completed shared shopping items are mirrored into target workspaces instead of disappearing
- "Schon im Wagen" now behaves the same in source and shared workspaces
- restoring a completed item from either workspace is synchronized to all linked workspaces
- clearing completed items in a shared workspace also clears the corresponding source entries, preventing them from reappearing on the next sync

No database migration is required.
