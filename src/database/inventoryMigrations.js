const { run } = require("./database");

async function backfillInventoryBatchDefaults() {
    await run(`
        UPDATE inventory_items
        SET
            quantity = COALESCE(quantity, 0),
            unit = COALESCE(NULLIF(unit, ''), 'g'),
            weight = COALESCE(weight, 0),
            expiry_date = COALESCE(expiry_date, ''),
            storage_location = COALESCE(storage_location, ''),
            notes = COALESCE(notes, '')
    `);

    await run(`
        UPDATE inventory_batches
        SET
            batch_type = COALESCE(NULLIF(batch_type, ''), 'package'),
            unit_label = COALESCE(unit_label, ''),
            measure_unit = COALESCE(NULLIF(measure_unit, ''), 'g'),
            original_quantity = COALESCE(original_quantity, 0),
            unit_weight = COALESCE(unit_weight, 0),
            remaining_quantity = COALESCE(remaining_quantity, 0),
            remaining_weight = COALESCE(remaining_weight, 0),
            expiry_date = COALESCE(expiry_date, ''),
            storage_location = COALESCE(storage_location, ''),
            notes = COALESCE(notes, '')
    `);
}

module.exports = {
    backfillInventoryBatchDefaults
};
