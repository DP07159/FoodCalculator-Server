function mapWorkspace(row) {
    if (!row) return null;
    return {
        public_id: row.public_id,
        name: row.name,
        workspace_type: row.workspace_type,
        status: row.status,
        is_owner: Number(row.is_owner) === 1,
        membership_status: row.membership_status || null,
        created_at: row.created_at,
        updated_at: row.updated_at
    };
}

function mapMembership(row) {
    if (!row) return null;
    return {
        id: row.id,
        workspace_id: row.workspace_id,
        user_id: row.user_id,
        status: row.status,
        is_owner: Number(row.is_owner) === 1,
        joined_at: row.joined_at,
        created_at: row.created_at,
        updated_at: row.updated_at
    };
}

module.exports = { mapWorkspace, mapMembership };
