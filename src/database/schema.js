const { run, all } = require("./database");

async function addColumnIfMissing(tableName, columnName, definition) {
    const columns = await all(`PRAGMA table_info(${tableName})`);
    const existingColumns = columns.map(column => column.name);

    if (!existingColumns.includes(columnName)) {
        await run(
            `ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`
        );

        console.log(`Spalte ergänzt: ${tableName}.${columnName}`);
    }
}

module.exports = {
    addColumnIfMissing
};
