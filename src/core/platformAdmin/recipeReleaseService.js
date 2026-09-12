const repository = require("./recipeReleaseRepository");

function normalizePublicIds(values) {
    if (!Array.isArray(values)) return [];
    return [...new Set(values.map(value => String(value || "").trim()).filter(Boolean))];
}

async function listReleases() {
    const [recipes, workspaces] = await Promise.all([
        repository.listRecipesWithReleaseState(),
        repository.listActiveWorkspaces()
    ]);

    const enriched = [];
    for (const recipe of recipes) {
        const selected = recipe.platform_release_mode === "selected"
            ? await repository.listSelectedReleaseWorkspaces(recipe.id)
            : [];
        enriched.push({
            id: recipe.id,
            name: recipe.name,
            owner: {
                display_name: recipe.owner_display_name || "",
                email: recipe.owner_email || ""
            },
            origin_workspace: recipe.origin_workspace_id ? {
                public_id: recipe.origin_workspace_public_id,
                name: recipe.origin_workspace_name,
                workspace_type: recipe.origin_workspace_type
            } : null,
            release: {
                mode: recipe.platform_release_mode || "none",
                workspace_public_ids: selected.map(item => item.public_id)
            }
        });
    }

    return {
        recipes: enriched,
        workspaces: workspaces.map(workspace => ({
            public_id: workspace.public_id,
            name: workspace.name,
            workspace_type: workspace.workspace_type
        }))
    };
}

async function setRelease({ recipeId, mode, workspacePublicIds, actorUser }) {
    const id = Number(recipeId);
    if (!Number.isInteger(id) || id <= 0) {
        return { error: "Ungültige Rezept-ID." };
    }

    const recipe = await repository.findRecipe(id);
    if (!recipe) return { notFound: true };

    const normalizedMode = String(mode || "none").trim().toLowerCase();
    if (!["none", "selected", "global"].includes(normalizedMode)) {
        return { error: "Ungültiger Freigabemodus." };
    }

    let desiredWorkspaceIds = [];
    let selectedRows = [];

    if (normalizedMode === "global") {
        selectedRows = await repository.listActiveWorkspaces();
        desiredWorkspaceIds = selectedRows.map(item => Number(item.id));
    } else if (normalizedMode === "selected") {
        const publicIds = normalizePublicIds(workspacePublicIds);
        selectedRows = await repository.findActiveWorkspacesByPublicIds(publicIds);
        if (selectedRows.length !== publicIds.length) {
            return { error: "Mindestens ein Workspace ist nicht mehr verfügbar." };
        }
        desiredWorkspaceIds = selectedRows.map(item => Number(item.id));
    }

    const desired = new Set(desiredWorkspaceIds);
    const existingGrants = await repository.listPlatformGrants(id);

    for (const grant of existingGrants) {
        if (!desired.has(Number(grant.workspace_id))) {
            await repository.removePlatformAssignment(id, Number(grant.workspace_id));
        }
    }

    for (const workspaceId of desired) {
        await repository.ensurePlatformAssignment({
            recipeId: id,
            workspaceId,
            actorUserId: actorUser?.id || null
        });
    }

    await repository.clearSelectedReleaseWorkspaces(id);

    if (normalizedMode === "none") {
        await repository.deleteRelease(id);
    } else {
        await repository.upsertRelease(id, normalizedMode, actorUser?.id || null);
        if (normalizedMode === "selected") {
            for (const workspace of selectedRows) {
                await repository.addSelectedReleaseWorkspace(id, workspace.id);
            }
        }
    }

    return {
        value: {
            recipe_id: id,
            mode: normalizedMode,
            workspace_public_ids: normalizedMode === "selected"
                ? selectedRows.map(item => item.public_id)
                : []
        }
    };
}

module.exports = {
    listReleases,
    setRelease
};
