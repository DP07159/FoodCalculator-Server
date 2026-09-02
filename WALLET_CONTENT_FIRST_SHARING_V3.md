# Wallet V3 – Workspace Sharing

Migration 0011 adds `wallet_workspace_assignments`. Existing Wallet items are backfilled into their current workspace. Visibility is resolved through assignments, mirroring recipe workspace assignments. The legacy `wallet_items.workspace_id` remains for compatibility but is no longer the visibility source. Only the creator may manage assignments/edit/delete.
