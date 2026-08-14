const express = require("express");
const recipeQueryService = require("./queryService");
const { requireAuthentication } = require("../../core/identity/middleware");
const { requireWorkspaceContext } = require("../../core/workspaces/middleware");

const router = express.Router();

router.use(requireAuthentication);
router.use(requireWorkspaceContext);

router.get("/recipes/by-food-item/:foodItemId", async (req, res) => {
    try {
        const result = await recipeQueryService.getRecipesByFoodItem(
            req.params.foodItemId,
            req.workspaceId
        );
        if (result.error) return res.status(result.status || 400).json({ error: result.error });
        res.json(result.value);
    } catch (error) {
        console.error("Fehler bei GET /recipes/by-food-item/:foodItemId:", error.message);
        res.status(500).json({ error: "Rezepte zum Lebensmittel konnten nicht geladen werden" });
    }
});

router.get("/recipes/by-ingredient/:name", async (req, res) => {
    try {
        const result = await recipeQueryService.getRecipesByIngredient(
            req.params.name,
            req.workspaceId
        );
        if (result.error) return res.status(result.status || 400).json({ error: result.error });
        res.json(result.value);
    } catch (error) {
        console.error("Fehler bei GET /recipes/by-ingredient/:name:", error.message);
        res.status(500).json({ error: "Rezepte zur Zutat konnten nicht geladen werden" });
    }
});

router.get("/recipes/:id/stock-check", async (req, res) => {
    try {
        const result = await recipeQueryService.getRecipeStockCheck(
            req.params.id,
            req.query.portions,
            req.workspaceId
        );
        if (result.notFound) return res.status(404).json({ error: "Rezept nicht gefunden" });
        res.json(result.value);
    } catch (error) {
        console.error("Fehler bei GET /recipes/:id/stock-check:", error.message);
        res.status(500).json({ error: "Bestandsprüfung konnte nicht geladen werden" });
    }
});

module.exports = router;
