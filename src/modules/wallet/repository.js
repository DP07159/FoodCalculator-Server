const { run, get, all } = require("../../database/database");

const visibleSelect = `
    SELECT
        wi.*,
        u.display_name AS created_by_name,
        (SELECT COUNT(*) FROM wallet_workspace_assignments wwa_count WHERE wwa_count.wallet_item_id = wi.id) AS workspace_assignment_count,
        (SELECT COUNT(*) FROM wallet_recipe_links wrl_count WHERE wrl_count.wallet_item_id = wi.id) AS recipe_link_count,
        (SELECT COUNT(*) FROM food_moment_wallet_links fmwl_count WHERE fmwl_count.wallet_item_id = wi.id) AS food_moment_link_count
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
        title, note, category, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'saved')`, [
        item.public_id,item.workspace_id,item.created_by_user_id,item.source_type,
        item.source_url,item.source_platform,item.source_external_id,item.source_image_url,
        item.source_page_title,item.title,item.note,item.category
    ]);
    return result.lastID;
}

async function updateItemByOwner(publicId, userId, fields) {
    const sets=[]; const params=[];
    for (const [key,value] of Object.entries(fields)) {
        if (!["title","note","status","source_url","source_platform","source_image_url","source_page_title","category"].includes(key)) continue;
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

async function listRecipeLinksForItem(walletItemId, workspaceId) {
    return all(`SELECT wrl.recipe_id, wrl.linked_by_user_id, wrl.created_at
        FROM wallet_recipe_links wrl
        INNER JOIN recipe_workspace_assignments rwa ON rwa.recipe_id = wrl.recipe_id
        WHERE wrl.wallet_item_id = ? AND rwa.workspace_id = ?
        ORDER BY wrl.created_at ASC`, [walletItemId, workspaceId]);
}

async function addRecipeLink({walletItemId, recipeId, linkedByUserId}) {
    return run(`INSERT INTO wallet_recipe_links (wallet_item_id, recipe_id, linked_by_user_id)
        VALUES (?, ?, ?)
        ON CONFLICT(wallet_item_id, recipe_id) DO NOTHING`, [walletItemId, recipeId, linkedByUserId]);
}

async function removeRecipeLink(walletItemId, recipeId) {
    return run(`DELETE FROM wallet_recipe_links WHERE wallet_item_id = ? AND recipe_id = ?`, [walletItemId, recipeId]);
}

async function listItemsForRecipe(recipeId, workspaceId) {
    return all(`${visibleSelect}
        INNER JOIN wallet_recipe_links wrl ON wrl.wallet_item_id = wi.id
        WHERE wrl.recipe_id = ?
          AND EXISTS (
            SELECT 1 FROM wallet_workspace_assignments wwa
            WHERE wwa.wallet_item_id = wi.id AND wwa.workspace_id = ?
          )
        ORDER BY wi.saved_at DESC, wi.id DESC`, [recipeId, workspaceId]);
}

async function listFoodMomentLinksForItem(walletItemId, workspaceId) {
    return all(`SELECT DISTINCT fm.id,fm.public_id,fm.title,fm.moment_date,fm.moment_time,fm.starts_at,fm.status,
            CASE WHEN fmwl.wallet_item_id IS NULL THEN 0 ELSE 1 END AS is_linked
        FROM food_moments fm
        LEFT JOIN food_moment_workspace_assignments fmwa ON fmwa.food_moment_id = fm.id
        LEFT JOIN food_moment_wallet_links fmwl ON fmwl.food_moment_id = fm.id AND fmwl.wallet_item_id = ?
        WHERE (fm.workspace_id = ? OR fmwa.workspace_id = ?)
        ORDER BY CASE WHEN fm.starts_at IS NULL THEN 1 ELSE 0 END, fm.starts_at ASC, fm.created_at DESC`,
        [walletItemId, workspaceId, workspaceId]);
}
async function addFoodMomentLink({walletItemId, foodMomentId}) { return run(`INSERT OR IGNORE INTO food_moment_wallet_links (food_moment_id, wallet_item_id) VALUES (?, ?)`,[foodMomentId,walletItemId]); }
async function removeFoodMomentLink(walletItemId, foodMomentId) { return run(`DELETE FROM food_moment_wallet_links WHERE wallet_item_id = ? AND food_moment_id = ?`,[walletItemId,foodMomentId]); }

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
    updateLegacyWorkspaceId,
    listRecipeLinksForItem,
    addRecipeLink,
    removeRecipeLink,
    listItemsForRecipe,
    listFoodMomentLinksForItem,
    addFoodMomentLink,
    removeFoodMomentLink
};
