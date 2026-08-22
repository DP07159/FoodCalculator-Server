const recipeService = require("./service");
const workspaceAssignmentService = require("./workspaceAssignmentService");

async function getAllRecipes(req, res) {
    try {
        const recipes = await recipeService.getAllRecipes(req.workspaceId);
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
        const recipe = await recipeService.getRecipeById(req.params.id, req.workspaceId, req.auth.user.id);

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
            req.body.is_favorite,
            req.workspaceId
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
        const deleted = await recipeService.deleteRecipe(req.params.id, req.workspaceId);

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

async function createRecipe(req, res) {
    try {
        const result = await recipeService.createRecipe(req.body);

        if (result.error) {
            return res.status(400).json({
                error: result.error
            });
        }

        res.status(201).json(result.value);
    } catch (error) {
        console.error(
            "Fehler bei POST /recipes:",
            error.message
        );

        res.status(500).json({
            error: "Fehler beim Speichern des Rezepts"
        });
    }
}

async function updateRecipe(req, res) {
    try {
        const result = await recipeService.updateRecipe(
            req.params.id,
            req.body
        );

        if (result.notFound) {
            return res.status(404).json({
                error: "Rezept nicht gefunden"
            });
        }

        if (result.error) {
            return res.status(400).json({
                error: result.error
            });
        }

        res.json(result.value);
    } catch (error) {
        console.error(
            "Fehler bei PUT /recipes/:id:",
            error.message
        );

        res.status(500).json({
            error: "Fehler beim Aktualisieren des Rezepts"
        });
    }
}


async function getWorkspaceAssignments(req, res) {
    try {
        const result = await workspaceAssignmentService.getAssignmentOptions({
            recipeId: req.params.id,
            currentWorkspaceId: req.workspaceId,
            userId: req.auth.user.id
        });

        if (result.notFound) {
            return res.status(404).json({ error: "Rezept nicht gefunden" });
        }

        if (result.forbidden) {
            return res.status(403).json({ error: result.error });
        }

        res.json(result.value);
    } catch (error) {
        console.error(
            "Fehler bei GET /recipes/:id/workspace-assignments:",
            error.message
        );
        res.status(500).json({
            error: "Workspace-Zuordnungen konnten nicht geladen werden."
        });
    }
}

async function updateWorkspaceAssignments(req, res) {
    try {
        const result = await workspaceAssignmentService.setAssignments({
            recipeId: req.params.id,
            currentWorkspaceId: req.workspaceId,
            userId: req.auth.user.id,
            workspacePublicIds: req.body.workspace_public_ids
        });

        if (result.notFound) {
            return res.status(404).json({ error: "Rezept nicht gefunden" });
        }

        if (result.forbidden) {
            return res.status(403).json({ error: result.error });
        }

        if (result.error) {
            return res.status(400).json({ error: result.error });
        }

        res.json(result.value);
    } catch (error) {
        console.error(
            "Fehler bei PUT /recipes/:id/workspace-assignments:",
            error.message
        );
        res.status(500).json({
            error: "Workspace-Zuordnungen konnten nicht gespeichert werden."
        });
    }
}

module.exports = {
    getAllRecipes,
    getRecipeById,
    createRecipe,
    updateRecipe,
    updateRecipeFavorite,
    deleteRecipe,
    getWorkspaceAssignments,
    updateWorkspaceAssignments
};
