const express = require("express");
const recipeController = require("./controller");
const { requireAuthentication } = require("../../core/identity/middleware");
const { requireWorkspaceContext } = require("../../core/workspaces/middleware");

const router = express.Router();

router.use(requireAuthentication);
router.use(requireWorkspaceContext);

router.get("/", recipeController.getAllRecipes);
router.get("/:id", recipeController.getRecipeById);
router.patch("/:id/favorite", recipeController.updateRecipeFavorite);
router.delete("/:id", recipeController.deleteRecipe);

module.exports = router;
