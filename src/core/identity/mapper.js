function mapUser(row) {
    if (!row) return null;
    return {
        public_id: row.public_id,
        email: row.email,
        display_name: row.display_name,
        status: row.status,
        locale: row.locale || null,
        created_at: row.created_at,
        updated_at: row.updated_at
    };
}

function mapSession(row) {
    if (!row) return null;
    return {
        id: row.id,
        expires_at: row.expires_at,
        last_seen_at: row.last_seen_at,
        user_agent: row.user_agent || null,
        created_at: row.created_at
    };
}

module.exports = { mapUser, mapSession };
