const { run, get, all } = require("../../database/database");

async function findAll(workspaceId) {
    return all(
        `SELECT DISTINCT r.*
         FROM recipes r
         INNER JOIN recipe_workspace_assignments rwa
            ON rwa.recipe_id = r.id
         WHERE rwa.workspace_id = ?
           AND r.visibility <> 'archived'
         ORDER BY r.name COLLATE NOCASE ASC`,
        [workspaceId]
    );
}

async function findById(recipeId, workspaceId) {
    return get(
        `SELECT r.*
         FROM recipes r
         INNER JOIN recipe_workspace_assignments rwa
            ON rwa.recipe_id = r.id
         WHERE r.id = ?
           AND rwa.workspace_id = ?
         LIMIT 1`,
        [recipeId, workspaceId]
    );
}

async function create(recipe, workspaceId, ownerUserId) {
    const result = await run(
        `INSERT INTO recipes (
            workspace_id,
            owner_user_id,
            name,
            calories,
            portions,
            mealTypes,
            ingredients,
            instructions,
            is_favorite,
            visibility,
            version,
            created_at,
            updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'workspace', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        [
            workspaceId,
            ownerUserId,
            recipe.name,
            recipe.calories,
            recipe.portions,
            JSON.stringify(recipe.mealTypes),
            recipe.ingredients,
            recipe.instructions,
            recipe.is_favorite
        ]
    );

    await addWorkspaceAssignment({
        recipeId: result.lastID,
        workspaceId,
        assignedByUserId: ownerUserId
    });

    return findById(result.lastID, workspaceId);
}

async function update(recipeId, recipe, workspaceId) {
    const visible = await findById(recipeId, workspaceId);
    if (!visible) return null;

    await run(
        `UPDATE recipes
         SET
            name = ?,
            calories = ?,
            portions = ?,
            mealTypes = ?,
            ingredients = ?,
            instructions = ?,
            is_favorite = ?,
            version = COALESCE(version, 1) + 1,
            updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [
            recipe.name,
            recipe.calories,
            recipe.portions,
            JSON.stringify(recipe.mealTypes),
            recipe.ingredients,
            recipe.instructions,
            recipe.is_favorite,
            recipeId
        ]
    );

    return findById(recipeId, workspaceId);
}

async function updateFavorite(recipeId, isFavorite, workspaceId) {
    const visible = await findById(recipeId, workspaceId);
    if (!visible) return { changes: 0 };

    return run(
        `UPDATE recipes
         SET is_favorite = ?,
             version = COALESCE(version, 1) + 1,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [isFavorite, recipeId]
    );
}

async function deleteIngredients(recipeId) {
    return run(
        `DELETE FROM recipe_ingredients WHERE recipe_id = ?`,
        [recipeId]
    );
}

async function deleteById(recipeId) {
    return run(
        `DELETE FROM recipes WHERE id = ?`,
        [recipeId]
    );
}

async function findIngredientLinks(recipeId) {
    return all(
        `SELECT
            ri.sort_order AS line_index,
            ri.raw_text,
            ri.food_name,
            ri.amount,
            ri.unit,
            ri.food_item_id,
            ri.link_source,
            fi.display_name AS food_display_name
         FROM recipe_ingredients ri
         LEFT JOIN food_items fi
            ON fi.id = ri.food_item_id
         WHERE ri.recipe_id = ?
         ORDER BY ri.sort_order ASC`,
        [recipeId]
    );
}

async function listWorkspaceAssignments(recipeId) {
    return all(
        `SELECT
            rwa.id,
            rwa.recipe_id,
            rwa.workspace_id,
            rwa.assigned_by_user_id,
            rwa.created_at,
            w.public_id AS workspace_public_id,
            w.name AS workspace_name,
            w.workspace_type
         FROM recipe_workspace_assignments rwa
         INNER JOIN workspaces w
            ON w.id = rwa.workspace_id
         WHERE rwa.recipe_id = ?
         ORDER BY
            CASE WHEN w.workspace_type = 'personal' THEN 0 ELSE 1 END,
            w.name COLLATE NOCASE ASC`,
        [recipeId]
    );
}

async function addWorkspaceAssignment({
    recipeId,
    workspaceId,
    assignedByUserId
}) {
    return run(
        `INSERT INTO recipe_workspace_assignments (
            recipe_id,
            workspace_id,
            assigned_by_user_id
         )
         VALUES (?, ?, ?)
         ON CONFLICT(recipe_id, workspace_id)
         DO NOTHING`,
        [recipeId, workspaceId, assignedByUserId]
    );
}

async function removeWorkspaceAssignment(recipeId, workspaceId) {
    return run(
        `DELETE FROM recipe_workspace_assignments
         WHERE recipe_id = ?
           AND workspace_id = ?`,
        [recipeId, workspaceId]
    );
}

async function countWorkspaceAssignments(recipeId) {
    const row = await get(
        `SELECT COUNT(*) AS count
         FROM recipe_workspace_assignments
         WHERE recipe_id = ?`,
        [recipeId]
    );

    return Number(row?.count) || 0;
}

async function updateLegacyWorkspaceId(recipeId, workspaceId) {
    return run(
        `UPDATE recipes
         SET workspace_id = ?,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [workspaceId, recipeId]
    );
}

module.exports = {
    findAll,
    findById,
    findIngredientLinks,
    create,
    update,
    updateFavorite,
    deleteIngredients,
    deleteById,
    listWorkspaceAssignments,
    addWorkspaceAssignment,
    removeWorkspaceAssignment,
    countWorkspaceAssignments,
    updateLegacyWorkspaceId
};
