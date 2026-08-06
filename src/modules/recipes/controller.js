const recipeService = require("./service");

async function getAllRecipes(req, res) {
    try {
        const recipes = await recipeService.getAllRecipes();
        res.json(recipes);
    } catch (error) {
        console.error("Fehler bei GET /recipes:", error.message);
        res.status(500).json({
            error: "Fehler beim Laden der Rezepte"
        });
    }
}

async function getRecipeById(req, res) {
    try {
        const recipe = await recipeService.getRecipeById(req.params.id);

        if (!recipe) {
            return res.status(404).json({
                error: "Rezept nicht gefunden"
            });
        }

        res.json(recipe);
    } catch (error) {
        console.error("Fehler bei GET /recipes/:id:", error.message);
        res.status(500).json({
            error: "Fehler beim Laden des Rezepts"
        });
    }
}

module.exports = {
    getAllRecipes,
    getRecipeById
};
