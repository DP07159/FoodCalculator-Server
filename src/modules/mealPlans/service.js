const { run, get, all } = require("../../database/database");

function normalizePlanRow(plan) {
    let data = [];
    try {
        data = JSON.parse(plan.data || "[]");
    } catch {
        data = [];
    }
    return { id: plan.id, name: plan.name, data };
}

async function getAllMealPlans() {
    const rows = await all(`SELECT * FROM meal_plans ORDER BY id DESC`);
    return rows.map(normalizePlanRow);
}

async function getMealPlanById(planId) {
    const row = await get(`SELECT * FROM meal_plans WHERE id = ?`, [planId]);
    return row ? normalizePlanRow(row) : null;
}

async function createMealPlan(payload) {
    const name = typeof payload?.name === "string" ? payload.name.trim() : "";
    const data = Array.isArray(payload?.data) ? payload.data : null;
    if (!name || !data) return { error: "Name und Daten sind erforderlich." };

    const result = await run(
        `INSERT INTO meal_plans (name, data) VALUES (?, ?)`,
        [name, JSON.stringify(data)]
    );
    const created = await get(`SELECT * FROM meal_plans WHERE id = ?`, [result.lastID]);
    return { value: normalizePlanRow(created) };
}

async function updateMealPlan(planId, payload) {
    const name = typeof payload?.name === "string" ? payload.name.trim() : "";
    const data = Array.isArray(payload?.data) ? payload.data : null;
    if (!name || !data) return { error: "Name und Daten sind erforderlich." };

    const result = await run(
        `UPDATE meal_plans SET name = ?, data = ? WHERE id = ?`,
        [name, JSON.stringify(data), planId]
    );
    if (result.changes === 0) return { notFound: true };

    const updated = await get(`SELECT * FROM meal_plans WHERE id = ?`, [planId]);
    return { value: normalizePlanRow(updated) };
}

async function deleteMealPlan(planId) {
    const result = await run(`DELETE FROM meal_plans WHERE id = ?`, [planId]);
    return result.changes > 0;
}

module.exports = {
    getAllMealPlans,
    getMealPlanById,
    createMealPlan,
    updateMealPlan,
    deleteMealPlan
};
