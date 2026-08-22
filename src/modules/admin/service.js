const { dbPath, run, get, all } = require("../../database/database");
const ingredients = require("../../shared/ingredients");
const foodItemService = require("../foodItems/service");
const inventoryService = require("../inventory/service");
const recipeSyncService = require("../recipes/syncService");

const normalizeVisibleFoodName = ingredients.normalizeVisibleFoodName;
const normalizeGermanText = ingredients.normalizeGermanText;
const buildFoodIdentity = ingredients.buildFoodIdentity;
const parseIngredientsText = ingredients.parseIngredientsText;

function getInventoryStockTotal(item) {
    const batches = Array.isArray(item?.batches) ? item.batches : [];
    const batchTotal = batches.reduce((sum, batch) => {
        const remainingQuantity = Number(batch.remaining_quantity ?? 0);
        const remainingWeight = Number(batch.remaining_weight ?? 0);
        return sum + Math.max(0, remainingQuantity) + Math.max(0, remainingWeight);
    }, 0);
    const legacyTotal = Math.max(0, Number(item?.quantity ?? 0)) + Math.max(0, Number(item?.weight ?? 0));
    return batchTotal + legacyTotal;
}

function normalizeDuplicatePairIds(idA, idB) {
    const a = Number(idA);
    const b = Number(idB);
    if (!Number.isFinite(a) || !Number.isFinite(b) || a === b) return null;
    return a < b ? [a, b] : [b, a];
}


async function ensureFoodItemForInventoryRow(item) {
    if (!item) throw new Error("Artikel nicht gefunden.");
    if (item.food_item_id) {
        const existing = await get(`SELECT * FROM food_items WHERE id = ?`, [item.food_item_id]);
        if (existing) return existing;
    }

    const foodItem = await foodItemService.getOrCreateFoodItem(item.name, { calories_per_100g: item.calories_per_100g });
    await run(
        `UPDATE inventory_items SET food_item_id = ?, canonical_name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [foodItem.id, foodItem.canonical_key, item.id]
    );
    return foodItem;
}

async function moveFoodAliasesToMaster(sourceFoodItemId, masterFoodItemId, additionalAliases = []) {
    const sourceId = Number(sourceFoodItemId);
    const masterId = Number(masterFoodItemId);
    if (!Number.isFinite(masterId)) return;

    for (const alias of additionalAliases) {
        if (alias) await foodItemService.addFoodAlias(masterId, alias);
    }

    if (!Number.isFinite(sourceId) || sourceId === masterId) return;

    const aliases = await all(`SELECT alias_name FROM food_aliases WHERE food_item_id = ?`, [sourceId]);
    for (const alias of aliases) {
        await foodItemService.addFoodAlias(masterId, alias.alias_name);
    }
}

async function removeFoodItemIfUnused(foodItemId) {
    const id = Number(foodItemId);
    if (!Number.isFinite(id)) return;
    const linkedInventory = await get(`SELECT id FROM inventory_items WHERE food_item_id = ? LIMIT 1`, [id]);
    const linkedRecipe = await get(`SELECT id FROM recipe_ingredients WHERE food_item_id = ? LIMIT 1`, [id]);
    if (linkedInventory || linkedRecipe) return;
    await run(`DELETE FROM food_aliases WHERE food_item_id = ?`, [id]);
    await run(`DELETE FROM food_items WHERE id = ?`, [id]);
}

async function mergeInventoryItemsInternal(masterItemId, duplicateItemId) {
    const masterId = Number(masterItemId);
    const duplicateId = Number(duplicateItemId);
    if (!Number.isFinite(masterId) || !Number.isFinite(duplicateId) || masterId === duplicateId) {
        throw new Error("Zwei unterschiedliche Artikel sind erforderlich.");
    }

    const master = await get(`SELECT * FROM inventory_items WHERE id = ?`, [masterId]);
    const duplicate = await get(`SELECT * FROM inventory_items WHERE id = ?`, [duplicateId]);
    if (!master || !duplicate) throw new Error("Mindestens ein Artikel wurde nicht gefunden.");

    const masterFood = await ensureFoodItemForInventoryRow(master);
    const duplicateFood = await ensureFoodItemForInventoryRow(duplicate);

    await moveFoodAliasesToMaster(duplicateFood.id, masterFood.id, [
        duplicate.name,
        duplicate.recipe_match_name,
        duplicate.canonical_name,
        duplicateFood.display_name,
        duplicateFood.canonical_key
    ]);

    await run(
        `UPDATE recipe_ingredients
         SET food_item_id = ?, canonical_key = ?, updated_at = CURRENT_TIMESTAMP
         WHERE food_item_id = ?`,
        [masterFood.id, masterFood.canonical_key, duplicateFood.id]
    );

    await run(
        `UPDATE inventory_batches SET item_id = ?, updated_at = CURRENT_TIMESTAMP WHERE item_id = ?`,
        [masterId, duplicateId]
    );

    await run(
        `UPDATE inventory_items
         SET unit = COALESCE(NULLIF(unit, ''), ?),
             recipe_match_name = COALESCE(NULLIF(recipe_match_name, ''), ?),
             calories_per_100g = COALESCE(calories_per_100g, ?),
             food_item_id = ?,
             canonical_name = ?,
             name = ?,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [duplicate.unit || "", duplicate.recipe_match_name || duplicate.name || "", duplicate.calories_per_100g ?? null, masterFood.id, masterFood.canonical_key, masterFood.display_name || master.name || "", masterId]
    );

    await run(`DELETE FROM admin_ignored_duplicate_pairs WHERE item_id_a IN (?, ?) OR item_id_b IN (?, ?)`, [masterId, duplicateId, masterId, duplicateId]);
    await run(`DELETE FROM inventory_items WHERE id = ?`, [duplicateId]);

    await removeFoodItemIfUnused(duplicateFood.id);

    return {
        master_item: { id: masterId, name: master.name },
        merged_item: { id: duplicateId, name: duplicate.name }
    };
}

async function mergeInventoryItems(masterItemId, duplicateItemId) {
    await run("BEGIN");
    try {
        const result = await mergeInventoryItemsInternal(masterItemId, duplicateItemId);
        await run("COMMIT");
        return result;
    } catch (error) {
        await run("ROLLBACK");
        throw error;
    }
}

async function mergeInventoryItemsIntoMaster(masterItemId, duplicateItemIds = []) {
    const masterId = Number(masterItemId);
    const duplicateIds = Array.from(new Set((Array.isArray(duplicateItemIds) ? duplicateItemIds : [])
        .map(Number)
        .filter(id => Number.isFinite(id) && id !== masterId)));
    if (!Number.isFinite(masterId) || duplicateIds.length === 0) {
        throw new Error("Ein Zielartikel und mindestens eine Dublette sind erforderlich.");
    }

    await run("BEGIN");
    try {
        const mergedItems = [];
        for (const duplicateId of duplicateIds) {
            const result = await mergeInventoryItemsInternal(masterId, duplicateId);
            mergedItems.push(result.merged_item);
        }
        const master = await get(`SELECT * FROM inventory_items WHERE id = ?`, [masterId]);
        const masterFood = master?.food_item_id ? await get(`SELECT * FROM food_items WHERE id = ?`, [master.food_item_id]) : null;
        if (masterFood) {
            await run(
                `UPDATE inventory_items
                 SET name = ?, canonical_name = ?, updated_at = CURRENT_TIMESTAMP
                 WHERE food_item_id = ?`,
                [masterFood.display_name || master.name || "", masterFood.canonical_key || "", masterFood.id]
            );
        }

        await run("COMMIT");
        return {
            master_item: { id: masterId, name: masterFood?.display_name || master?.name || "Zielartikel" },
            merged_items: mergedItems
        };
    } catch (error) {
        await run("ROLLBACK");
        throw error;
    }
}

async function deleteInventoryItemCompletely(itemId) {
    const id = Number(itemId);
    if (!Number.isFinite(id)) throw new Error("Ungültiger Artikel.");
    const item = await get(`SELECT * FROM inventory_items WHERE id = ?`, [id]);
    if (!item) throw new Error("Artikel nicht gefunden.");

    const foodItemId = item.food_item_id ? Number(item.food_item_id) : null;

    await run(`DELETE FROM inventory_batches WHERE item_id = ?`, [id]);
    await run(`DELETE FROM admin_ignored_duplicate_pairs WHERE item_id_a = ? OR item_id_b = ?`, [id, id]);
    await run(`DELETE FROM inventory_items WHERE id = ?`, [id]);

    if (foodItemId) {
        // Parsed recipe rows are derived data. They must not keep a hard pointer to a deleted admin item.
        await run(`UPDATE recipe_ingredients SET food_item_id = NULL, updated_at = CURRENT_TIMESTAMP WHERE food_item_id = ?`, [foodItemId]);

        const otherInventory = await get(`SELECT id FROM inventory_items WHERE food_item_id = ? LIMIT 1`, [foodItemId]);
        const linkedRecipe = await get(`SELECT id FROM recipe_ingredients WHERE food_item_id = ? LIMIT 1`, [foodItemId]);

        if (!otherInventory && !linkedRecipe) {
            await run(`DELETE FROM food_aliases WHERE food_item_id = ?`, [foodItemId]);
            await run(`DELETE FROM food_items WHERE id = ?`, [foodItemId]);
        }
    }

    return { id, name: item.name };
}


function getEffectiveInventoryCanonical(item) {
    const visibleKey = buildFoodIdentity(item?.name || "").canonical_key || "";
    return visibleKey || item?.canonical_name || "";
}

function isRecipeGeneratedWithoutStock(item) {
    return String(item?.source || "manual") === "recipe" && getInventoryStockTotal(item) <= 0;
}


async function getRecipeResyncOverrides() {
    const rows = await all(`SELECT * FROM admin_recipe_resync_overrides`);
    return rows || [];
}

function buildRecipeResyncOverrideMaps(overrides = []) {
    const linkByCanonical = new Map();
    const ignoreCreateByCanonical = new Set();
    const deleteByInventoryId = new Map();
    const ignoreDeleteByInventoryId = new Set();
    for (const row of overrides || []) {
        const type = String(row.override_type || "");
        const action = String(row.action || "");
        const canonical = String(row.canonical_key || "");
        const inventoryId = Number(row.inventory_item_id || 0);
        const targetId = Number(row.target_inventory_item_id || 0);
        if (type === "create" && canonical && action === "link_existing" && targetId) linkByCanonical.set(canonical, targetId);
        if (type === "create" && canonical && action === "ignore") ignoreCreateByCanonical.add(canonical);
        if (type === "delete" && inventoryId && action === "link_existing" && targetId) deleteByInventoryId.set(inventoryId, targetId);
        if (type === "delete" && inventoryId && action === "ignore") ignoreDeleteByInventoryId.add(inventoryId);
    }
    return { linkByCanonical, ignoreCreateByCanonical, deleteByInventoryId, ignoreDeleteByInventoryId };
}

function toRecipeResyncInventoryOption(item) {
    if (!item) return null;
    return {
        id: item.id,
        name: item.name,
        source: item.source || "manual",
        stock_total: getInventoryStockTotal(item),
        canonical_name: item.canonical_name || "",
        food_item_id: item.food_item_id || null
    };
}

function chooseInventoryItemForParsedTarget(parsedIngredient, inventoryItems, alreadyUsedIds = new Set()) {
    const targetKey = buildFoodIdentity(parsedIngredient?.food_name || parsedIngredient?.raw_text).canonical_key || "";
    if (!targetKey) return null;
    const targetName = normalizeVisibleFoodName(parsedIngredient?.food_name || "");
    const targetComparable = normalizeGermanText(targetName).replace(/[^a-z0-9\s-]/g, " ").replace(/\s+/g, " ").trim();

    const candidates = inventoryItems
        .filter(item => !alreadyUsedIds.has(Number(item.id)))
        .filter(item => {
            const storedKey = item?.canonical_name || "";
            const effectiveKey = getEffectiveInventoryCanonical(item);
            return storedKey === targetKey || effectiveKey === targetKey;
        })
        .map(item => {
            const itemComparable = normalizeGermanText(item.name || "").replace(/[^a-z0-9\s-]/g, " ").replace(/\s+/g, " ").trim();
            let score = 0;
            if (itemComparable === targetComparable) score += 1000;
            if (getInventoryStockTotal(item) > 0) score += 500;
            if (String(item.source || "manual") !== "recipe") score += 250;
            if ((item.canonical_name || "") === targetKey) score += 50;
            score -= Math.abs(String(item.name || "").length - targetName.length);
            score -= Number(item.id) / 100000;
            return { item, score };
        })
        .sort((a, b) => b.score - a.score);

    return candidates[0]?.item || null;
}

async function buildRecipeIngredientRebuildPlan() {
    const recipes = await all(`SELECT * FROM recipes ORDER BY name COLLATE NOCASE ASC`);
    const inventoryItems = await inventoryService.getAllInventoryItemsWithBatches();
    const overrides = await getRecipeResyncOverrides();
    const overrideMaps = buildRecipeResyncOverrideMaps(overrides);
    const inventoryOptions = inventoryItems
        .map(toRecipeResyncInventoryOption)
        .filter(Boolean)
        .sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "de"));
    const targetMap = new Map();
    const parsedRows = [];

    for (const recipe of recipes) {
        const parsed = parseIngredientsText(recipe.ingredients || "");
        parsed.forEach(ingredient => {
            const index = ingredient.line_index;
            const canonicalKey = buildFoodIdentity(ingredient.food_name || ingredient.raw_text).canonical_key || "";
            if (!canonicalKey) return;
            if (!targetMap.has(canonicalKey)) {
                targetMap.set(canonicalKey, {
                    canonical_key: canonicalKey,
                    display_name: normalizeVisibleFoodName(ingredient.food_name || ingredient.raw_text),
                    unit: ingredient.unit || "g",
                    occurrences: []
                });
            }
            targetMap.get(canonicalKey).occurrences.push({
                recipe_id: recipe.id,
                recipe_name: recipe.name,
                sort_order: index,
                raw_text: ingredient.raw_text,
                food_name: ingredient.food_name,
                amount: ingredient.amount,
                unit: ingredient.unit
            });
            parsedRows.push({ recipe, ingredient, index, canonical_key: canonicalKey });
        });
    }

    const targetItems = [];
    const usedInventoryIds = new Set();
    for (const target of targetMap.values()) {
        const representative = {
            food_name: target.display_name,
            raw_text: target.occurrences[0]?.raw_text || target.display_name
        };
        let existing = null;
        let override = null;
        if (overrideMaps.ignoreCreateByCanonical.has(target.canonical_key)) {
            targetItems.push({
                ...target,
                action: "ignore",
                existing_item: null,
                override: { action: "ignore" },
                will_rename_existing: false
            });
            continue;
        }
        const overrideTargetId = overrideMaps.linkByCanonical.get(target.canonical_key);
        if (overrideTargetId) {
            existing = inventoryItems.find(item => Number(item.id) === Number(overrideTargetId)) || null;
            if (existing) override = { action: "link_existing", target_inventory_item_id: existing.id };
        }
        if (!existing) existing = chooseInventoryItemForParsedTarget(representative, inventoryItems, usedInventoryIds);
        if (existing) usedInventoryIds.add(Number(existing.id));
        targetItems.push({
            ...target,
            action: override?.action || (existing ? "link_existing" : "create_new"),
            existing_item: toRecipeResyncInventoryOption(existing),
            override,
            will_rename_existing: Boolean(existing && isRecipeGeneratedWithoutStock(existing) && normalizeGermanText(existing.name) !== normalizeGermanText(target.display_name))
        });
    }

    const targetKeys = new Set(Array.from(targetMap.keys()));
    const deleteCandidates = inventoryItems.filter(item => {
        if (!isRecipeGeneratedWithoutStock(item)) return false;
        if (usedInventoryIds.has(Number(item.id))) return false;
        if (overrideMaps.ignoreDeleteByInventoryId.has(Number(item.id))) return false;
        if (overrideMaps.deleteByInventoryId.has(Number(item.id))) return true;
        const storedKey = item.canonical_name || "";
        const effectiveKey = getEffectiveInventoryCanonical(item);
        // Wenn ein bestandsloser Auto-Artikel nur wegen alter Einheiten-Schreibweise effektiv zu einem Ziel gehört,
        // aber nicht als Zielartikel ausgewählt wurde, darf er gelöscht werden.
        if (targetKeys.has(storedKey) || targetKeys.has(effectiveKey)) return true;
        return true;
    });

    const fullRebuildDeleteCandidates = inventoryItems.filter(item =>
        getInventoryStockTotal(item) <= 0 && !usedInventoryIds.has(Number(item.id))
    );

    const protectedItems = inventoryItems.filter(item => !deleteCandidates.some(candidate => Number(candidate.id) === Number(item.id)));

    return {
        generated_at: new Date().toISOString(),
        counts: {
            recipes: recipes.length,
            parsed_ingredients: parsedRows.length,
            target_items: targetItems.length,
            link_existing: targetItems.filter(item => item.action === "link_existing").length,
            create_new: targetItems.filter(item => item.action === "create_new").length,
            rename_existing: targetItems.filter(item => item.will_rename_existing).length,
            delete_candidates: deleteCandidates.length,
            full_rebuild_delete_candidates: fullRebuildDeleteCandidates.length,
            protected_items: protectedItems.length
        },
        target_items: targetItems.sort((a, b) => a.display_name.localeCompare(b.display_name, "de")),
        delete_candidates: deleteCandidates.map(item => ({
            id: item.id,
            name: item.name,
            canonical_name: item.canonical_name || "",
            effective_canonical_name: getEffectiveInventoryCanonical(item),
            source: item.source || "manual",
            stock_total: getInventoryStockTotal(item)
        })).sort((a, b) => String(a.name).localeCompare(String(b.name), "de")),
        full_rebuild_delete_candidates: fullRebuildDeleteCandidates.map(item => ({
            id: item.id,
            name: item.name,
            canonical_name: item.canonical_name || "",
            effective_canonical_name: getEffectiveInventoryCanonical(item),
            source: item.source || "manual",
            stock_total: getInventoryStockTotal(item)
        })).sort((a, b) => String(a.name).localeCompare(String(b.name), "de")),
        inventory_options: inventoryOptions,
        overrides: overrides,
        protected_items: protectedItems.map(item => ({
            id: item.id,
            name: item.name,
            source: item.source || "manual",
            stock_total: getInventoryStockTotal(item),
            reason: getInventoryStockTotal(item) > 0 ? "Bestand vorhanden" : String(item.source || "manual") !== "recipe" ? "manuell gepflegt" : "wird als Zielartikel genutzt oder ist nicht sicher löschbar"
        })).sort((a, b) => String(a.name).localeCompare(String(b.name), "de"))
    };
}

async function applyRecipeIngredientRebuild(options = {}) {
    const recipes = await all(`SELECT * FROM recipes ORDER BY id ASC`);
    let createdItems = 0;
    let linkedIngredients = 0;
    let preservedIngredients = 0;
    let deletedItems = [];
    const deleteAllZeroStock = Boolean(options.deleteAllZeroStock);

    await run("BEGIN");
    try {
        const previousLinksByRecipe = new Map();
        const previousLinks = await all(
            `SELECT sort_order, raw_text, food_name, canonical_key, food_item_id, link_source, recipe_id
             FROM recipe_ingredients
             ORDER BY recipe_id ASC, sort_order ASC`
        );
        for (const link of previousLinks) {
            if (!previousLinksByRecipe.has(Number(link.recipe_id))) previousLinksByRecipe.set(Number(link.recipe_id), []);
            previousLinksByRecipe.get(Number(link.recipe_id)).push(link);
        }

        const overrides = await getRecipeResyncOverrides();
        const overrideMaps = buildRecipeResyncOverrideMaps(overrides);
        const usedInventoryIds = new Set();
        const usedFoodItemIds = new Set();

        for (const recipe of recipes) {
            const parsed = parseIngredientsText(recipe.ingredients || "");
            const previousRecipeLinks = previousLinksByRecipe.get(Number(recipe.id)) || [];

            await run(`DELETE FROM recipe_ingredients WHERE recipe_id = ?`, [recipe.id]);

            for (const ingredient of parsed) {
                const index = ingredient.line_index;
                const canonicalKey = buildFoodIdentity(ingredient.food_name || ingredient.raw_text).canonical_key || "";
                if (canonicalKey && overrideMaps.ignoreCreateByCanonical.has(canonicalKey)) continue;

                let foodItem = null;
                let linkSource = "rebuilt";

                // Wichtigster Schutz: bestehende, einmal gesetzte Verknüpfungen bleiben erhalten.
                // Die Admin-Synchronisierung darf sie nicht durch neue Parse-Entscheidungen überschreiben.
                const preserved = await recipeSyncService.getPreservedFoodItemForIngredient(previousRecipeLinks, index, ingredient);
                if (preserved?.foodItem) {
                    foodItem = preserved.foodItem;
                    linkSource = preserved.linkSource || "preserved_resync";
                    preservedIngredients += 1;
                }

                // Admin-Override: nur wenn keine bestehende Verknüpfung erhalten werden konnte.
                if (!foodItem && canonicalKey) {
                    const overrideTargetId = overrideMaps.linkByCanonical.get(canonicalKey);
                    if (overrideTargetId) {
                        const targetItem = await get(`SELECT * FROM inventory_items WHERE id = ?`, [overrideTargetId]);
                        if (targetItem?.food_item_id) {
                            foodItem = await get(`SELECT * FROM food_items WHERE id = ?`, [targetItem.food_item_id]);
                            if (foodItem) linkSource = "admin_override";
                        }
                    }
                }

                // Sicherer automatischer Fallback: nur exakter Food-Item-/Alias-Treffer.
                if (!foodItem) {
                    foodItem = await foodItemService.findFoodItemByName(ingredient.food_name);
                    if (foodItem) linkSource = "auto_exact";
                }

                // Erst wenn wirklich kein bestehender Artikel/Alias/Preserve-Treffer existiert, neu anlegen.
                if (!foodItem) {
                    foodItem = await foodItemService.createDistinctFoodItemFromIngredient(ingredient.food_name, { aliasName: ingredient.raw_text });
                    linkSource = "new_from_resync";
                    createdItems += 1;
                }

                await foodItemService.addFoodAlias(foodItem.id, ingredient.raw_text);
                await foodItemService.addFoodAlias(foodItem.id, ingredient.food_name);
                await recipeSyncService.ensureInventoryItemForFoodItem(foodItem, ingredient, { source: linkSource === "admin_override" ? "manual" : "recipe" });

                const inventoryItem = await get(`SELECT id FROM inventory_items WHERE food_item_id = ? ORDER BY id ASC LIMIT 1`, [foodItem.id]);
                if (inventoryItem?.id) usedInventoryIds.add(Number(inventoryItem.id));
                usedFoodItemIds.add(Number(foodItem.id));

                await run(
                    `INSERT INTO recipe_ingredients (recipe_id, raw_text, food_name, amount, unit, sort_order, updated_at, food_item_id, canonical_key, link_source)
                     VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?, ?, ?)`,
                    [recipe.id, ingredient.raw_text, ingredient.food_name, ingredient.amount, ingredient.unit, index, foodItem.id, foodItem.canonical_key, linkSource]
                );
                linkedIngredients += 1;
            }
        }

        // Nach dem Neuaufbau dürfen nur ungenutzte, bestandslose Altlasten entfernt werden.
        // Alles, was aktuell über recipe_ingredients.food_item_id verknüpft ist, bleibt geschützt.
        const linkedFoodRows = await all(`SELECT DISTINCT food_item_id FROM recipe_ingredients WHERE food_item_id IS NOT NULL`);
        for (const row of linkedFoodRows) usedFoodItemIds.add(Number(row.food_item_id));

        const currentInventoryItems = await inventoryService.getAllInventoryItemsWithBatches();
        const deleteCandidates = currentInventoryItems.filter(item => {
            if (usedInventoryIds.has(Number(item.id))) return false;
            if (item.food_item_id && usedFoodItemIds.has(Number(item.food_item_id))) return false;
            if (getInventoryStockTotal(item) > 0) return false;
            if (deleteAllZeroStock) return true;
            return isRecipeGeneratedWithoutStock(item);
        });

        for (const item of deleteCandidates) {
            const targetOverrideId = overrideMaps.deleteByInventoryId.get(Number(item.id));
            if (targetOverrideId) {
                const targetItem = currentInventoryItems.find(candidate => Number(candidate.id) === Number(targetOverrideId));
                if (targetItem) {
                    if (targetItem.food_item_id && item.food_item_id && Number(targetItem.food_item_id) !== Number(item.food_item_id)) {
                        await consolidateFoodItems(targetItem.food_item_id, [item.food_item_id]);
                    }
                    if (targetItem.food_item_id) {
                        await foodItemService.addFoodAlias(targetItem.food_item_id, item.name);
                        await foodItemService.addFoodAlias(targetItem.food_item_id, item.recipe_match_name || item.name);
                    }
                }
            }
            await run(`DELETE FROM inventory_batches WHERE item_id = ?`, [item.id]);
            await run(`DELETE FROM admin_ignored_duplicate_pairs WHERE item_id_a = ? OR item_id_b = ?`, [item.id, item.id]);
            await run(`DELETE FROM inventory_items WHERE id = ?`, [item.id]);
            deletedItems.push({ id: item.id, name: item.name, linked_to_inventory_item_id: targetOverrideId || null });
            if (item.food_item_id) await removeFoodItemIfUnused(item.food_item_id);
        }

        await run("COMMIT");
        return {
            created_items: createdItems,
            linked_ingredients: linkedIngredients,
            preserved_ingredients: preservedIngredients,
            deleted_items: deletedItems
        };
    } catch (error) {
        await run("ROLLBACK");
        throw error;
    }
}

async function buildInventoryCleanupPreview() {
    const inventoryItems = await inventoryService.getAllInventoryItemsWithBatches();
    const recipeIngredientRows = await all(`
        SELECT ri.*, r.name AS recipe_name
        FROM recipe_ingredients ri
        LEFT JOIN recipes r ON r.id = ri.recipe_id
        ORDER BY r.name COLLATE NOCASE ASC, ri.sort_order ASC
    `);
    const ignoredPairs = await all(`SELECT * FROM admin_ignored_duplicate_pairs`);
    const ignoredPairKeys = new Set(ignoredPairs.map(row => `${row.item_id_a}:${row.item_id_b}`));

    const recipeUsageByCanonical = new Map();
    for (const row of recipeIngredientRows) {
        const canonical = row.canonical_key || buildFoodIdentity(row.food_name || row.raw_text).canonical_key || "";
        if (!canonical) continue;
        if (!recipeUsageByCanonical.has(canonical)) recipeUsageByCanonical.set(canonical, []);
        recipeUsageByCanonical.get(canonical).push({
            recipe_id: row.recipe_id,
            recipe_name: row.recipe_name || "Unbenanntes Rezept",
            raw_text: row.raw_text || "",
            food_name: row.food_name || ""
        });
    }

    const enrichedItems = inventoryItems.map(item => {
        const canonical = item.canonical_name || buildFoodIdentity(item.name).canonical_key || "";
        const stockTotal = getInventoryStockTotal(item);
        const usedInRecipes = recipeUsageByCanonical.get(canonical) || [];
        const source = String(item.source || "manual");
        const protectionReasons = [];
        if (stockTotal > 0) protectionReasons.push("Bestand vorhanden");
        if (source !== "recipe") protectionReasons.push("manuell gepflegt");
        if (usedInRecipes.length > 0) protectionReasons.push("in Rezepten verwendet");
        return {
            id: item.id,
            name: item.name,
            canonical_name: canonical,
            source,
            stock_total: stockTotal,
            has_stock: stockTotal > 0,
            used_in_recipes: usedInRecipes,
            is_protected: protectionReasons.length > 0,
            protection_reasons: protectionReasons.length ? protectionReasons : ["automatisch erzeugt, ohne aktiven Schutz"],
            calories_per_100g: item.calories_per_100g === null || item.calories_per_100g === undefined ? null : Number(item.calories_per_100g)
        };
    });

    const groups = new Map();
    for (const item of enrichedItems) {
        const key = item.canonical_name || buildFoodIdentity(item.name).canonical_key || item.name;
        if (!key) continue;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(item);
    }

    const possibleDuplicates = Array.from(groups.entries())
        .filter(([, items]) => items.length > 1)
        .map(([canonical_key, items]) => {
            const activeItems = items.filter(item => true);
            const pair = activeItems.length === 2 ? normalizeDuplicatePairIds(activeItems[0].id, activeItems[1].id) : null;
            const isIgnored = Boolean(pair && ignoredPairKeys.has(`${pair[0]}:${pair[1]}`));
            const preferred = [...activeItems].sort((a, b) => {
                if (a.has_stock !== b.has_stock) return a.has_stock ? -1 : 1;
                if (a.source !== b.source) return a.source === "manual" ? -1 : 1;
                return String(a.name || "").length - String(b.name || "").length;
            })[0];
            const deleteCandidates = activeItems.filter(item => Number(item.id) !== Number(preferred.id));
            return {
                canonical_key,
                ignored: isIgnored,
                suggested_master: preferred,
                suggested_delete_candidates: deleteCandidates,
                candidates: activeItems,
                reason: "Gleicher normalisierter Lebensmittel-Schlüssel. Bitte fachlich prüfen, ob beide wirklich denselben Artikel meinen."
            };
        })
        .filter(group => !group.ignored);

    const orphanRecipeItems = enrichedItems.filter(item =>
        item.source === "recipe" && !item.has_stock && item.used_in_recipes.length === 0
    );

    const protectedItems = enrichedItems.filter(item => item.is_protected);

    return {
        generated_at: new Date().toISOString(),
        counts: {
            inventory_items: enrichedItems.length,
            possible_duplicates: possibleDuplicates.length,
            orphan_recipe_items: orphanRecipeItems.length,
            protected_items: protectedItems.length
        },
        inventory_items: enrichedItems,
        possible_duplicates: possibleDuplicates,
        orphan_recipe_items: orphanRecipeItems,
        protected_items: protectedItems,
        ignored_duplicate_pairs: ignoredPairs
    };
}



async function getTableCountSafe(tableName) {
    try {
        const row = await get(`SELECT COUNT(*) AS count FROM ${tableName}`);
        return Number(row?.count || 0);
    } catch (error) {
        return 0;
    }
}

async function getDatabaseTableNames() {
    const rows = await all(`
        SELECT name FROM sqlite_master
        WHERE type = 'table'
          AND name NOT LIKE 'sqlite_%'
        ORDER BY name COLLATE NOCASE ASC
    `);
    return rows.map(row => row.name);
}


function quoteSqlIdentifier(identifier) {
    const text = String(identifier || "");
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(text)) {
        throw new Error("Ungültiger Tabellenname.");
    }
    return `"${text.replace(/"/g, '""')}"`;
}

async function getAdminTablePreview(tableName, limit = 200) {
    const safeLimit = Math.min(Math.max(Number(limit) || 200, 1), 500);
    const tableNames = await getDatabaseTableNames();
    if (!tableNames.includes(tableName)) {
        throw new Error("Tabelle wurde nicht gefunden.");
    }

    const quotedTable = quoteSqlIdentifier(tableName);
    const columns = await all(`PRAGMA table_info(${quotedTable})`);
    const columnNames = columns.map(col => col.name);

    let rows;
    if (tableName === "food_aliases") {
        rows = await all(`
            SELECT
                fa.id,
                fa.alias_name,
                fa.alias_key,
                fa.food_item_id,
                fi.display_name AS target_food_item,
                fi.canonical_key AS target_canonical_key,
                fa.created_at
            FROM food_aliases fa
            LEFT JOIN food_items fi ON fi.id = fa.food_item_id
            ORDER BY fa.alias_name COLLATE NOCASE ASC
            LIMIT ?
        `, [safeLimit]);
    } else if (tableName === "food_items") {
        rows = await all(`
            SELECT
                fi.*,
                COUNT(DISTINCT fa.id) AS alias_count,
                COUNT(DISTINCT ri.id) AS recipe_ingredient_count,
                COALESCE(GROUP_CONCAT(DISTINCT hf.name), '') AS health_factors
            FROM food_items fi
            LEFT JOIN food_aliases fa ON fa.food_item_id = fi.id
            LEFT JOIN recipe_ingredients ri ON ri.food_item_id = fi.id
            LEFT JOIN food_item_health_factors fihf ON fihf.food_item_id = fi.id
            LEFT JOIN health_factors hf ON hf.id = fihf.health_factor_id
            GROUP BY fi.id
            ORDER BY fi.display_name COLLATE NOCASE ASC
            LIMIT ?
        `, [safeLimit]);
    } else if (tableName === "recipe_ingredients") {
        rows = await all(`
            SELECT
                ri.id,
                ri.recipe_id,
                r.name AS recipe_name,
                ri.raw_text,
                ri.food_name,
                ri.amount,
                ri.unit,
                ri.food_item_id,
                fi.display_name AS linked_food_item,
                ri.link_source,
                ri.canonical_key,
                ri.sort_order,
                ri.updated_at
            FROM recipe_ingredients ri
            LEFT JOIN recipes r ON r.id = ri.recipe_id
            LEFT JOIN food_items fi ON fi.id = ri.food_item_id
            ORDER BY r.name COLLATE NOCASE ASC, ri.sort_order ASC, ri.id ASC
            LIMIT ?
        `, [safeLimit]);
    } else if (tableName === "inventory_items") {
        rows = await all(`
            SELECT
                ii.*,
                COALESCE(batch_stock.amount, 0) AS package_stock,
                COALESCE(loose_stock.amount, 0) AS loose_stock,
                COALESCE(batch_stock.amount, 0) + COALESCE(loose_stock.amount, 0) AS total_stock
            FROM inventory_items ii
            LEFT JOIN (
                SELECT item_id, SUM(remaining_quantity) AS amount
                FROM inventory_batches
                WHERE COALESCE(batch_type, 'package') != 'loose'
                GROUP BY item_id
            ) batch_stock ON batch_stock.item_id = ii.id
            LEFT JOIN (
                SELECT item_id, SUM(remaining_weight) AS amount
                FROM inventory_batches
                WHERE COALESCE(batch_type, '') = 'loose'
                GROUP BY item_id
            ) loose_stock ON loose_stock.item_id = ii.id
            ORDER BY ii.name COLLATE NOCASE ASC
            LIMIT ?
        `, [safeLimit]);
    } else if (tableName === "health_factors") {
        rows = await all(`
            SELECT
                hf.*,
                COUNT(DISTINCT fihf.food_item_id) AS food_item_count
            FROM health_factors hf
            LEFT JOIN food_item_health_factors fihf ON fihf.health_factor_id = hf.id
            GROUP BY hf.id
            ORDER BY hf.category COLLATE NOCASE ASC, hf.name COLLATE NOCASE ASC
            LIMIT ?
        `, [safeLimit]);
    } else if (tableName === "food_item_health_factors") {
        rows = await all(`
            SELECT
                fihf.id,
                fihf.food_item_id,
                fi.display_name AS food_item,
                fihf.health_factor_id,
                hf.name AS health_factor,
                hf.category,
                fihf.notes,
                fihf.created_at
            FROM food_item_health_factors fihf
            LEFT JOIN food_items fi ON fi.id = fihf.food_item_id
            LEFT JOIN health_factors hf ON hf.id = fihf.health_factor_id
            ORDER BY fi.display_name COLLATE NOCASE ASC, hf.name COLLATE NOCASE ASC
            LIMIT ?
        `, [safeLimit]);
    } else {
        rows = await all(`SELECT * FROM ${quotedTable} LIMIT ?`, [safeLimit]);
    }

    return {
        table: tableName,
        limit: safeLimit,
        total_count: await getTableCountSafe(tableName),
        columns: rows.length ? Object.keys(rows[0]) : columnNames,
        rows
    };
}



async function getFoodItemAdminDetail(foodItemId) {
    const id = Number(foodItemId);
    if (!Number.isFinite(id)) throw new Error("Ungültige Lebensmittel-ID.");
    const item = await get(`SELECT * FROM food_items WHERE id = ?`, [id]);
    if (!item) throw new Error("Lebensmittel-Stammsatz wurde nicht gefunden.");

    const aliases = await all(`
        SELECT id, alias_name, alias_key, created_at
        FROM food_aliases
        WHERE food_item_id = ?
        ORDER BY alias_name COLLATE NOCASE ASC
    `, [id]);

    const recipeIngredients = await all(`
        SELECT
            ri.id,
            ri.recipe_id,
            r.name AS recipe_name,
            ri.raw_text,
            ri.food_name,
            ri.amount,
            ri.unit,
            ri.link_source,
            ri.sort_order,
            ri.updated_at
        FROM recipe_ingredients ri
        LEFT JOIN recipes r ON r.id = ri.recipe_id
        WHERE ri.food_item_id = ?
        ORDER BY r.name COLLATE NOCASE ASC, ri.sort_order ASC, ri.id ASC
    `, [id]);

    const inventoryItems = await all(`
        SELECT
            ii.id,
            ii.name,
            ii.unit,
            ii.source,
            ii.canonical_name,
            ii.calories_per_100g,
            COALESCE(batch_stock.amount, 0) AS package_stock,
            COALESCE(loose_stock.amount, 0) AS loose_stock,
            COALESCE(batch_stock.amount, 0) + COALESCE(loose_stock.amount, 0) AS total_stock
        FROM inventory_items ii
        LEFT JOIN (
            SELECT item_id, SUM(remaining_quantity) AS amount
            FROM inventory_batches
            WHERE COALESCE(batch_type, 'package') != 'loose'
            GROUP BY item_id
        ) batch_stock ON batch_stock.item_id = ii.id
        LEFT JOIN (
            SELECT item_id, SUM(remaining_weight) AS amount
            FROM inventory_batches
            WHERE COALESCE(batch_type, '') = 'loose'
            GROUP BY item_id
        ) loose_stock ON loose_stock.item_id = ii.id
        WHERE ii.food_item_id = ?
        ORDER BY ii.name COLLATE NOCASE ASC
    `, [id]);

    const healthFactors = await all(`
        SELECT
            hf.id,
            hf.name,
            hf.category,
            hf.description,
            fihf.notes
        FROM food_item_health_factors fihf
        JOIN health_factors hf ON hf.id = fihf.health_factor_id
        WHERE fihf.food_item_id = ?
        ORDER BY hf.category COLLATE NOCASE ASC, hf.name COLLATE NOCASE ASC
    `, [id]);

    return { item, aliases, recipe_ingredients: recipeIngredients, inventory_items: inventoryItems, health_factors: healthFactors };
}

async function getAdminFoodItemOptions() {
    return all(`
        SELECT
            fi.id,
            fi.display_name,
            fi.canonical_key,
            COUNT(DISTINCT fa.id) AS alias_count,
            COUNT(DISTINCT ri.id) AS recipe_ingredient_count
        FROM food_items fi
        LEFT JOIN food_aliases fa ON fa.food_item_id = fi.id
        LEFT JOIN recipe_ingredients ri ON ri.food_item_id = fi.id
        GROUP BY fi.id
        ORDER BY fi.display_name COLLATE NOCASE ASC
    `);
}

async function buildAdminSystemStatus() {
    const [recipes, recipeIngredients, inventoryItems, inventoryBatches, foodItems, foodAliases, mealPlans, ignoredDuplicatePairs] = await Promise.all([
        getTableCountSafe('recipes'), getTableCountSafe('recipe_ingredients'), getTableCountSafe('inventory_items'), getTableCountSafe('inventory_batches'), getTableCountSafe('food_items'), getTableCountSafe('food_aliases'), getTableCountSafe('meal_plans'), getTableCountSafe('admin_ignored_duplicate_pairs')
    ]);
    const looseCountRow = await get(`SELECT COUNT(*) AS count FROM inventory_batches WHERE COALESCE(batch_type, '') = 'loose'`).catch(() => ({ count: 0 }));
    const inventoryLooseStock = Number(looseCountRow?.count || 0);
    const stockRows = await all(`
        SELECT item_id, SUM(remaining_weight) AS amount FROM inventory_batches WHERE COALESCE(batch_type, '') = 'loose' GROUP BY item_id
        UNION ALL
        SELECT item_id, SUM(remaining_quantity) AS amount FROM inventory_batches WHERE COALESCE(batch_type, 'package') != 'loose' GROUP BY item_id
    `).catch(() => []);
    const itemStock = new Map();
    stockRows.forEach(row => {
        const id = Number(row.item_id);
        itemStock.set(id, (itemStock.get(id) || 0) + Number(row.amount || 0));
    });
    const itemsWithStock = Array.from(itemStock.values()).filter(value => value > 0).length;
    const linkedRow = await get(`SELECT COUNT(*) AS count FROM recipe_ingredients WHERE food_item_id IS NOT NULL`).catch(() => ({ count: 0 }));
    const linkedRecipeIngredients = Number(linkedRow?.count || 0);
    const unlinkedRecipeIngredients = Math.max(0, recipeIngredients - linkedRecipeIngredients);
    const tableNames = await getDatabaseTableNames();
    const tableCounts = [];
    for (const table of tableNames) {
        tableCounts.push({ name: table, count: await getTableCountSafe(table) });
    }
    return {
        generated_at: new Date().toISOString(),
        database_path: dbPath,
        counts: {
            recipes,
            recipe_ingredients: recipeIngredients,
            linked_recipe_ingredients: linkedRecipeIngredients,
            unlinked_recipe_ingredients: unlinkedRecipeIngredients,
            inventory_items: inventoryItems,
            inventory_items_with_stock: itemsWithStock,
            inventory_batches: inventoryBatches,
            inventory_loose_stock: inventoryLooseStock,
            food_items: foodItems,
            food_aliases: foodAliases,
            meal_plans: mealPlans,
            ignored_duplicate_pairs: ignoredDuplicatePairs
        },
        tables: tableCounts
    };
}

async function buildFullJsonBackup() {
    const tableNames = await getDatabaseTableNames();
    const tables = {};
    for (const table of tableNames) {
        tables[table] = await all(`SELECT * FROM ${table}`);
    }
    return {
        app: 'Food Calculator',
        format: 'foodcalculator-json-backup-v1',
        exported_at: new Date().toISOString(),
        database_path: dbPath,
        tables
    };
}

async function getHealthFactorOptions() {
    return all(`
        SELECT id, name, category, description
        FROM health_factors
        ORDER BY category COLLATE NOCASE ASC, name COLLATE NOCASE ASC
    `);
}

async function replaceFoodItemHealthFactors(foodItemId, healthFactorIds = []) {
    const id = Number(foodItemId);
    if (!Number.isFinite(id)) throw new Error("Ungültige Lebensmittel-ID.");
    const uniqueIds = Array.from(new Set((Array.isArray(healthFactorIds) ? healthFactorIds : [])
        .map(Number)
        .filter(Number.isFinite)));
    await run(`DELETE FROM food_item_health_factors WHERE food_item_id = ?`, [id]);
    for (const factorId of uniqueIds) {
        const factor = await get(`SELECT id FROM health_factors WHERE id = ?`, [factorId]);
        if (factor) {
            await run(`INSERT OR IGNORE INTO food_item_health_factors (food_item_id, health_factor_id) VALUES (?, ?)`, [id, factorId]);
        }
    }
}

async function getFoodItemStockTotalByFoodItem(foodItemId) {
    const row = await get(`
        SELECT
            COALESCE(SUM(CASE WHEN COALESCE(ib.batch_type, 'package') = 'loose' THEN COALESCE(ib.remaining_weight, 0) ELSE COALESCE(ib.remaining_quantity, 0) END), 0) AS total_stock
        FROM inventory_items ii
        LEFT JOIN inventory_batches ib ON ib.item_id = ii.id
        WHERE ii.food_item_id = ?
    `, [Number(foodItemId)]);
    return Number(row?.total_stock || 0);
}

async function consolidateFoodItems(masterFoodItemId, duplicateFoodItemIds = []) {
    const masterId = Number(masterFoodItemId);
    const duplicateIds = Array.from(new Set((Array.isArray(duplicateFoodItemIds) ? duplicateFoodItemIds : [])
        .map(Number)
        .filter(id => Number.isFinite(id) && id !== masterId)));

    if (!Number.isFinite(masterId) || duplicateIds.length === 0) {
        throw new Error("Ein Master-Lebensmittel und mindestens eine Dublette sind erforderlich.");
    }

    await run("BEGIN");
    try {
        const master = await get(`SELECT * FROM food_items WHERE id = ?`, [masterId]);
        if (!master) throw new Error("Master-Lebensmittel wurde nicht gefunden.");

        const duplicates = [];
        for (const duplicateId of duplicateIds) {
            const duplicate = await get(`SELECT * FROM food_items WHERE id = ?`, [duplicateId]);
            if (!duplicate) continue;
            duplicates.push(duplicate);
        }
        if (!duplicates.length) throw new Error("Keine gültigen Dubletten gefunden.");

        let masterInventory = await get(`SELECT * FROM inventory_items WHERE food_item_id = ? ORDER BY id ASC LIMIT 1`, [masterId]);

        if (!masterInventory) {
            const firstDuplicateInventory = await get(
                `SELECT * FROM inventory_items WHERE food_item_id IN (${duplicates.map(() => "?").join(",")}) ORDER BY id ASC LIMIT 1`,
                duplicates.map(d => d.id)
            );
            if (firstDuplicateInventory) {
                await run(
                    `UPDATE inventory_items
                     SET food_item_id = ?, canonical_name = ?, name = ?, updated_at = CURRENT_TIMESTAMP
                     WHERE id = ?`,
                    [masterId, master.canonical_key || "", master.display_name || firstDuplicateInventory.name || "", firstDuplicateInventory.id]
                );
                masterInventory = await get(`SELECT * FROM inventory_items WHERE id = ?`, [firstDuplicateInventory.id]);
            }
        }

        const merged = [];
        for (const duplicate of duplicates) {
            await foodItemService.addFoodAlias(masterId, duplicate.display_name);
            await foodItemService.addFoodAlias(masterId, duplicate.canonical_key);

            const aliases = await all(`SELECT alias_name FROM food_aliases WHERE food_item_id = ?`, [duplicate.id]);
            for (const alias of aliases) await foodItemService.addFoodAlias(masterId, alias.alias_name);

            await run(
                `UPDATE recipe_ingredients
                 SET food_item_id = ?, canonical_key = ?, link_source = CASE WHEN link_source = 'manual_unlinked' THEN 'manual' ELSE COALESCE(NULLIF(link_source, ''), 'manual') END, updated_at = CURRENT_TIMESTAMP
                 WHERE food_item_id = ?`,
                [masterId, master.canonical_key || "", duplicate.id]
            );

            const duplicateInventoryRows = await all(`SELECT * FROM inventory_items WHERE food_item_id = ? ORDER BY id ASC`, [duplicate.id]);
            for (const inv of duplicateInventoryRows) {
                if (masterInventory && Number(inv.id) !== Number(masterInventory.id)) {
                    await run(`UPDATE inventory_batches SET item_id = ?, updated_at = CURRENT_TIMESTAMP WHERE item_id = ?`, [masterInventory.id, inv.id]);
                    await run(`DELETE FROM inventory_items WHERE id = ?`, [inv.id]);
                    await inventoryService.recalculateInventoryItem(masterInventory.id);
                } else {
                    await run(
                        `UPDATE inventory_items
                         SET food_item_id = ?, canonical_name = ?, name = ?, updated_at = CURRENT_TIMESTAMP
                         WHERE id = ?`,
                        [masterId, master.canonical_key || "", master.display_name || inv.name || "", inv.id]
                    );
                    masterInventory = await get(`SELECT * FROM inventory_items WHERE id = ?`, [inv.id]);
                }
            }

            await run(`DELETE FROM food_aliases WHERE food_item_id = ?`, [duplicate.id]);
            await run(`DELETE FROM food_items WHERE id = ?`, [duplicate.id]);
            merged.push({ id: duplicate.id, display_name: duplicate.display_name, canonical_key: duplicate.canonical_key });
        }

        await run(
            `UPDATE inventory_items
             SET name = ?, canonical_name = ?, updated_at = CURRENT_TIMESTAMP
             WHERE food_item_id = ?`,
            [master.display_name || "", master.canonical_key || "", masterId]
        );

        await run("COMMIT");
        return {
            master: await getFoodItemAdminDetail(masterId),
            merged
        };
    } catch (error) {
        await run("ROLLBACK");
        throw error;
    }
}

module.exports = {
    normalizeDuplicatePairIds,
    mergeInventoryItems,
    mergeInventoryItemsIntoMaster,
    deleteInventoryItemCompletely,
    buildRecipeIngredientRebuildPlan,
    buildInventoryCleanupPreview,
    getAdminTablePreview,
    getFoodItemAdminDetail,
    getAdminFoodItemOptions,
    buildAdminSystemStatus,
    buildFullJsonBackup,
    getHealthFactorOptions,
    replaceFoodItemHealthFactors,
    getFoodItemStockTotalByFoodItem,
    consolidateFoodItems
};
