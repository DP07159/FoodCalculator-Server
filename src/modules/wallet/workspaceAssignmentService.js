const database = require("../../database/database");
const repository = require("./repository");
const workspaceRepository = require("../../core/workspaces/repository");

function normalizeWorkspacePublicIds(value) {
    if (!Array.isArray(value)) return [];
    return Array.from(new Set(value.map(item => String(item || "").trim()).filter(Boolean)));
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

async function getVisibleItem({publicId, userId}) {
    const item = await repository.findAccessibleByPublicIdForUser?.(publicId, userId);
    if (item) return { item, isOwner: Number(item.created_by_user_id) === Number(userId) };
    const owned = await repository.findOwnedByPublicId(publicId, userId);
    if (owned) return { item: owned, isOwner: true };
    return { forbidden: true, error: "Inspiration nicht gefunden oder nicht zugänglich." };
}

async function getAssignmentOptions({publicId, userId}) {
    const access = await getVisibleItem({publicId, userId});
    if (access.forbidden) return access;
    const [eligibleWorkspaces, assignments] = await Promise.all([
        workspaceRepository.listActiveWorkspacesForUser(userId),
        repository.listWorkspaceAssignments(access.item.id)
    ]);
    const assignedIds = new Set(assignments.map(item => Number(item.workspace_id)));
    const options = access.isOwner ? eligibleWorkspaces : eligibleWorkspaces.filter(w => w.workspace_type === "personal");
    return { value: {
        item: { public_id: access.item.public_id, title: access.item.title || access.item.source_page_title || "Inspiration" },
        workspaces: options.map(workspace => mapWorkspaceOption(workspace, assignedIds)),
        assignment_count: assignments.length,
        owner_mode: access.isOwner
    }};
}

async function setAssignments({publicId, currentWorkspaceId, userId, workspacePublicIds}) {
    const selectedPublicIds = normalizeWorkspacePublicIds(workspacePublicIds);
    const access = await getVisibleItem({publicId, userId});
    if (access.forbidden) return access;
    const eligibleWorkspaces = await workspaceRepository.listActiveWorkspacesForUser(userId);
    const eligibleByPublicId = new Map(eligibleWorkspaces.map(workspace => [workspace.public_id, workspace]));

    if (!access.isOwner) {
        const personal = eligibleWorkspaces.filter(w => w.workspace_type === "personal");
        const personalIds = new Set(personal.map(w => w.public_id));
        if (selectedPublicIds.some(id => !personalIds.has(id))) return { forbidden:true, error:"Du kannst diese Inspiration nur in deinen persönlichen Workspace übernehmen." };
        const assignmentsBefore = await repository.listWorkspaceAssignments(access.item.id);
        await database.run("BEGIN");
        try {
            for (const workspace of personal) {
                if (selectedPublicIds.includes(workspace.public_id)) await repository.addWorkspaceAssignment({walletItemId:access.item.id,workspaceId:workspace.id,assignedByUserId:userId});
                else await repository.removeWorkspaceAssignment(access.item.id, workspace.id);
            }
            await database.run("COMMIT");
        } catch(error) { await database.run("ROLLBACK").catch(()=>{}); throw error; }
        const after=await repository.listWorkspaceAssignments(access.item.id); const assignedAfterIds=new Set(after.map(a=>Number(a.workspace_id)));
        return { value:{ item:{public_id:access.item.public_id,title:access.item.title||access.item.source_page_title||"Inspiration"}, workspaces:personal.map(w=>mapWorkspaceOption(w,assignedAfterIds)), current_workspace_still_assigned:assignedAfterIds.has(Number(currentWorkspaceId)), assignment_count:after.length, owner_mode:false } };
    }

    if (!selectedPublicIds.length) return { error: "Die Inspiration muss mindestens einem Workspace zugeordnet bleiben." };
    const invalidIds = selectedPublicIds.filter(publicIdValue => !eligibleByPublicId.has(publicIdValue));
    if (invalidIds.length) return { forbidden: true, error: "Ein oder mehrere ausgewählte Workspaces sind für diesen Benutzer nicht verfügbar." };
    const selectedWorkspaceIds = new Set(selectedPublicIds.map(id => Number(eligibleByPublicId.get(id).id)));
    await database.run("BEGIN");
    try {
        for (const workspace of eligibleWorkspaces) {
            const workspaceId = Number(workspace.id);
            if (selectedWorkspaceIds.has(workspaceId)) await repository.addWorkspaceAssignment({walletItemId:access.item.id,workspaceId,assignedByUserId:userId});
            else await repository.removeWorkspaceAssignment(access.item.id,workspaceId);
        }
        const allAssignmentsAfter=await repository.listWorkspaceAssignments(access.item.id);
        if(!allAssignmentsAfter.length) throw new Error("Die Inspiration muss mindestens einem Workspace zugeordnet bleiben.");
        const preferredLegacy=allAssignmentsAfter.find(item=>selectedWorkspaceIds.has(Number(item.workspace_id)))||allAssignmentsAfter[0];
        await repository.updateLegacyWorkspaceId(access.item.id,preferredLegacy.workspace_id);
        await database.run("COMMIT");
        const assignedAfterIds=new Set(allAssignmentsAfter.map(item=>Number(item.workspace_id)));
        return {value:{item:{public_id:access.item.public_id,title:access.item.title||access.item.source_page_title||"Inspiration"},workspaces:eligibleWorkspaces.map(workspace=>mapWorkspaceOption(workspace,assignedAfterIds)),current_workspace_still_assigned:assignedAfterIds.has(Number(currentWorkspaceId)),assignment_count:allAssignmentsAfter.length,owner_mode:true}};
    } catch(error){await database.run("ROLLBACK").catch(()=>{});throw error;}
}

module.exports = { normalizeWorkspacePublicIds, getAssignmentOptions, setAssignments };
