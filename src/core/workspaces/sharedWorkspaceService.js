const crypto = require("crypto");
const workspaceRepository = require("./repository");
const identityRepository = require("../identity/repository");
const authorizationRepository = require("../authorization/repository");
const accessManagementService = require("../authorization/accessManagementService");
const { normalizeWorkspaceName, validateWorkspaceName } = require("./validator");

async function getActiveUserByEmail(email) {
    const user = await identityRepository.findUserByEmail(email);
    if (!user || user.status !== "active" || user.deleted_at) {
        throw new Error("Aktiver Benutzer wurde nicht gefunden.");
    }
    return user;
}

async function createFamilyWorkspace({
    name,
    ownerEmail
}) {
    const workspaceName = normalizeWorkspaceName(name);
    const nameError = validateWorkspaceName(workspaceName);
    if (nameError) throw new Error(nameError);

    const owner = await getActiveUserByEmail(ownerEmail);

    const workspace = await workspaceRepository.createWorkspace({
        publicId: crypto.randomUUID(),
        name: workspaceName,
        workspaceType: "family",
        ownerUserId: null
    });

    const membership = await workspaceRepository.createMembership({
        workspaceId: workspace.id,
        userId: owner.id,
        status: "active",
        isOwner: true
    });

    const roleResult = await accessManagementService.setManagedRole({
        email: owner.email,
        workspacePublicId: workspace.public_id,
        roleCode: "tenant_admin",
        actorEmail: owner.email
    });

    if (roleResult.error) {
        throw new Error(roleResult.error);
    }

    return {
        workspace: {
            public_id: workspace.public_id,
            name: workspace.name,
            workspace_type: workspace.workspace_type,
            status: workspace.status
        },
        owner: {
            public_id: owner.public_id,
            email: owner.email,
            display_name: owner.display_name
        },
        membership: {
            status: membership.status,
            is_owner: Number(membership.is_owner) === 1
        },
        role: "tenant_admin"
    };
}

async function addFamilyMember({
    workspacePublicId,
    memberEmail,
    actorEmail,
    roleCode = "family_user"
}) {
    const actor = await getActiveUserByEmail(actorEmail);
    const member = await getActiveUserByEmail(memberEmail);

    const actorWorkspace = await workspaceRepository.findActiveWorkspaceForUserByPublicId(
        actor.id,
        workspacePublicId
    );

    if (!actorWorkspace || Number(actorWorkspace.is_owner) !== 1) {
        throw new Error("Actor ist kein aktiver Owner dieses Workspace.");
    }

    if (actorWorkspace.workspace_type !== "family") {
        throw new Error("Dieser Befehl ist nur für Family-Workspaces vorgesehen.");
    }

    const membership = await workspaceRepository.createMembership({
        workspaceId: actorWorkspace.id,
        userId: member.id,
        status: "active",
        isOwner: false
    });

    const roleResult = await accessManagementService.setManagedRole({
        email: member.email,
        workspacePublicId,
        roleCode,
        actorEmail: actor.email
    });

    if (roleResult.error) {
        throw new Error(roleResult.error);
    }

    return {
        workspace: {
            public_id: actorWorkspace.public_id,
            name: actorWorkspace.name,
            workspace_type: actorWorkspace.workspace_type
        },
        member: {
            public_id: member.public_id,
            email: member.email,
            display_name: member.display_name
        },
        membership: {
            status: membership.status,
            is_owner: Number(membership.is_owner) === 1
        },
        role: roleCode
    };
}

module.exports = {
    createFamilyWorkspace,
    addFamilyMember
};
