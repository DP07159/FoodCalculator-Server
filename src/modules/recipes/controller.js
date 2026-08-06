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

async function updateRecipeFavorite(req, res) {
    try {
        const result = await recipeService.updateRecipeFavorite(
            req.params.id,
            req.body.is_favorite
        );

        if (!result) {
            return res.status(404).json({
                error: "Rezept nicht gefunden"
            });
        }

        res.json(result);
    } catch (error) {
        console.error(
            "Fehler bei PATCH /recipes/:id/favorite:",
            error.message
        );

        res.status(500).json({
            error: "Fehler beim Aktualisieren des Favoritenstatus"
        });
    }
}

async function deleteRecipe(req, res) {
    try {
        const deleted = await recipeService.deleteRecipe(req.params.id);

        if (!deleted) {
            return res.status(404).json({
                error: "Rezept nicht gefunden"
            });
        }

        res.json({
            success: true
        });
    } catch (error) {
        console.error(
            "Fehler bei DELETE /recipes/:id:",
            error.message
        );

        res.status(500).json({
            error: "Fehler beim Löschen des Rezepts"
        });
    }
}

module.exports = {
    getAllRecipes,
    getRecipeById,
    updateRecipeFavorite,
    deleteRecipe
};
