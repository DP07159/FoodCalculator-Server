const database = require("../../database/database");
const recipeRepository = require("./repository");
const workspaceRepository = require("../../core/workspaces/repository");

function normalizeWorkspacePublicIds(value) {
    if (!Array.isArray(value)) return [];

    return Array.from(new Set(
        value
            .map(item => String(item || "").trim())
            .filter(Boolean)
    ));
}

function mapWorkspaceOption(workspace, assignedIds) {
    return {
        public_id: workspace.public_id,
        name: workspace.name,
        workspace_type: workspace.workspace_type,
        is_owner: Number(workspace.is_owner) === 1,
        is_assigned: assignedIds.has(Number(workspace.id))
    };
}

async function getOwnedRecipeForManagement({
    recipeId,
    currentWorkspaceId,
    userId
}) {
    const recipe = await recipeRepository.findById(
        recipeId,
        currentWorkspaceId
    );

    if (!recipe) {
        return { notFound: true };
    }

    if (Number(recipe.owner_user_id) !== Number(userId)) {
        return {
            forbidden: true,
            error: "Nur der Eigentümer des Rezepts kann Workspace-Zuordnungen verwalten."
        };
    }

    return { recipe };
}

async function getAssignmentOptions({
    recipeId,
    currentWorkspaceId,
    userId
}) {
    const access = await getOwnedRecipeForManagement({
        recipeId,
        currentWorkspaceId,
        userId
    });

    if (access.notFound || access.forbidden) return access;

    const [eligibleWorkspaces, assignments] = await Promise.all([
        workspaceRepository.listActiveWorkspacesForUser(userId),
        recipeRepository.listWorkspaceAssignments(recipeId)
    ]);

    const assignedIds = new Set(
        assignments.map(item => Number(item.workspace_id))
    );

    return {
        value: {
            recipe: {
                id: Number(access.recipe.id),
                name: access.recipe.name
            },
            workspaces: eligibleWorkspaces.map(workspace =>
                mapWorkspaceOption(workspace, assignedIds)
            ),
            assignment_count: assignments.length
        }
    };
}

async function setAssignments({
    recipeId,
    currentWorkspaceId,
    userId,
    workspacePublicIds
}) {
    const selectedPublicIds =
        normalizeWorkspacePublicIds(workspacePublicIds);

    if (selectedPublicIds.length === 0) {
        return {
            error: "Das Rezept muss mindestens einem Workspace zugeordnet bleiben."
        };
    }

    const access = await getOwnedRecipeForManagement({
        recipeId,
        currentWorkspaceId,
        userId
    });

    if (access.notFound || access.forbidden) return access;

    const eligibleWorkspaces =
        await workspaceRepository.listActiveWorkspacesForUser(userId);

    const eligibleByPublicId = new Map(
        eligibleWorkspaces.map(workspace => [
            workspace.public_id,
            workspace
        ])
    );

    const invalidIds = selectedPublicIds.filter(
        publicId => !eligibleByPublicId.has(publicId)
    );

    if (invalidIds.length > 0) {
        return {
            forbidden: true,
            error: "Ein oder mehrere ausgewählte Workspaces sind für diesen Benutzer nicht verfügbar."
        };
    }

    const existingAssignments =
        await recipeRepository.listWorkspaceAssignments(recipeId);

    const eligibleWorkspaceIds = new Set(
        eligibleWorkspaces.map(workspace => Number(workspace.id))
    );

    const selectedWorkspaceIds = new Set(
        selectedPublicIds.map(publicId =>
            Number(eligibleByPublicId.get(publicId).id)
        )
    );

    await database.run("BEGIN");

    try {
        // Nur Zuordnungen innerhalb der aktuell zulässigen Memberships ändern.
        // Eventuelle historische Zuordnungen außerhalb dieses Bereichs bleiben unangetastet.
        for (const workspace of eligibleWorkspaces) {
            const workspaceId = Number(workspace.id);

            if (selectedWorkspaceIds.has(workspaceId)) {
                await recipeRepository.addWorkspaceAssignment({
                    recipeId,
                    workspaceId,
                    assignedByUserId: userId
                });
            } else {
                await recipeRepository.removeWorkspaceAssignment(
                    recipeId,
                    workspaceId
                );
            }
        }

        const allAssignmentsAfter =
            await recipeRepository.listWorkspaceAssignments(recipeId);

        if (allAssignmentsAfter.length === 0) {
            throw new Error(
                "Das Rezept muss mindestens einem Workspace zugeordnet bleiben."
            );
        }

        // Legacy-Feld bleibt konsistent, ist aber nicht mehr Quelle der Sichtbarkeit.
        const preferredLegacyAssignment =
            allAssignmentsAfter.find(item =>
                selectedWorkspaceIds.has(Number(item.workspace_id))
            ) || allAssignmentsAfter[0];

        await recipeRepository.updateLegacyWorkspaceId(
            recipeId,
            preferredLegacyAssignment.workspace_id
        );

        await database.run("COMMIT");

        const assignedAfterIds = new Set(
            allAssignmentsAfter.map(item => Number(item.workspace_id))
        );

        const currentWorkspaceStillAssigned =
            assignedAfterIds.has(Number(currentWorkspaceId));

        return {
            value: {
                recipe: {
                    id: Number(access.recipe.id),
                    name: access.recipe.name
                },
                workspaces: eligibleWorkspaces.map(workspace =>
                    mapWorkspaceOption(workspace, assignedAfterIds)
                ),
                current_workspace_still_assigned:
                    currentWorkspaceStillAssigned
            }
        };
    } catch (error) {
        await database.run("ROLLBACK").catch(() => {});
        throw error;
    }
}

module.exports = {
    normalizeWorkspacePublicIds,
    getAssignmentOptions,
    setAssignments
};
