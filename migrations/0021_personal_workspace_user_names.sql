-- Personal workspace nomenclature: the workspace name always mirrors the user's stored display_name.
UPDATE workspaces
SET name = (
        SELECT u.display_name
        FROM users u
        WHERE u.id = workspaces.owner_user_id
    ),
    updated_at = CURRENT_TIMESTAMP
WHERE workspace_type = 'personal'
  AND archived_at IS NULL
  AND owner_user_id IS NOT NULL
  AND EXISTS (
        SELECT 1
        FROM users u
        WHERE u.id = workspaces.owner_user_id
          AND u.deleted_at IS NULL
          AND u.display_name IS NOT NULL
          AND length(trim(u.display_name)) > 0
    )
  AND name <> (
        SELECT u.display_name
        FROM users u
        WHERE u.id = workspaces.owner_user_id
    );
