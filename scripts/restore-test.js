const fs = require("fs");
const os = require("os");
const path = require("path");
const { openDatabase, configureDatabase } = require("../lib/database");

async function main() {
    const backupPath = process.argv[2] ? path.resolve(process.argv[2]) : null;
    if (!backupPath || !fs.existsSync(backupPath)) {
        throw new Error("Aufruf: npm run restore:test -- <Pfad-zur-Backup-Datei>");
    }

    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "foodcalc-restore-"));
    const restoredPath = path.join(tempDir, "restored.sqlite");
    fs.copyFileSync(backupPath, restoredPath);

    const connection = openDatabase(restoredPath);
    try {
        await configureDatabase(connection);
        const integrity = await connection.get("PRAGMA integrity_check");
        const tables = await connection.all("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name");
        if (!integrity || integrity.integrity_check !== "ok") {
            throw new Error(`Integrity Check fehlgeschlagen: ${JSON.stringify(integrity)}`);
        }
        console.log(JSON.stringify({ ok: true, backupPath, restoredPath, integrity: "ok", tables: tables.map(row => row.name) }, null, 2));
    } finally {
        await connection.close();
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
}

main().catch(error => {
    console.error(JSON.stringify({ ok: false, error: error.message }, null, 2));
    process.exit(1);
});
