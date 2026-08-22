const { run, get, all } = require("../../database/database");

async function listItems(workspaceId, status = "saved") {
    const params = [workspaceId];
    let statusClause = "";
    if (status && status !== "all") {
        statusClause = " AND wi.status = ?";
        params.push(status);
    }
    return all(
        `SELECT wi.*,
                u.display_name AS created_by_name
         FROM wallet_items wi
         LEFT JOIN users u ON u.id = wi.created_by_user_id
         WHERE wi.workspace_id = ?${statusClause}
         ORDER BY wi.saved_at DESC, wi.id DESC`,
        params
    );
}

async function findByPublicId(workspaceId, publicId) {
    return get(
        `SELECT wi.*,
                u.display_name AS created_by_name
         FROM wallet_items wi
         LEFT JOIN users u ON u.id = wi.created_by_user_id
         WHERE wi.workspace_id = ? AND wi.public_id = ?
         LIMIT 1`,
        [workspaceId, publicId]
    );
}

async function insertItem(item) {
    const result = await run(
        `INSERT INTO wallet_items (
            public_id, workspace_id, created_by_user_id,
            source_type, source_url, source_platform, source_external_id,
            title, note, status
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'saved')`,
        [
            item.public_id,
            item.workspace_id,
            item.created_by_user_id,
            item.source_type,
            item.source_url,
            item.source_platform,
            item.source_external_id,
            item.title,
            item.note
        ]
    );
    return result.lastID;
}

async function updateItem(workspaceId, publicId, fields) {
    const sets = [];
    const params = [];
    for (const [key, value] of Object.entries(fields)) {
        if (!["title", "note", "status"].includes(key)) continue;
        sets.push(`${key} = ?`);
        params.push(value);
    }
    if (!sets.length) return 0;
    sets.push("updated_at = CURRENT_TIMESTAMP");
    params.push(workspaceId, publicId);
    const result = await run(
        `UPDATE wallet_items SET ${sets.join(", ")}
         WHERE workspace_id = ? AND public_id = ?`,
        params
    );
    return result.changes;
}

async function deleteItem(workspaceId, publicId) {
    const result = await run(
        `DELETE FROM wallet_items WHERE workspace_id = ? AND public_id = ?`,
        [workspaceId, publicId]
    );
    return result.changes;
}

module.exports = { listItems, findByPublicId, insertItem, updateItem, deleteItem };
