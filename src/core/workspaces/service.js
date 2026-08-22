const crypto = require("crypto");
const repository = require("./repository");
const { mapWorkspace, mapMembership } = require("./mapper");
const { normalizeWorkspaceName } = require("./validator");

async function ensurePersonalWorkspaceForUser(user, options = {}) {
    if (!user?.id) {
        throw new Error("Benutzer ist erforderlich.");
    }

    let workspace = await repository.findPersonalWorkspaceByOwnerUserId(user.id);
    let created = false;

    if (!workspace) {
        const name = normalizeWorkspaceName(
            options.name || process.env.DEFAULT_PERSONAL_WORKSPACE_NAME || "Persönlicher Workspace"
        );

        workspace = await repository.createWorkspace({
            publicId: crypto.randomUUID(),
            name,
            workspaceType: "personal",
            ownerUserId: user.id
        });

        created = true;
    }

    const membership = await repository.createMembership({
        workspaceId: workspace.id,
        userId: user.id,
        status: "active",
        isOwner: true
    });

    return {
        created,
        workspace: mapWorkspace({
            ...workspace,
            membership_status: membership.status,
            is_owner: membership.is_owner
        }),
        membership: mapMembership(membership)
    };
}

async function listWorkspacesForUser(userId) {
    const rows = await repository.listActiveWorkspacesForUser(userId);
    return rows.map(mapWorkspace);
}

async function resolveWorkspaceRecordForUser(userId, requestedPublicId = "") {
    const requested = String(requestedPublicId || "").trim();

    if (requested) {
        return repository.findActiveWorkspaceForUserByPublicId(userId, requested);
    }

    const personal = await repository.findActivePersonalWorkspaceForUser(userId);
    if (personal) return personal;

    const allWorkspaces = await repository.listActiveWorkspacesForUser(userId);
    if (allWorkspaces.length === 1) return allWorkspaces[0];

    return null;
}

async function resolveWorkspaceForUser(userId, requestedPublicId = "") {
    const row = await resolveWorkspaceRecordForUser(userId, requestedPublicId);
    return row ? mapWorkspace(row) : null;
}

async function resolveWorkspaceContextForUser(userId, requestedPublicId = "") {
    const row = await resolveWorkspaceRecordForUser(userId, requestedPublicId);

    if (!row) {
        return null;
    }

    return {
        workspaceId: row.id,
        workspace: mapWorkspace(row)
    };
}

async function bootstrapPersonalWorkspaces(options = {}) {
    const users = await repository.listActiveUsers();
    const results = [];

    for (const user of users) {
        const result = await ensurePersonalWorkspaceForUser(user, options);
        results.push({
            user: {
                public_id: user.public_id,
                email: user.email,
                display_name: user.display_name
            },
            ...result
        });
    }

    return results;
}

module.exports = {
    ensurePersonalWorkspaceForUser,
    listWorkspacesForUser,
    resolveWorkspaceRecordForUser,
    resolveWorkspaceForUser,
    resolveWorkspaceContextForUser,
    bootstrapPersonalWorkspaces
};
