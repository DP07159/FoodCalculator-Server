const express = require("express");
const mealPlanService = require("./service");

const router = express.Router();

router.get("/meal_plans", async (req, res) => {
    try {
        res.json(await mealPlanService.getAllMealPlans());
    } catch (error) {
        console.error("Fehler bei GET /meal_plans:", error.message);
        res.status(500).json({ error: "Fehler beim Laden der Wochenpläne" });
    }
});

router.get("/meal_plans/:id", async (req, res) => {
    try {
        const plan = await mealPlanService.getMealPlanById(req.params.id);
        if (!plan) return res.status(404).json({ error: "Wochenplan nicht gefunden" });
        res.json(plan);
    } catch (error) {
        console.error("Fehler bei GET /meal_plans/:id:", error.message);
        res.status(500).json({ error: "Fehler beim Laden des Wochenplans" });
    }
});

router.post("/meal_plans", async (req, res) => {
    try {
        const result = await mealPlanService.createMealPlan(req.body || {});
        if (result.error) return res.status(400).json({ error: result.error });
        res.status(201).json(result.value);
    } catch (error) {
        console.error("Fehler bei POST /meal_plans:", error.message);
        res.status(500).json({ error: "Fehler beim Speichern des Wochenplans" });
    }
});

router.put("/meal_plans/:id", async (req, res) => {
    try {
        const result = await mealPlanService.updateMealPlan(req.params.id, req.body || {});
        if (result.error) return res.status(400).json({ error: result.error });
        if (result.notFound) return res.status(404).json({ error: "Wochenplan nicht gefunden" });
        res.json(result.value);
    } catch (error) {
        console.error("Fehler bei PUT /meal_plans/:id:", error.message);
        res.status(500).json({ error: "Fehler beim Aktualisieren des Wochenplans" });
    }
});

router.delete("/meal_plans/:id", async (req, res) => {
    try {
        const deleted = await mealPlanService.deleteMealPlan(req.params.id);
        if (!deleted) return res.status(404).json({ error: "Wochenplan nicht gefunden" });
        res.json({ success: true });
    } catch (error) {
        console.error("Fehler bei DELETE /meal_plans/:id:", error.message);
        res.status(500).json({ error: "Fehler beim Löschen des Wochenplans" });
    }
});

module.exports = router;
