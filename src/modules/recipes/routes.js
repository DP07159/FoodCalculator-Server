const express = require("express");
const recipeController = require("./controller");

const router = express.Router();

router.get("/", recipeController.getAllRecipes);
router.get("/:id", recipeController.getRecipeById);
router.patch("/:id/favorite", recipeController.updateRecipeFavorite);
router.delete("/:id", recipeController.deleteRecipe);

module.exports = router;
