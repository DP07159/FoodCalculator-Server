const express = require("express");
const router = express.Router();

const { run, get } = require("../../database/database");
const ingredients = require("../../shared/ingredients");
const foodItemService = require("../foodItems/service");
const inventoryService = require("../inventory/service");
const adminService = require("./service");

const buildFoodIdentity = ingredients.buildFoodIdentity;

router.get("/admin/inventory-cleanup-preview", async (req, res) => {
    try {
        const preview = await adminService.buildInventoryCleanupPreview();
        res.json(preview);
    } catch (error) {
        console.error("Fehler bei GET /admin/inventory-cleanup-preview:", error.message);
        res.status(500).json({ error: "Inventar-Bereinigungsanalyse konnte nicht erstellt werden." });
    }
});

router.post("/admin/inventory-cleanup-apply", async (req, res) => {
    try {
        const deleteIds = Array.isArray(req.body?.delete_item_ids) ? req.body.delete_item_ids.map(Number).filter(Number.isFinite) : [];
        if (!deleteIds.length) return res.status(400).json({ error: "Keine Artikel zum Löschen ausgewählt." });

        const preview = await adminService.buildInventoryCleanupPreview();
        const allowedIds = new Set(preview.orphan_recipe_items.map(item => Number(item.id)));
        const safeDeleteIds = deleteIds.filter(id => allowedIds.has(id));
        if (!safeDeleteIds.length) {
            return res.status(400).json({ error: "Keine sicher löschbaren Artikel ausgewählt." });
        }

        for (const id of safeDeleteIds) {
            await run(`DELETE FROM inventory_batches WHERE item_id = ?`, [id]);
            await run(`DELETE FROM inventory_items WHERE id = ?`, [id]);
        }

        const updatedPreview = await adminService.buildInventoryCleanupPreview();
        res.json({ success: true, deleted_item_ids: safeDeleteIds, preview: updatedPreview });
    } catch (error) {
        console.error("Fehler bei POST /admin/inventory-cleanup-apply:", error.message);
        res.status(500).json({ error: "Inventar-Bereinigung konnte nicht ausgeführt werden." });
    }
});

router.delete("/admin/inventory-items/:id", async (req, res) => {
    try {
        const deleted = await adminService.deleteInventoryItemCompletely(req.params.id);
        const preview = await adminService.buildInventoryCleanupPreview();
        res.json({ success: true, deleted_item: deleted, preview });
    } catch (error) {
        console.error("Fehler bei DELETE /admin/inventory-items/:id:", error.message);
        res.status(500).json({ error: error.message || "Artikel konnte nicht gelöscht werden." });
    }
});


router.post("/admin/duplicates/merge", async (req, res) => {
    try {
        const masterItemId = Number(req.body?.master_item_id);
        const duplicateItemId = Number(req.body?.duplicate_item_id);
        const merged = await adminService.mergeInventoryItems(masterItemId, duplicateItemId);
        const preview = await adminService.buildInventoryCleanupPreview();
        res.json({ success: true, merged, preview });
    } catch (error) {
        console.error("Fehler bei POST /admin/duplicates/merge:", error.message);
        res.status(500).json({ error: error.message || "Dubletten konnten nicht zusammengeführt werden." });
    }
});

router.post("/admin/duplicates/merge-all", async (req, res) => {
    try {
        const masterItemId = Number(req.body?.master_item_id);
        const duplicateItemIds = Array.isArray(req.body?.duplicate_item_ids) ? req.body.duplicate_item_ids : [];
        const merged = await adminService.mergeInventoryItemsIntoMaster(masterItemId, duplicateItemIds);
        const preview = await adminService.buildInventoryCleanupPreview();
        res.json({ success: true, merged, preview });
    } catch (error) {
        console.error("Fehler bei POST /admin/duplicates/merge-all:", error.message);
        res.status(500).json({ error: error.message || "Dubletten konnten nicht gesammelt zusammengeführt werden." });
    }
});

router.post("/admin/duplicate-keep-both", async (req, res) => {
    try {
        const pair = adminService.normalizeDuplicatePairIds(req.body?.item_id_a, req.body?.item_id_b);
        if (!pair) return res.status(400).json({ error: "Zwei unterschiedliche Artikel sind erforderlich." });
        const itemA = await get(`SELECT * FROM inventory_items WHERE id = ?`, [pair[0]]);
        const itemB = await get(`SELECT * FROM inventory_items WHERE id = ?`, [pair[1]]);
        if (!itemA || !itemB) return res.status(404).json({ error: "Mindestens ein Artikel wurde nicht gefunden." });
        const canonicalKey = itemA.canonical_name || itemB.canonical_name || buildFoodIdentity(itemA.name || itemB.name).canonical_key || "";
        await run(
            `INSERT OR IGNORE INTO admin_ignored_duplicate_pairs (item_id_a, item_id_b, canonical_key) VALUES (?, ?, ?)`,
            [pair[0], pair[1], canonicalKey]
        );
        const preview = await adminService.buildInventoryCleanupPreview();
        res.json({ success: true, ignored_pair: { item_id_a: pair[0], item_id_b: pair[1] }, preview });
    } catch (error) {
        console.error("Fehler bei POST /admin/duplicate-keep-both:", error.message);
        res.status(500).json({ error: "Dubletten-Entscheidung konnte nicht gespeichert werden." });
    }
});


router.post("/admin/recipe-resync-overrides", async (req, res) => {
    try {
        const overrideType = String(req.body?.override_type || "").trim();
        const canonicalKey = String(req.body?.canonical_key || "").trim();
        const inventoryItemId = req.body?.inventory_item_id === null || req.body?.inventory_item_id === undefined ? null : Number(req.body.inventory_item_id);
        const targetInventoryItemId = req.body?.target_inventory_item_id === null || req.body?.target_inventory_item_id === undefined ? null : Number(req.body.target_inventory_item_id);
        const action = String(req.body?.action || "").trim();
        const note = String(req.body?.note || "").trim();

        if (!["create", "delete"].includes(overrideType)) return res.status(400).json({ error: "Ungültiger Override-Typ." });
        if (!["link_existing", "ignore", "clear"].includes(action)) return res.status(400).json({ error: "Ungültige Aktion." });
        if (overrideType === "create" && !canonicalKey) return res.status(400).json({ error: "Canonical Key fehlt." });
        if (overrideType === "delete" && !Number.isFinite(inventoryItemId)) return res.status(400).json({ error: "Inventarartikel fehlt." });
        if (action === "link_existing" && !Number.isFinite(targetInventoryItemId)) return res.status(400).json({ error: "Zielartikel fehlt." });
        if (overrideType === "delete" && action === "link_existing" && Number(inventoryItemId) === Number(targetInventoryItemId)) {
            return res.status(400).json({ error: "Ein Löschkandidat kann nicht mit sich selbst verknüpft werden." });
        }

        const inventoryKey = Number.isFinite(inventoryItemId) ? inventoryItemId : 0;
        if (action === "clear") {
            await run(
                `DELETE FROM admin_recipe_resync_overrides WHERE override_type = ? AND canonical_key = ? AND inventory_item_id = ?`,
                [overrideType, canonicalKey, inventoryKey]
            );
        } else {
            await run(
                `INSERT INTO admin_recipe_resync_overrides (override_type, canonical_key, inventory_item_id, target_inventory_item_id, action, note, updated_at)
                 VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                 ON CONFLICT(override_type, canonical_key, inventory_item_id)
                 DO UPDATE SET target_inventory_item_id = excluded.target_inventory_item_id, action = excluded.action, note = excluded.note, updated_at = CURRENT_TIMESTAMP`,
                [overrideType, canonicalKey, inventoryKey, Number.isFinite(targetInventoryItemId) ? targetInventoryItemId : null, action, note]
            );
        }

        res.json({ success: true, preview: await adminService.buildRecipeIngredientRebuildPlan() });
    } catch (error) {
        console.error("Fehler bei POST /admin/recipe-resync-overrides:", error.message);
        res.status(500).json({ error: error.message || "Override konnte nicht gespeichert werden." });
    }
});

router.get("/admin/recipe-resync-preview", async (req, res) => {
    try {
        const preview = await adminService.buildRecipeIngredientRebuildPlan();
        res.json(preview);
    } catch (error) {
        console.error("Fehler bei GET /admin/recipe-resync-preview:", error.message);
        res.status(500).json({ error: "Rezept-Zutaten-Synchronisierung konnte nicht analysiert werden." });
    }
});

router.post("/admin/recipe-resync-apply", async (req, res) => {
    res.status(410).json({
        error: "Die Rezept-Zutaten-Synchronisierung wurde deaktiviert. Bitte nutze die Admin-Vorschau nur noch zur Analyse."
    });
});







router.get("/admin/health-factors", async (req, res) => {
    try {
        res.json({ factors: await adminService.getHealthFactorOptions() });
    } catch (error) {
        console.error("Fehler bei GET /admin/health-factors:", error.message);
        res.status(500).json({ error: "Gesundheits-/Diätfaktoren konnten nicht geladen werden." });
    }
});

router.post("/admin/health-factors", async (req, res) => {
    try {
        const name = String(req.body?.name || "").trim();
        const category = String(req.body?.category || "").trim();
        const description = String(req.body?.description || "").trim();
        if (!name) return res.status(400).json({ error: "Name ist erforderlich." });
        await run(`INSERT INTO health_factors (name, category, description, updated_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)`, [name, category, description]);
        res.json({ success: true, factors: await adminService.getHealthFactorOptions(), table: await adminService.getAdminTablePreview("health_factors") });
    } catch (error) {
        console.error("Fehler bei POST /admin/health-factors:", error.message);
        const status = /UNIQUE/.test(error.message) ? 409 : 500;
        res.status(status).json({ error: status === 409 ? "Dieser Faktor existiert bereits." : (error.message || "Faktor konnte nicht angelegt werden.") });
    }
});

router.put("/admin/health-factors/:id", async (req, res) => {
    try {
        const id = Number(req.params.id);
        const name = String(req.body?.name || "").trim();
        const category = String(req.body?.category || "").trim();
        const description = String(req.body?.description || "").trim();
        if (!Number.isFinite(id)) return res.status(400).json({ error: "Ungültiger Faktor." });
        if (!name) return res.status(400).json({ error: "Name ist erforderlich." });
        const existing = await get(`SELECT id FROM health_factors WHERE id = ?`, [id]);
        if (!existing) return res.status(404).json({ error: "Faktor wurde nicht gefunden." });
        await run(`UPDATE health_factors SET name = ?, category = ?, description = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [name, category, description, id]);
        res.json({ success: true, factors: await adminService.getHealthFactorOptions(), table: await adminService.getAdminTablePreview("health_factors") });
    } catch (error) {
        console.error("Fehler bei PUT /admin/health-factors/:id:", error.message);
        const status = /UNIQUE/.test(error.message) ? 409 : 500;
        res.status(status).json({ error: status === 409 ? "Dieser Faktor existiert bereits." : (error.message || "Faktor konnte nicht aktualisiert werden.") });
    }
});

router.delete("/admin/health-factors/:id", async (req, res) => {
    try {
        const id = Number(req.params.id);
        if (!Number.isFinite(id)) return res.status(400).json({ error: "Ungültiger Faktor." });
        await run(`DELETE FROM food_item_health_factors WHERE health_factor_id = ?`, [id]);
        const result = await run(`DELETE FROM health_factors WHERE id = ?`, [id]);
        if (result.changes === 0) return res.status(404).json({ error: "Faktor wurde nicht gefunden." });
        res.json({ success: true, factors: await adminService.getHealthFactorOptions(), table: await adminService.getAdminTablePreview("health_factors") });
    } catch (error) {
        console.error("Fehler bei DELETE /admin/health-factors/:id:", error.message);
        res.status(500).json({ error: error.message || "Faktor konnte nicht gelöscht werden." });
    }
});

router.put("/admin/food-items/:id", async (req, res) => {
    try {
        const id = Number(req.params.id);
        const displayName = String(req.body?.display_name || "").trim();
        const caloriesRaw = req.body?.calories_per_100g;
        const calories = caloriesRaw === null || caloriesRaw === undefined || caloriesRaw === "" ? null : Number(caloriesRaw);
        if (!Number.isFinite(id)) return res.status(400).json({ error: "Ungültiger Lebensmittel-Stammsatz." });
        if (!displayName) return res.status(400).json({ error: "Anzeigename ist erforderlich." });
        if (calories !== null && (!Number.isFinite(calories) || calories < 0)) return res.status(400).json({ error: "kcal / 100 g ist ungültig." });
        const item = await get(`SELECT * FROM food_items WHERE id = ?`, [id]);
        if (!item) return res.status(404).json({ error: "Lebensmittel-Stammsatz wurde nicht gefunden." });
        await foodItemService.renameFoodItemStable(id, displayName, { calories_per_100g: calories, updateCanonical: true });
        await adminService.replaceFoodItemHealthFactors(id, req.body?.health_factor_ids || []);
        res.json({ success: true, detail: await adminService.getFoodItemAdminDetail(id), table: await adminService.getAdminTablePreview("food_items") });
    } catch (error) {
        console.error("Fehler bei PUT /admin/food-items/:id:", error.message);
        const status = /UNIQUE/.test(error.message) ? 409 : 500;
        res.status(status).json({ error: error.message || "Lebensmittel-Stammsatz konnte nicht gespeichert werden." });
    }
});

router.delete("/admin/food-items/:id", async (req, res) => {
    try {
        const id = Number(req.params.id);
        if (!Number.isFinite(id)) return res.status(400).json({ error: "Ungültiger Lebensmittel-Stammsatz." });
        const item = await get(`SELECT * FROM food_items WHERE id = ?`, [id]);
        if (!item) return res.status(404).json({ error: "Lebensmittel-Stammsatz wurde nicht gefunden." });
        const totalStock = await adminService.getFoodItemStockTotalByFoodItem(id);
        if (totalStock > 0) return res.status(409).json({ error: "Dieser Stammsatz hat Bestand und kann nicht direkt gelöscht werden. Bestand zuerst verschieben oder Stammsatz konsolidieren." });
        await run("BEGIN");
        try {
            await run(`DELETE FROM food_aliases WHERE food_item_id = ?`, [id]);
            await run(`DELETE FROM food_item_health_factors WHERE food_item_id = ?`, [id]);
            await run(`UPDATE recipe_ingredients SET food_item_id = NULL, canonical_key = '', link_source = 'manual_unlinked', updated_at = CURRENT_TIMESTAMP WHERE food_item_id = ?`, [id]);
            await run(`UPDATE inventory_items SET food_item_id = NULL, canonical_name = '', updated_at = CURRENT_TIMESTAMP WHERE food_item_id = ?`, [id]);
            await run(`DELETE FROM food_items WHERE id = ?`, [id]);
            await run("COMMIT");
        } catch (inner) {
            await run("ROLLBACK");
            throw inner;
        }
        res.json({ success: true, deleted_item: item, table: await adminService.getAdminTablePreview("food_items"), system_status: await adminService.buildAdminSystemStatus() });
    } catch (error) {
        console.error("Fehler bei DELETE /admin/food-items/:id:", error.message);
        const status = /Bestand|nicht gefunden|Ungültiger/.test(error.message) ? 409 : 500;
        res.status(status).json({ error: error.message || "Lebensmittel-Stammsatz konnte nicht gelöscht werden." });
    }
});

router.get("/admin/food-items", async (req, res) => {
    try {
        res.json({ items: await adminService.getAdminFoodItemOptions() });
    } catch (error) {
        console.error("Fehler bei GET /admin/food-items:", error.message);
        res.status(500).json({ error: "Lebensmittel-Stammdaten konnten nicht geladen werden." });
    }
});

router.get("/admin/food-items/:id/detail", async (req, res) => {
    try {
        res.json(await adminService.getFoodItemAdminDetail(req.params.id));
    } catch (error) {
        console.error("Fehler bei GET /admin/food-items/:id/detail:", error.message);
        const status = /nicht gefunden|Ungültige/.test(error.message) ? 404 : 500;
        res.status(status).json({ error: error.message || "Lebensmittel-Details konnten nicht geladen werden." });
    }
});

router.post("/admin/food-aliases", async (req, res) => {
    try {
        const foodItemId = Number(req.body?.food_item_id);
        const aliasName = String(req.body?.alias_name || "").trim();
        if (!Number.isFinite(foodItemId)) return res.status(400).json({ error: "Ziel-Lebensmittel ist erforderlich." });
        if (!aliasName) return res.status(400).json({ error: "Alias ist erforderlich." });
        const item = await get(`SELECT * FROM food_items WHERE id = ?`, [foodItemId]);
        if (!item) return res.status(404).json({ error: "Ziel-Lebensmittel wurde nicht gefunden." });
        await foodItemService.addFoodAlias(foodItemId, aliasName);
        res.json({ success: true, detail: await adminService.getFoodItemAdminDetail(foodItemId), table: await adminService.getAdminTablePreview("food_aliases") });
    } catch (error) {
        console.error("Fehler bei POST /admin/food-aliases:", error.message);
        res.status(500).json({ error: error.message || "Alias konnte nicht angelegt werden." });
    }
});

router.put("/admin/food-aliases/:id", async (req, res) => {
    try {
        const aliasId = Number(req.params.id);
        const foodItemId = Number(req.body?.food_item_id);
        const aliasName = String(req.body?.alias_name || "").trim();
        if (!Number.isFinite(aliasId)) return res.status(400).json({ error: "Ungültiger Alias." });
        if (!Number.isFinite(foodItemId)) return res.status(400).json({ error: "Ziel-Lebensmittel ist erforderlich." });
        if (!aliasName) return res.status(400).json({ error: "Alias ist erforderlich." });
        const alias = await get(`SELECT * FROM food_aliases WHERE id = ?`, [aliasId]);
        if (!alias) return res.status(404).json({ error: "Alias wurde nicht gefunden." });
        const item = await get(`SELECT * FROM food_items WHERE id = ?`, [foodItemId]);
        if (!item) return res.status(404).json({ error: "Ziel-Lebensmittel wurde nicht gefunden." });
        const aliasKey = buildFoodIdentity(aliasName).canonical_key || aliasName.toLowerCase().trim();
        await run(`UPDATE food_aliases SET food_item_id = ?, alias_name = ?, alias_key = ? WHERE id = ?`, [foodItemId, aliasName, aliasKey, aliasId]);
        res.json({ success: true, detail: await adminService.getFoodItemAdminDetail(foodItemId), table: await adminService.getAdminTablePreview("food_aliases") });
    } catch (error) {
        console.error("Fehler bei PUT /admin/food-aliases/:id:", error.message);
        const status = /UNIQUE/.test(error.message) ? 409 : 500;
        res.status(status).json({ error: status === 409 ? "Dieser Alias existiert für das Ziel-Lebensmittel bereits." : (error.message || "Alias konnte nicht aktualisiert werden.") });
    }
});

router.delete("/admin/food-aliases/:id", async (req, res) => {
    try {
        const aliasId = Number(req.params.id);
        const alias = await get(`SELECT * FROM food_aliases WHERE id = ?`, [aliasId]);
        if (!alias) return res.status(404).json({ error: "Alias wurde nicht gefunden." });
        await run(`DELETE FROM food_aliases WHERE id = ?`, [aliasId]);
        res.json({ success: true, deleted_alias: alias, detail: await adminService.getFoodItemAdminDetail(alias.food_item_id), table: await adminService.getAdminTablePreview("food_aliases") });
    } catch (error) {
        console.error("Fehler bei DELETE /admin/food-aliases/:id:", error.message);
        res.status(500).json({ error: error.message || "Alias konnte nicht gelöscht werden." });
    }
});

router.post("/admin/food-items/consolidate", async (req, res) => {
    try {
        const result = await adminService.consolidateFoodItems(req.body?.master_food_item_id, req.body?.duplicate_food_item_ids || []);
        res.json({
            success: true,
            result,
            table: await adminService.getAdminTablePreview("food_items"),
            system_status: await adminService.buildAdminSystemStatus()
        });
    } catch (error) {
        console.error("Fehler bei POST /admin/food-items/consolidate:", error.message);
        res.status(500).json({ error: error.message || "Lebensmittel-Stammdaten konnten nicht konsolidiert werden." });
    }
});


router.put("/admin/recipe-ingredients/:id/link", async (req, res) => {
    try {
        const ingredientId = Number(req.params.id);
        const rawFoodItemId = req.body?.food_item_id;
        const ingredient = await get(`SELECT * FROM recipe_ingredients WHERE id = ?`, [ingredientId]);
        if (!ingredient) return res.status(404).json({ error: "Rezept-Zutat wurde nicht gefunden." });

        if (rawFoodItemId === null || rawFoodItemId === "" || rawFoodItemId === undefined) {
            await run(`UPDATE recipe_ingredients SET food_item_id = NULL, canonical_key = '', link_source = 'manual_unlinked', updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [ingredientId]);
            return res.json({ success: true, ingredient: await get(`SELECT * FROM recipe_ingredients WHERE id = ?`, [ingredientId]) });
        }

        const foodItemId = Number(rawFoodItemId);
        if (!Number.isFinite(foodItemId)) return res.status(400).json({ error: "Ungültiger Lebensmittel-Stammsatz." });
        const item = await get(`SELECT * FROM food_items WHERE id = ?`, [foodItemId]);
        if (!item) return res.status(404).json({ error: "Lebensmittel-Stammsatz wurde nicht gefunden." });
        await run(`UPDATE recipe_ingredients SET food_item_id = ?, canonical_key = ?, link_source = 'manual', updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [foodItemId, item.canonical_key || '', ingredientId]);
        res.json({ success: true, ingredient: await get(`SELECT * FROM recipe_ingredients WHERE id = ?`, [ingredientId]), detail: await adminService.getFoodItemAdminDetail(foodItemId) });
    } catch (error) {
        console.error("Fehler bei PUT /admin/recipe-ingredients/:id/link:", error.message);
        res.status(500).json({ error: error.message || "Rezept-Zutat konnte nicht verknüpft werden." });
    }
});

router.get("/admin/system-status", async (req, res) => {
    try {
        res.json(await adminService.buildAdminSystemStatus());
    } catch (error) {
        console.error("Fehler bei GET /admin/system-status:", error.message);
        res.status(500).json({ error: "Systemstatus konnte nicht geladen werden" });
    }
});


router.get("/admin/tables/:tableName", async (req, res) => {
    try {
        const preview = await adminService.getAdminTablePreview(req.params.tableName, req.query.limit);
        res.json(preview);
    } catch (error) {
        console.error("Fehler bei GET /admin/tables/:tableName:", error.message);
        const status = /nicht gefunden|Ungültiger/.test(error.message) ? 404 : 500;
        res.status(status).json({ error: error.message || "Tabelle konnte nicht geladen werden." });
    }
});

router.get("/admin/backup/export", async (req, res) => {
    try {
        const backup = await adminService.buildFullJsonBackup();
        const date = new Date().toISOString().slice(0, 10);
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.setHeader("Content-Disposition", `attachment; filename="foodcalculator-backup-${date}.json"`);
        res.json(backup);
    } catch (error) {
        console.error("Fehler bei GET /admin/backup/export:", error.message);
        res.status(500).json({ error: "Backup konnte nicht erstellt werden" });
    }
});

module.exports = router;
