const express = require("express");
const recipeWriteService = require("./writeService");

const router = express.Router();

router.post("/recipes", async (req, res) => {
    try {
        const result = await recipeWriteService.createRecipe(req.body);
        if (result.error) return res.status(400).json({ error: result.error });
        res.status(201).json(result.value);
    } catch (error) {
        console.error("Fehler bei POST /recipes:", error.message);
        res.status(500).json({ error: "Fehler beim Speichern des Rezepts" });
    }
});

router.put("/recipes/:id", async (req, res) => {
    try {
        const result = await recipeWriteService.updateRecipe(req.params.id, req.body);
        if (result.notFound) return res.status(404).json({ error: "Rezept nicht gefunden" });
        if (result.error) return res.status(400).json({ error: result.error });
        res.json(result.value);
    } catch (error) {
        console.error("Fehler bei PUT /recipes/:id:", error.message);
        res.status(500).json({ error: "Fehler beim Aktualisieren des Rezepts" });
    }
});

module.exports = router;
