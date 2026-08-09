const { run, get, all } = require("../../database/database");
const ingredients = require("../../shared/ingredients");
const foodItemService = require("../foodItems/service");

const {
    buildFoodIdentity,
    canonicalizeIngredientName,
    normalizeGermanText
} = ingredients;

function normalizeName(name) {
    return String(name || "").trim();
}

function validateInventoryPayload(payload) {
    const name = normalizeName(payload.name);
    if (!name) return { error: "Bezeichnung ist erforderlich." };

    const caloriesValue = payload.calories_per_100g === "" || payload.calories_per_100g === null || payload.calories_per_100g === undefined
        ? null
        : Number(payload.calories_per_100g);

    if (caloriesValue !== null && (!Number.isFinite(caloriesValue) || caloriesValue < 0)) {
        return { error: "kcal / 100 g muss eine Zahl größer oder gleich 0 sein." };
    }

    return {
        value: {
            name,
            unit: typeof payload.unit === "string" && payload.unit.trim() ? payload.unit.trim() : "g",
            notes: typeof payload.notes === "string" ? payload.notes.trim() : "",
            calories_per_100g: caloriesValue
        }
    };
}

function normalizeMeasureUnit(value) {
    const unit = String(value || "g").trim();
    return unit || "g";
}

function normalizeUnitLabel(value) {
    return String(value || "").trim();
}

function normalizeInventoryBatchRow(batch) {
    return {
        id: batch.id,
        item_id: batch.item_id,
        batch_type: batch.batch_type || "package",
        unit_label: batch.unit_label || "",
        measure_unit: batch.measure_unit || "g",
        original_quantity: Number(batch.original_quantity ?? 0),
        unit_weight: Number(batch.unit_weight ?? 0),
        remaining_quantity: Number(batch.remaining_quantity ?? 0),
        remaining_weight: Number(batch.remaining_weight ?? 0),
        expiry_date: batch.expiry_date || "",
        storage_location: batch.storage_location || "",
        notes: batch.notes || "",
        created_at: batch.created_at || "",
        updated_at: batch.updated_at || ""
    };
}

function normalizeInventoryRow(item, batches = []) {
    const displayName = item.food_display_name || item.display_name || item.name || "";
    const canonicalName = item.food_canonical_key || item.canonical_key || item.canonical_name || buildFoodIdentity(displayName || item.name).canonical_key || "";
    const calories = item.food_calories_per_100g !== null && item.food_calories_per_100g !== undefined
        ? item.food_calories_per_100g
        : item.calories_per_100g;

    return {
        id: item.id,
        name: displayName,
        inventory_name: item.name || "",
        quantity: item.quantity ?? null,
        unit: item.unit || "g",
        weight: item.weight ?? null,
        expiry_date: item.expiry_date || "",
        storage_location: item.storage_location || "",
        notes: item.notes || "",
        calories_per_100g: calories === null || calories === undefined ? null : Number(calories),
        food_item_id: item.food_item_id ?? null,
        canonical_name: canonicalName,
        batches: batches.map(normalizeInventoryBatchRow),
        created_at: item.created_at || "",
        updated_at: item.updated_at || ""
    };
}

async function getInventoryBatches(itemId, { activeOnly = false } = {}) {
    const where = activeOnly ? "AND (remaining_quantity > 0 OR remaining_weight > 0)" : "";
    return all(
        `SELECT * FROM inventory_batches
         WHERE item_id = ? ${where}
         ORDER BY
            CASE WHEN expiry_date = '' THEN 1 ELSE 0 END,
            expiry_date ASC,
            id ASC`,
        [itemId]
    );
}

async function recalculateInventoryItem(itemId) {
    const summary = await get(
        `SELECT
            COALESCE(SUM(remaining_quantity), 0) AS quantity,
            COALESCE(SUM(remaining_weight), 0) AS weight,
            MIN(NULLIF(expiry_date, '')) AS next_expiry
         FROM inventory_batches
         WHERE item_id = ?`,
        [itemId]
    );

    const locationRow = await get(
        `SELECT storage_location
         FROM inventory_batches
         WHERE item_id = ? AND storage_location <> '' AND (remaining_quantity > 0 OR remaining_weight > 0)
         ORDER BY
            CASE WHEN expiry_date = '' THEN 1 ELSE 0 END,
            expiry_date ASC,
            id ASC
         LIMIT 1`,
        [itemId]
    );

    await run(
        `UPDATE inventory_items
         SET quantity = ?, weight = ?, expiry_date = COALESCE(?, ''), storage_location = COALESCE(?, storage_location), updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [summary.quantity || 0, summary.weight || 0, summary.next_expiry || "", locationRow?.storage_location || null, itemId]
    );
}

async function getAllInventoryItemsWithBatches() {
    const inventoryRows = await all(`
        SELECT
            ii.*,
            fi.display_name AS food_display_name,
            fi.canonical_key AS food_canonical_key,
            fi.calories_per_100g AS food_calories_per_100g
        FROM inventory_items ii
        LEFT JOIN food_items fi ON fi.id = ii.food_item_id
        ORDER BY COALESCE(NULLIF(fi.display_name, ''), ii.name) COLLATE NOCASE ASC
    `);

    const inventoryItems = [];
    for (const row of inventoryRows) {
        const batches = await getInventoryBatches(row.id);
        inventoryItems.push(normalizeInventoryRow(row, batches));
    }
    return inventoryItems;
}

async function getInventoryItemWithFoodName(itemId) {
    return get(`
        SELECT
            ii.*,
            fi.display_name AS food_display_name,
            fi.canonical_key AS food_canonical_key,
            fi.calories_per_100g AS food_calories_per_100g
        FROM inventory_items ii
        LEFT JOIN food_items fi ON fi.id = ii.food_item_id
        WHERE ii.id = ?
    `, [itemId]);
}

async function getInventoryItem(itemId) {
    const row = await getInventoryItemWithFoodName(itemId);
    if (!row) return null;
    const batches = await getInventoryBatches(row.id);
    return normalizeInventoryRow(row, batches);
}

async function findInventoryItemByName(name) {
    const cleanName = normalizeName(name);
    const foodItem = await foodItemService.findFoodItemByName(cleanName);

    if (foodItem) {
        const byFoodItem = await get(
            `SELECT * FROM inventory_items WHERE food_item_id = ? ORDER BY id ASC LIMIT 1`,
            [foodItem.id]
        );
        if (byFoodItem) return byFoodItem;
    }

    const identity = buildFoodIdentity(cleanName);
    const byCanonical = identity.canonical_key
        ? await get(
            `SELECT * FROM inventory_items WHERE canonical_name = ? ORDER BY id ASC LIMIT 1`,
            [identity.canonical_key]
        )
        : null;

    if (byCanonical) return byCanonical;

    return get(
        `SELECT * FROM inventory_items WHERE lower(name) = lower(?) LIMIT 1`,
        [cleanName]
    );
}

async function getOrCreateInventoryItem({ name, unit = "g", notes = "", calories_per_100g = null }) {
    const cleanName = normalizeName(name);
    const foodItem = await foodItemService.getOrCreateFoodItem(cleanName, { calories_per_100g });
    let item = await findInventoryItemByName(cleanName);

    if (item) {
        if ((item.calories_per_100g === null || item.calories_per_100g === undefined) && calories_per_100g !== null && calories_per_100g !== undefined) {
            await run(
                `UPDATE inventory_items SET calories_per_100g = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
                [calories_per_100g, item.id]
            );
        }

        await run(
            `UPDATE inventory_items
             SET food_item_id = COALESCE(food_item_id, ?),
                 canonical_name = COALESCE(NULLIF(canonical_name, ''), ?),
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = ?`,
            [foodItem.id, foodItem.canonical_key, item.id]
        );

        return get(`SELECT * FROM inventory_items WHERE id = ?`, [item.id]);
    }

    const result = await run(
        `INSERT INTO inventory_items
         (name, quantity, unit, weight, expiry_date, storage_location, notes, calories_per_100g, food_item_id, canonical_name)
         VALUES (?, 0, ?, 0, '', '', ?, ?, ?, ?)`,
        [foodItem.display_name || cleanName, unit || "g", notes || "", calories_per_100g, foodItem.id, foodItem.canonical_key]
    );

    return get(`SELECT * FROM inventory_items WHERE id = ?`, [result.lastID]);
}

async function createInventoryPackageUnits(itemId, { count, unitLabel, unitWeight, measureUnit, expiry_date = "", storage_location = "", notes = "" }) {
    const safeCount = Math.max(0, Math.floor(Number(count ?? 0)));
    const safeUnitWeight = Math.max(0, Number(unitWeight ?? 0));

    if (safeCount <= 0) throw new Error("Anzahl der Packungseinheiten muss größer 0 sein.");
    if (safeUnitWeight <= 0) throw new Error("Inhalt je Packungseinheit muss größer 0 sein.");

    for (let i = 0; i < safeCount; i += 1) {
        await run(
            `INSERT INTO inventory_batches
             (item_id, batch_type, unit_label, measure_unit, original_quantity, unit_weight, remaining_quantity, remaining_weight, expiry_date, storage_location, notes)
             VALUES (?, 'package', ?, ?, 1, ?, 1, ?, ?, ?, ?)`,
            [itemId, normalizeUnitLabel(unitLabel), normalizeMeasureUnit(measureUnit), safeUnitWeight, safeUnitWeight, expiry_date, storage_location, notes]
        );
    }

    await recalculateInventoryItem(itemId);
}

async function createInventoryLooseAmount(itemId, { amount, measureUnit, expiry_date = "", storage_location = "", notes = "" }) {
    const safeAmount = Math.max(0, Number(amount ?? 0));
    if (safeAmount <= 0) throw new Error("Freie Menge muss größer 0 sein.");

    const existingLoose = await get(
        `SELECT * FROM inventory_batches
         WHERE item_id = ? AND batch_type = 'loose' AND measure_unit = ? AND expiry_date = ? AND storage_location = ?
         LIMIT 1`,
        [itemId, normalizeMeasureUnit(measureUnit), expiry_date || "", storage_location || ""]
    );

    if (existingLoose) {
        await run(
            `UPDATE inventory_batches
             SET remaining_weight = remaining_weight + ?, notes = ?, updated_at = CURRENT_TIMESTAMP
             WHERE id = ?`,
            [safeAmount, notes || existingLoose.notes || "", existingLoose.id]
        );
    } else {
        await run(
            `INSERT INTO inventory_batches
             (item_id, batch_type, unit_label, measure_unit, original_quantity, unit_weight, remaining_quantity, remaining_weight, expiry_date, storage_location, notes)
             VALUES (?, 'loose', 'lose', ?, 0, 0, 0, ?, ?, ?, ?)`,
            [itemId, normalizeMeasureUnit(measureUnit), safeAmount, expiry_date, storage_location, notes]
        );
    }

    await recalculateInventoryItem(itemId);
}

async function migrateInventoryBatches() {
    const items = await all(`SELECT * FROM inventory_items`);

    for (const item of items) {
        const existingBatch = await get(`SELECT id FROM inventory_batches WHERE item_id = ? LIMIT 1`, [item.id]);
        if (existingBatch) continue;

        const quantity = Number(item.quantity ?? 0);
        const weight = Number(item.weight ?? 0);
        if (quantity <= 0 && weight <= 0) continue;

        if (quantity > 0 && weight > 0) {
            await createInventoryPackageUnits(item.id, {
                count: Math.floor(quantity),
                unitLabel: item.unit || "Einheit",
                unitWeight: weight / quantity,
                measureUnit: "g",
                expiry_date: item.expiry_date || "",
                storage_location: item.storage_location || "",
                notes: "Aus bestehendem Bestand übernommen"
            });
        } else if (weight > 0) {
            await createInventoryLooseAmount(item.id, {
                amount: weight,
                measureUnit: item.unit || "g",
                expiry_date: item.expiry_date || "",
                storage_location: item.storage_location || "",
                notes: "Aus bestehendem Bestand übernommen"
            });
        }
    }
}

function scoreInventoryIngredientMatch(item, ingredientName) {
    const ingredientKey = buildFoodIdentity(ingredientName).canonical_key;
    const itemKey = item?.canonical_name || buildFoodIdentity(item?.name).canonical_key;

    if (ingredientKey && itemKey && ingredientKey === itemKey) return 100;

    const ingredientComparable = normalizeGermanText(ingredientName)
        .replace(/[^a-z0-9\s-]/g, " ")
        .replace(/\s+/g, " ")
        .trim();

    const candidateNames = [item?.name, item?.recipe_match_name].filter(Boolean);
    for (const candidate of candidateNames) {
        const candidateComparable = normalizeGermanText(candidate)
            .replace(/[^a-z0-9\s-]/g, " ")
            .replace(/\s+/g, " ")
            .trim();

        if (candidateComparable && ingredientComparable && candidateComparable === ingredientComparable) {
            return 100;
        }
    }

    return 0;
}

async function findInventoryByIngredientName(ingredientName) {
    const normalizedName = ingredients.normalizeIngredientText(ingredientName || "");
    if (!normalizedName) return null;

    const inventoryItems = await getAllInventoryItemsWithBatches();
    const rankedItems = inventoryItems
        .map(item => ({ item, score: scoreInventoryIngredientMatch(item, normalizedName) }))
        .filter(entry => entry.score >= 70)
        .sort((a, b) => b.score - a.score || String(a.item.name || "").localeCompare(String(b.item.name || ""), "de"));

    return rankedItems[0]?.item || null;
}

async function getInventorySuggestions(query) {
    const q = normalizeName(query || "");
    const qIdentity = buildFoodIdentity(q);

    const rows = await all(`
        SELECT DISTINCT
            ii.id,
            COALESCE(NULLIF(fi.display_name, ''), ii.name) AS name,
            ii.name AS inventory_name,
            ii.unit,
            COALESCE(fi.calories_per_100g, ii.calories_per_100g) AS calories_per_100g,
            COALESCE(NULLIF(fi.canonical_key, ''), ii.canonical_name) AS canonical_name
        FROM inventory_items ii
        LEFT JOIN food_items fi ON fi.id = ii.food_item_id
        LEFT JOIN food_aliases fa ON fa.food_item_id = fi.id
        ORDER BY COALESCE(NULLIF(fi.display_name, ''), ii.name) COLLATE NOCASE ASC
    `);

    return rows.filter(row => {
        if (!q) return true;

        const haystack = [row.name, row.inventory_name, row.canonical_name].join(" ").toLowerCase();
        if (haystack.includes(q.toLowerCase())) return true;
        if (qIdentity.canonical_key && row.canonical_name === qIdentity.canonical_key) return true;

        return ingredients.comparableNamesMatch(row.name, q);
    }).slice(0, 10);
}

async function createInventory(payload) {
    const validation = validateInventoryPayload(payload);
    if (validation.error) return { error: validation.error };

    const item = await getOrCreateInventoryItem(validation.value);
    const stockType = payload?.stockType === "loose" ? "loose" : "package";
    const common = {
        expiry_date: typeof payload.expiry_date === "string" ? payload.expiry_date : "",
        storage_location: typeof payload.storage_location === "string" ? payload.storage_location.trim() : "",
        notes: typeof payload.notes === "string" ? payload.notes.trim() : ""
    };

    if (stockType === "package") {
        await createInventoryPackageUnits(item.id, {
            count: payload.packageCount,
            unitLabel: payload.unitLabel,
            unitWeight: payload.unitWeight,
            measureUnit: payload.measureUnit,
            ...common
        });
    } else {
        await createInventoryLooseAmount(item.id, {
            amount: payload.looseAmount,
            measureUnit: payload.measureUnit,
            ...common
        });
    }

    const updated = await getInventoryItemWithFoodName(item.id);
    const batches = await getInventoryBatches(item.id);
    return { value: normalizeInventoryRow(updated, batches) };
}

async function updateInventory(itemId, payload) {
    const validation = validateInventoryPayload(payload);
    if (validation.error) return { error: validation.error };

    const existing = await get(`SELECT * FROM inventory_items WHERE id = ?`, [itemId]);
    if (!existing) return { notFound: true };

    const identity = buildFoodIdentity(validation.value.name);
    const canonicalKey = identity.canonical_key || canonicalizeIngredientName(validation.value.name);
    if (!canonicalKey) return { error: "Lebensmittel konnte nicht normalisiert werden." };

    let foodItem = null;

    if (existing.food_item_id) {
        const currentFoodItem = await get(`SELECT * FROM food_items WHERE id = ?`, [existing.food_item_id]);
        if (currentFoodItem) {
            foodItem = await foodItemService.renameFoodItemStable(existing.food_item_id, validation.value.name, {
                calories_per_100g: validation.value.calories_per_100g,
                updateCanonical: true
            });
        } else {
            foodItem = await foodItemService.getOrCreateFoodItem(validation.value.name, {
                calories_per_100g: validation.value.calories_per_100g
            });
        }
    } else {
        foodItem = await foodItemService.getOrCreateFoodItem(validation.value.name, {
            calories_per_100g: validation.value.calories_per_100g
        });
    }

    await foodItemService.addFoodAlias(foodItem.id, existing.name);
    await foodItemService.addFoodAlias(foodItem.id, validation.value.name);

    await run(
        `UPDATE inventory_items
         SET name = ?, unit = ?, notes = ?, calories_per_100g = ?, food_item_id = ?, canonical_name = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [
            foodItem.display_name || validation.value.name,
            validation.value.unit,
            validation.value.notes,
            validation.value.calories_per_100g,
            foodItem.id,
            foodItem.canonical_key || canonicalKey,
            itemId
        ]
    );

    await recalculateInventoryItem(itemId);
    const updated = await getInventoryItemWithFoodName(itemId);
    const batches = await getInventoryBatches(itemId);
    return { value: normalizeInventoryRow(updated, batches) };
}

async function adjustInventory(itemId, payload) {
    const action = payload?.action === "add" ? "add" : payload?.action === "remove" ? "remove" : "";
    const mode = ["package", "loose", "auto"].includes(payload?.mode) ? payload.mode : "";
    const amount = Number(payload?.amount);

    if (!action) return { error: "Aktion muss add oder remove sein." };
    if (!mode) return { error: "Anpassungsart ist erforderlich." };
    if (!Number.isFinite(amount) || amount <= 0) return { error: "Anpassungswert muss größer 0 sein." };

    const item = await get(`SELECT * FROM inventory_items WHERE id = ?`, [itemId]);
    if (!item) return { notFound: true };

    if (action === "add") {
        if (mode === "package") {
            await createInventoryPackageUnits(item.id, {
                count: amount,
                unitLabel: payload.unitLabel,
                unitWeight: payload.unitWeight,
                measureUnit: payload.measureUnit,
                expiry_date: typeof payload.expiry_date === "string" ? payload.expiry_date : "",
                storage_location: typeof payload.storage_location === "string" ? payload.storage_location.trim() : "",
                notes: "Bestand hinzugefügt"
            });
        } else {
            await createInventoryLooseAmount(item.id, {
                amount,
                measureUnit: payload.measureUnit,
                expiry_date: typeof payload.expiry_date === "string" ? payload.expiry_date : "",
                storage_location: typeof payload.storage_location === "string" ? payload.storage_location.trim() : "",
                notes: "Freie Menge hinzugefügt"
            });
        }
    } else if (mode === "package") {
        const unitWeight = Number(payload?.unitWeight);
        const measureUnit = normalizeMeasureUnit(payload?.measureUnit);
        const storageLocation = typeof payload.storage_location === "string" ? payload.storage_location.trim() : "";
        const expiryDate = typeof payload.expiry_date === "string" ? payload.expiry_date : "";
        const countToRemove = Math.floor(amount);

        if (!Number.isFinite(unitWeight) || unitWeight <= 0) {
            return { error: "Ungültige Einheit." };
        }

        const packages = await all(
            `SELECT * FROM inventory_batches
             WHERE item_id = ?
               AND batch_type = 'package'
               AND unit_weight = ?
               AND measure_unit = ?
               AND storage_location = ?
               AND expiry_date = ?
               AND remaining_quantity > 0
             ORDER BY id ASC
             LIMIT ?`,
            [item.id, unitWeight, measureUnit, storageLocation, expiryDate, countToRemove]
        );

        if (packages.length < countToRemove) {
            return { error: "Nicht genügend Einheiten vorhanden." };
        }

        for (const pack of packages) {
            await run(
                `UPDATE inventory_batches
                 SET remaining_quantity = 0, remaining_weight = 0, updated_at = CURRENT_TIMESTAMP
                 WHERE id = ?`,
                [pack.id]
            );
        }
    } else {
        const measureUnit = normalizeMeasureUnit(payload.measureUnit);
        const storageLocation = typeof payload.storage_location === "string" ? payload.storage_location.trim() : "";
        const expiryDate = typeof payload.expiry_date === "string" ? payload.expiry_date : "";
        const hasStorageLocationFilter = Object.prototype.hasOwnProperty.call(payload, "storage_location");
        const hasExpiryDateFilter = Object.prototype.hasOwnProperty.call(payload, "expiry_date");
        let remainingToRemove = amount;

        const looseWhere = ["item_id = ?", "batch_type = 'loose'", "measure_unit = ?", "remaining_weight > 0"];
        const looseParams = [item.id, measureUnit];

        if (hasStorageLocationFilter) {
            looseWhere.push("storage_location = ?");
            looseParams.push(storageLocation);
        }
        if (hasExpiryDateFilter) {
            looseWhere.push("expiry_date = ?");
            looseParams.push(expiryDate);
        }

        const looseRows = await all(
            `SELECT * FROM inventory_batches
             WHERE ${looseWhere.join(" AND ")}
             ORDER BY CASE WHEN expiry_date = '' THEN 1 ELSE 0 END, expiry_date ASC, id ASC`,
            looseParams
        );

        for (const row of looseRows) {
            if (remainingToRemove <= 0) break;
            const current = Number(row.remaining_weight ?? 0);
            const take = Math.min(current, remainingToRemove);
            await run(
                `UPDATE inventory_batches SET remaining_weight = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
                [Math.max(0, current - take), row.id]
            );
            remainingToRemove -= take;
        }

        if (mode === "auto" && remainingToRemove > 0) {
            const packageRows = await all(
                `SELECT * FROM inventory_batches
                 WHERE item_id = ? AND batch_type = 'package' AND measure_unit = ? AND remaining_weight > 0
                 ORDER BY CASE WHEN expiry_date = '' THEN 1 ELSE 0 END, expiry_date ASC, id ASC`,
                [item.id, measureUnit]
            );

            for (const row of packageRows) {
                if (remainingToRemove <= 0) break;
                const current = Number(row.remaining_weight ?? 0);
                const take = Math.min(current, remainingToRemove);
                const newWeight = Math.max(0, current - take);
                const newQuantity = newWeight > 0 && Number(row.unit_weight ?? 0) > 0
                    ? newWeight / Number(row.unit_weight)
                    : 0;

                await run(
                    `UPDATE inventory_batches
                     SET remaining_weight = ?, remaining_quantity = ?, updated_at = CURRENT_TIMESTAMP
                     WHERE id = ?`,
                    [newWeight, newQuantity, row.id]
                );
                remainingToRemove -= take;
            }
        }

        if (remainingToRemove > 0.000001) {
            return { error: "Nicht genügend Bestand für diese Entnahme vorhanden." };
        }
    }

    await recalculateInventoryItem(itemId);
    const updated = await get(`SELECT * FROM inventory_items WHERE id = ?`, [itemId]);
    const updatedBatches = await getInventoryBatches(itemId);
    return { value: normalizeInventoryRow(updated, updatedBatches) };
}

async function deleteStockProfile(itemId, payload) {
    const item = await get(`SELECT * FROM inventory_items WHERE id = ?`, [itemId]);
    if (!item) return { notFound: true };

    const mode = payload?.mode === "package" ? "package" : payload?.mode === "loose" ? "loose" : "";
    if (!mode) return { error: "Positionstyp ist erforderlich." };

    const measureUnit = normalizeMeasureUnit(payload?.measureUnit);
    const storageLocation = typeof payload.storage_location === "string" ? payload.storage_location.trim() : "";
    const expiryDate = typeof payload.expiry_date === "string" ? payload.expiry_date : "";

    let result;
    if (mode === "package") {
        const unitWeight = Number(payload?.unitWeight);
        if (!Number.isFinite(unitWeight) || unitWeight <= 0) {
            return { error: "Ungültige Einheit." };
        }

        result = await run(
            `DELETE FROM inventory_batches
             WHERE item_id = ?
               AND batch_type = 'package'
               AND unit_weight = ?
               AND measure_unit = ?
               AND storage_location = ?
               AND expiry_date = ?`,
            [item.id, unitWeight, measureUnit, storageLocation, expiryDate]
        );
    } else {
        result = await run(
            `DELETE FROM inventory_batches
             WHERE item_id = ?
               AND batch_type = 'loose'
               AND measure_unit = ?
               AND storage_location = ?
               AND expiry_date = ?`,
            [item.id, measureUnit, storageLocation, expiryDate]
        );
    }

    if (result.changes === 0) return { notFoundProfile: true };

    await recalculateInventoryItem(item.id);
    const updated = await get(`SELECT * FROM inventory_items WHERE id = ?`, [item.id]);
    const updatedBatches = await getInventoryBatches(item.id);
    return { value: normalizeInventoryRow(updated, updatedBatches) };
}

async function deleteInventoryItem(itemId) {
    await run(`DELETE FROM inventory_batches WHERE item_id = ?`, [itemId]);
    const result = await run(`DELETE FROM inventory_items WHERE id = ?`, [itemId]);
    return result.changes > 0;
}

module.exports = {
    normalizeName,
    validateInventoryPayload,
    normalizeMeasureUnit,
    normalizeUnitLabel,
    normalizeInventoryBatchRow,
    normalizeInventoryRow,
    getInventoryBatches,
    recalculateInventoryItem,
    getAllInventoryItemsWithBatches,
    getInventoryItemWithFoodName,
    getInventoryItem,
    findInventoryItemByName,
    getOrCreateInventoryItem,
    createInventoryPackageUnits,
    createInventoryLooseAmount,
    migrateInventoryBatches,
    scoreInventoryIngredientMatch,
    findInventoryByIngredientName,
    getInventorySuggestions,
    createInventory,
    updateInventory,
    adjustInventory,
    deleteStockProfile,
    deleteInventoryItem
};
