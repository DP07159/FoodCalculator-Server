const express = require("express");
const inventoryService = require("./service");

const router = express.Router();

router.get("/inventory/by-ingredient/:name", async (req, res) => {
    try {
        const ingredientName = String(req.params.name || "").trim();
        if (!ingredientName) {
            return res.status(400).json({ error: "Lebensmittelname ist erforderlich." });
        }

        const item = await inventoryService.findInventoryByIngredientName(ingredientName);
        if (!item) {
            return res.status(404).json({ error: "Kein passender Inventarartikel gefunden." });
        }

        res.json(item);
    } catch (error) {
        console.error("Fehler bei GET /inventory/by-ingredient/:name:", error.message);
        res.status(500).json({ error: "Inventarartikel zur Zutat konnte nicht geladen werden" });
    }
});

router.get("/inventory/suggestions", async (req, res) => {
    try {
        const rows = await inventoryService.getInventorySuggestions(req.query.q || "");
        res.json(rows);
    } catch (error) {
        console.error("Fehler bei GET /inventory/suggestions:", error.message);
        res.status(500).json({ error: "Fehler beim Laden der Vorschläge" });
    }
});

router.get("/inventory", async (req, res) => {
    try {
        const enriched = await inventoryService.getAllInventoryItemsWithBatches();
        res.json(enriched);
    } catch (error) {
        console.error("Fehler bei GET /inventory:", error.message);
        res.status(500).json({ error: "Fehler beim Laden des Inventars" });
    }
});

router.get("/inventory/:id", async (req, res) => {
    try {
        const item = await inventoryService.getInventoryItem(req.params.id);
        if (!item) {
            return res.status(404).json({ error: "Inventar-Eintrag nicht gefunden" });
        }
        res.json(item);
    } catch (error) {
        console.error("Fehler bei GET /inventory/:id:", error.message);
        res.status(500).json({ error: "Fehler beim Laden des Inventar-Eintrags" });
    }
});

router.post("/inventory", async (req, res) => {
    try {
        const result = await inventoryService.createInventory(req.body || {});
        if (result.error) return res.status(400).json({ error: result.error });
        res.status(201).json(result.value);
    } catch (error) {
        console.error("Fehler bei POST /inventory:", error.message);
        res.status(500).json({ error: error.message || "Fehler beim Speichern des Inventar-Eintrags" });
    }
});

router.put("/inventory/:id", async (req, res) => {
    try {
        const result = await inventoryService.updateInventory(req.params.id, req.body || {});
        if (result.notFound) return res.status(404).json({ error: "Inventar-Eintrag nicht gefunden" });
        if (result.error) return res.status(400).json({ error: result.error });
        res.json(result.value);
    } catch (error) {
        console.error("Fehler bei PUT /inventory/:id:", error.message);
        res.status(500).json({ error: error.message || "Fehler beim Aktualisieren des Inventar-Eintrags" });
    }
});

router.patch("/inventory/:id/adjust", async (req, res) => {
    try {
        const result = await inventoryService.adjustInventory(req.params.id, req.body || {});
        if (result.notFound) return res.status(404).json({ error: "Inventar-Eintrag nicht gefunden" });
        if (result.error) return res.status(400).json({ error: result.error });
        res.json(result.value);
    } catch (error) {
        console.error("Fehler bei PATCH /inventory/:id/adjust:", error.message);
        res.status(500).json({ error: error.message || "Fehler beim Anpassen des Inventarbestands" });
    }
});

router.delete("/inventory/:id/stock-profile", async (req, res) => {
    try {
        const result = await inventoryService.deleteStockProfile(req.params.id, req.body || {});
        if (result.notFound) return res.status(404).json({ error: "Inventar-Eintrag nicht gefunden" });
        if (result.notFoundProfile) return res.status(404).json({ error: "Position nicht gefunden." });
        if (result.error) return res.status(400).json({ error: result.error });
        res.json(result.value);
    } catch (error) {
        console.error("Fehler bei DELETE /inventory/:id/stock-profile:", error.message);
        res.status(500).json({ error: error.message || "Fehler beim Löschen der Bestandsposition" });
    }
});

router.delete("/inventory/:id", async (req, res) => {
    try {
        const deleted = await inventoryService.deleteInventoryItem(req.params.id);
        if (!deleted) return res.status(404).json({ error: "Inventar-Eintrag nicht gefunden" });
        res.json({ success: true });
    } catch (error) {
        console.error("Fehler bei DELETE /inventory/:id:", error.message);
        res.status(500).json({ error: "Fehler beim Löschen des Inventar-Eintrags" });
    }
});

module.exports = router;
