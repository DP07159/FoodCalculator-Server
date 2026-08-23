const { run, get, all } = require("../../database/database");

const visibleSelect = `
    SELECT
        wi.*,
        u.display_name AS created_by_name,
        (SELECT COUNT(*) FROM wallet_workspace_assignments wwa_count WHERE wwa_count.wallet_item_id = wi.id) AS workspace_assignment_count
    FROM wallet_items wi
    LEFT JOIN users u ON u.id = wi.created_by_user_id`;

async function listItems(workspaceId, status = "saved") {
    const params = [workspaceId];
    let statusClause = "";
    if (status && status !== "all") {
        statusClause = " AND wi.status = ?";
        params.push(status);
    }
    return all(`${visibleSelect}
        WHERE EXISTS (
            SELECT 1
            FROM wallet_workspace_assignments wwa
            WHERE wwa.wallet_item_id = wi.id
              AND wwa.workspace_id = ?
        )${statusClause}
        ORDER BY wi.saved_at DESC, wi.id DESC`, params);
}

async function findByPublicId(workspaceId, publicId) {
    return get(`${visibleSelect}
        WHERE wi.public_id = ?
          AND EXISTS (
            SELECT 1
            FROM wallet_workspace_assignments wwa
            WHERE wwa.wallet_item_id = wi.id
              AND wwa.workspace_id = ?
          )
        LIMIT 1`, [publicId, workspaceId]);
}

async function findOwnedByPublicId(publicId, userId) {
    return get(`${visibleSelect}
        WHERE wi.public_id = ?
          AND wi.created_by_user_id = ?
        LIMIT 1`, [publicId, userId]);
}

async function insertItem(item) {
    const result = await run(`INSERT INTO wallet_items (
        public_id, workspace_id, created_by_user_id, source_type, source_url,
        source_platform, source_external_id, source_image_url, source_page_title,
        title, note, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'saved')`, [
        item.public_id,item.workspace_id,item.created_by_user_id,item.source_type,
        item.source_url,item.source_platform,item.source_external_id,item.source_image_url,
        item.source_page_title,item.title,item.note
    ]);
    return result.lastID;
}

async function updateItemByOwner(publicId, userId, fields) {
    const sets=[]; const params=[];
    for (const [key,value] of Object.entries(fields)) {
        if (!["title","note","status","source_url","source_platform","source_image_url","source_page_title"].includes(key)) continue;
        sets.push(`${key} = ?`); params.push(value);
    }
    if (!sets.length) return 0;
    sets.push("updated_at = CURRENT_TIMESTAMP");
    params.push(publicId, userId);
    const result = await run(`UPDATE wallet_items SET ${sets.join(", ")} WHERE public_id = ? AND created_by_user_id = ?`, params);
    return result.changes;
}

async function deleteItemByOwner(publicId, userId) {
    const result = await run(`DELETE FROM wallet_items WHERE public_id = ? AND created_by_user_id = ?`, [publicId, userId]);
    return result.changes;
}

async function listWorkspaceAssignments(walletItemId) {
    return all(`SELECT
        wwa.id,
        wwa.wallet_item_id,
        wwa.workspace_id,
        wwa.assigned_by_user_id,
        wwa.created_at,
        w.public_id AS workspace_public_id,
        w.name AS workspace_name,
        w.workspace_type
    FROM wallet_workspace_assignments wwa
    INNER JOIN workspaces w ON w.id = wwa.workspace_id
    WHERE wwa.wallet_item_id = ?
    ORDER BY CASE WHEN w.workspace_type = 'personal' THEN 0 ELSE 1 END,
             w.name COLLATE NOCASE ASC`, [walletItemId]);
}

async function addWorkspaceAssignment({walletItemId, workspaceId, assignedByUserId}) {
    return run(`INSERT INTO wallet_workspace_assignments (
        wallet_item_id, workspace_id, assigned_by_user_id
    ) VALUES (?, ?, ?)
    ON CONFLICT(wallet_item_id, workspace_id) DO NOTHING`, [walletItemId, workspaceId, assignedByUserId]);
}

async function removeWorkspaceAssignment(walletItemId, workspaceId) {
    return run(`DELETE FROM wallet_workspace_assignments WHERE wallet_item_id = ? AND workspace_id = ?`, [walletItemId, workspaceId]);
}

async function updateLegacyWorkspaceId(walletItemId, workspaceId) {
    return run(`UPDATE wallet_items SET workspace_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [workspaceId, walletItemId]);
}

module.exports = {
    listItems,
    findByPublicId,
    findOwnedByPublicId,
    insertItem,
    updateItemByOwner,
    deleteItemByOwner,
    listWorkspaceAssignments,
    addWorkspaceAssignment,
    removeWorkspaceAssignment,
    updateLegacyWorkspaceId
};
