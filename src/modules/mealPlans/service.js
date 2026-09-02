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

/* Paket 2: konkrete Planung auf Food-Moment-Basis */
const crypto = require('crypto');
function planningPublicId(){ return `fm_${crypto.randomBytes(12).toString('hex')}`; }
function validDate(v){ return /^\d{4}-\d{2}-\d{2}$/.test(String(v||'')); }
function validMeal(v){ return ['breakfast','lunch','dinner','snack'].includes(String(v||'')); }
function slotRef(date,mealType){ return `planning_slot|${date}|${mealType}`; }
function defaultTime(mealType){ return ({breakfast:'08:00',lunch:'12:30',dinner:'19:00',snack:'15:30'})[mealType] || '12:00'; }
async function hydratePlanningMoment(row, workspaceId){
    if(!row) return null;
    const recipes=await all(`SELECT r.id,r.name,r.calories,r.portions FROM food_moment_recipe_links l JOIN recipes r ON r.id=l.recipe_id WHERE l.food_moment_id=? AND (r.workspace_id=? OR EXISTS(SELECT 1 FROM recipe_workspace_assignments a WHERE a.recipe_id=r.id AND a.workspace_id=?)) ORDER BY l.id`,[row.id,workspaceId,workspaceId]);
    const inspirations=await all(`SELECT w.public_id,w.title,w.category,w.source_url,w.source_image_url FROM food_moment_wallet_links l JOIN wallet_items w ON w.id=l.wallet_item_id JOIN wallet_workspace_assignments a ON a.wallet_item_id=w.id AND a.workspace_id=? WHERE l.food_moment_id=? ORDER BY l.id`,[workspaceId,row.id]);
    const parts=String(row.source_reference||'').split('|');
    return {...row,is_all_day:Number(row.is_all_day)===1,recipes,inspirations,planning_date:parts[1]||String(row.starts_at||'').slice(0,10),meal_type:parts[2]||null};
}
async function getPlanningWeek(startDate, workspaceId){
    if(!validDate(startDate)) return {error:'Ungültiger Wochenstart.'};
    const rows=await all(`SELECT DISTINCT fm.* FROM food_moments fm LEFT JOIN food_moment_workspace_assignments a ON a.food_moment_id=fm.id WHERE (fm.workspace_id=? OR a.workspace_id=?) AND fm.source_code='planning_slot' AND fm.source_reference LIKE 'planning_slot|%' AND date(fm.starts_at)>=date(?) AND date(fm.starts_at)<date(?, '+7 day') ORDER BY fm.starts_at`,[workspaceId,workspaceId,startDate,startDate]);
    return {value:await Promise.all(rows.map(r=>hydratePlanningMoment(r,workspaceId)))};
}
async function upsertPlanningSlot(payload, workspaceId, userId){
    const date=String(payload?.date||''); const mealType=String(payload?.meal_type||'');
    if(!validDate(date)||!validMeal(mealType)) return {error:'Datum oder Mahlzeit ist ungültig.'};
    const recipeId=Number(payload?.recipe_id)||null; const walletPublicId=String(payload?.wallet_public_id||'').trim()||null;
    if(!recipeId && !walletPublicId) return {error:'Bitte Rezept oder Inspiration auswählen.'};
    let title='Food Moment';
    if(recipeId){ const r=await get(`SELECT r.id,r.name FROM recipes r WHERE r.id=? AND (r.workspace_id=? OR EXISTS(SELECT 1 FROM recipe_workspace_assignments a WHERE a.recipe_id=r.id AND a.workspace_id=?))`,[recipeId,workspaceId,workspaceId]); if(!r)return {error:'Rezept nicht gefunden.'}; title=r.name; }
    let wallet=null;
    if(walletPublicId){ wallet=await get(`SELECT w.id,w.title,w.source_page_title FROM wallet_items w JOIN wallet_workspace_assignments a ON a.wallet_item_id=w.id AND a.workspace_id=? WHERE w.public_id=? LIMIT 1`,[workspaceId,walletPublicId]); if(!wallet)return {error:'Inspiration nicht gefunden.'}; title=wallet.title||wallet.source_page_title||'Inspiration'; }
    const ref=slotRef(date,mealType); const startsAt=`${date}T${defaultTime(mealType)}:00`;
    let existing=await get(`SELECT fm.* FROM food_moments fm LEFT JOIN food_moment_workspace_assignments a ON a.food_moment_id=fm.id WHERE fm.source_code='planning_slot' AND fm.source_reference=? AND (fm.workspace_id=? OR a.workspace_id=?) LIMIT 1`,[ref,workspaceId,workspaceId]);
    await run('BEGIN');
    try{
        let id;
        if(existing){ id=existing.id; await run(`UPDATE food_moments SET title=?,starts_at=?,moment_date=?,moment_time=?,timing_code='scheduled',is_all_day=0,status='planned',updated_at=CURRENT_TIMESTAMP WHERE id=?`,[title,startsAt,date,defaultTime(mealType),id]); }
        else { const pub=planningPublicId(); const result=await run(`INSERT INTO food_moments(public_id,workspace_id,owner_user_id,title,timing_code,moment_date,moment_time,starts_at,is_all_day,audience_code,status,source_code,source_reference) VALUES(?,?,?,?,'scheduled',?,?,?,0,'open','planned','planning_slot',?)`,[pub,workspaceId,userId,title,date,defaultTime(mealType),startsAt,ref]); id=result.lastID; await run(`INSERT OR IGNORE INTO food_moment_workspace_assignments(food_moment_id,workspace_id,assigned_by_user_id) VALUES(?,?,?)`,[id,workspaceId,userId]); }
        await run(`DELETE FROM food_moment_recipe_links WHERE food_moment_id=?`,[id]); await run(`DELETE FROM food_moment_wallet_links WHERE food_moment_id=?`,[id]);
        if(recipeId) await run(`INSERT INTO food_moment_recipe_links(food_moment_id,recipe_id) VALUES(?,?)`,[id,recipeId]);
        if(wallet) { await run(`INSERT INTO food_moment_wallet_links(food_moment_id,wallet_item_id) VALUES(?,?)`,[id,wallet.id]); const pub=(await get(`SELECT public_id FROM food_moments WHERE id=?`,[id])).public_id; await run(`INSERT OR IGNORE INTO wallet_item_relations(wallet_item_id,target_type,target_reference,created_by_user_id) VALUES(?,'food_moment',?,?)`,[wallet.id,pub,userId]); }
        await run('COMMIT'); existing=await get(`SELECT * FROM food_moments WHERE id=?`,[id]);
        return {value:await hydratePlanningMoment(existing,workspaceId)};
    }catch(e){await run('ROLLBACK').catch(()=>{});throw e;}
}
async function deletePlanningSlot(date,mealType,workspaceId,userId){
    if(!validDate(date)||!validMeal(mealType)) return {error:'Datum oder Mahlzeit ist ungültig.'};
    const row=await get(`SELECT fm.* FROM food_moments fm LEFT JOIN food_moment_workspace_assignments a ON a.food_moment_id=fm.id WHERE fm.source_code='planning_slot' AND fm.source_reference=? AND (fm.workspace_id=? OR a.workspace_id=?) LIMIT 1`,[slotRef(date,mealType),workspaceId,workspaceId]);
    if(!row) return {value:{success:true}};
    if(Number(row.owner_user_id)!==Number(userId)) return {forbidden:true,error:'Nur der Eigentümer kann diesen Planungseintrag entfernen.'};
    await run(`DELETE FROM food_moments WHERE id=?`,[row.id]); return {value:{success:true}};
}
async function applyTemplateToWeek(planId,startDate,workspaceId,userId){
    const plan=await getMealPlanById(planId,workspaceId); if(!plan)return {notFound:true}; if(!validDate(startDate))return {error:'Ungültiger Wochenstart.'};
    const base=new Date(`${startDate}T12:00:00`); const dayIndex={Montag:0,Dienstag:1,Mittwoch:2,Donnerstag:3,Freitag:4,Samstag:5,Sonntag:6}; let count=0;
    for(const entry of plan.data||[]){ if(!entry||!validMeal(entry.mealType)||dayIndex[entry.day]===undefined)continue; const d=new Date(base); d.setDate(base.getDate()+dayIndex[entry.day]); const date=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; const payload={date,meal_type:entry.mealType,recipe_id:entry.recipeId||null,wallet_public_id:entry.walletId||null}; if(!payload.recipe_id&&!payload.wallet_public_id)continue; const r=await upsertPlanningSlot(payload,workspaceId,userId); if(!r.error)count++; }
    return {value:{success:true,created_or_updated:count}};
}
module.exports.getPlanningWeek=getPlanningWeek;
module.exports.upsertPlanningSlot=upsertPlanningSlot;
module.exports.deletePlanningSlot=deletePlanningSlot;
module.exports.applyTemplateToWeek=applyTemplateToWeek;
