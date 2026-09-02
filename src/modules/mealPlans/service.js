const { run, get, all } = require("../../database/database");
const workspaceRepository = require("../../core/workspaces/repository");

function normalizePlanRow(plan) {
    let data = [];
    try { data = JSON.parse(plan.data || "[]"); } catch { data = []; }
    return { id: plan.id, name: plan.name, data, owner_user_id: plan.owner_user_id || null, plan_kind: plan.plan_kind || "template" };
}

async function getAllMealPlans(workspaceId) {
    const rows = await all(`SELECT DISTINCT p.* FROM meal_plans p
        LEFT JOIN meal_plan_workspace_assignments a ON a.meal_plan_id = p.id
        WHERE a.workspace_id = ? OR NOT EXISTS (
            SELECT 1 FROM meal_plan_workspace_assignments x WHERE x.meal_plan_id = p.id
        ) ORDER BY p.id DESC`, [workspaceId]);
    return rows.map(normalizePlanRow);
}
async function getMealPlanById(planId, workspaceId) {
    const row = await get(`SELECT p.* FROM meal_plans p WHERE p.id = ? AND (
        EXISTS (SELECT 1 FROM meal_plan_workspace_assignments a WHERE a.meal_plan_id=p.id AND a.workspace_id=?)
        OR NOT EXISTS (SELECT 1 FROM meal_plan_workspace_assignments x WHERE x.meal_plan_id=p.id)
    )`, [planId, workspaceId]);
    return row ? normalizePlanRow(row) : null;
}
async function createMealPlan(payload, workspaceId, userId) {
    const name = typeof payload?.name === "string" ? payload.name.trim() : "";
    const data = Array.isArray(payload?.data) ? payload.data : null;
    if (!name || !data) return { error: "Name und Daten sind erforderlich." };
    const result = await run(`INSERT INTO meal_plans (name, data, owner_user_id, plan_kind) VALUES (?, ?, ?, 'template')`, [name, JSON.stringify(data), userId]);
    await run(`INSERT OR IGNORE INTO meal_plan_workspace_assignments (meal_plan_id, workspace_id, assigned_by_user_id) VALUES (?, ?, ?)`, [result.lastID, workspaceId, userId]);
    return { value: normalizePlanRow(await get(`SELECT * FROM meal_plans WHERE id = ?`, [result.lastID])) };
}
async function updateMealPlan(planId, payload, workspaceId) {
    const visible = await getMealPlanById(planId, workspaceId);
    if (!visible) return { notFound: true };
    const name = typeof payload?.name === "string" ? payload.name.trim() : "";
    const data = Array.isArray(payload?.data) ? payload.data : null;
    if (!name || !data) return { error: "Name und Daten sind erforderlich." };
    await run(`UPDATE meal_plans SET name = ?, data = ? WHERE id = ?`, [name, JSON.stringify(data), planId]);
    return { value: normalizePlanRow(await get(`SELECT * FROM meal_plans WHERE id = ?`, [planId])) };
}
async function deleteMealPlan(planId, workspaceId) {
    const visible = await getMealPlanById(planId, workspaceId);
    if (!visible) return false;
    const result = await run(`DELETE FROM meal_plans WHERE id = ?`, [planId]);
    return result.changes > 0;
}
async function getWorkspaceAssignments(planId, workspaceId, userId) {
    const plan = await getMealPlanById(planId, workspaceId);
    if (!plan) return { notFound: true };
    const workspaces = await workspaceRepository.listActiveWorkspacesForUser(userId);
    let rows = await all(`SELECT workspace_id FROM meal_plan_workspace_assignments WHERE meal_plan_id=?`, [planId]);
    if (!rows.length) {
        await run(`INSERT OR IGNORE INTO meal_plan_workspace_assignments (meal_plan_id, workspace_id, assigned_by_user_id) VALUES (?, ?, ?)`, [planId, workspaceId, userId]);
        rows = [{workspace_id:workspaceId}];
    }
    const assigned = new Set(rows.map(r=>Number(r.workspace_id)));
    return { value: { plan:{id:Number(plan.id),name:plan.name}, workspaces:workspaces.map(w=>({public_id:w.public_id,name:w.name,workspace_type:w.workspace_type,is_owner:Number(w.is_owner)===1,is_assigned:assigned.has(Number(w.id))})) } };
}
async function setWorkspaceAssignments(planId, workspaceId, userId, publicIds) {
    const plan = await getMealPlanById(planId, workspaceId);
    if (!plan) return { notFound:true };
    const selected=[...new Set((Array.isArray(publicIds)?publicIds:[]).map(v=>String(v||'').trim()).filter(Boolean))];
    if (!selected.length) return { error:'Der Wochenplan muss mindestens einem Workspace zugeordnet bleiben.' };
    const eligible=await workspaceRepository.listActiveWorkspacesForUser(userId); const byId=new Map(eligible.map(w=>[w.public_id,w]));
    if (selected.some(id=>!byId.has(id))) return { forbidden:true,error:'Ein oder mehrere ausgewählte Workspaces stehen dir nicht zur Verfügung.' };
    const selectedIds=new Set(selected.map(id=>Number(byId.get(id).id)));
    await run('BEGIN');
    try {
        for (const w of eligible) {
            if (selectedIds.has(Number(w.id))) await run(`INSERT OR IGNORE INTO meal_plan_workspace_assignments (meal_plan_id, workspace_id, assigned_by_user_id) VALUES (?, ?, ?)`,[planId,w.id,userId]);
            else await run(`DELETE FROM meal_plan_workspace_assignments WHERE meal_plan_id=? AND workspace_id=?`,[planId,w.id]);
        }
        await run('COMMIT');
    } catch(e){ await run('ROLLBACK').catch(()=>{}); throw e; }
    return getWorkspaceAssignments(planId, selectedIds.has(Number(workspaceId))?workspaceId:Number(byId.get(selected[0]).id), userId);
}
module.exports={getAllMealPlans,getMealPlanById,createMealPlan,updateMealPlan,deleteMealPlan,getWorkspaceAssignments,setWorkspaceAssignments};
