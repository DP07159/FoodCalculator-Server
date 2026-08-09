const fs = require("fs");
const os = require("os");
const path = require("path");
const { openDatabase, configureDatabase } = require("../lib/database");

function resolveBackupPath() {
    const explicitArg = process.argv
        .slice(2)
        .find(arg => arg && !String(arg).startsWith("-"));

    if (explicitArg) {
        const resolved = path.resolve(explicitArg);
        if (!fs.existsSync(resolved)) {
            throw new Error(`Backup-Datei wurde nicht gefunden: ${resolved}`);
        }
        return resolved;
    }

    const backupDir = path.resolve(process.env.BACKUP_DIR || "/var/data/backups");

    if (!fs.existsSync(backupDir)) {
        throw new Error(
            "Kein Backup-Verzeichnis gefunden. Bitte zuerst npm run backup ausführen."
        );
    }

    const candidates = fs.readdirSync(backupDir)
        .filter(name => name.toLowerCase().endsWith(".sqlite"))
        .map(name => {
            const fullPath = path.join(backupDir, name);
            return {
                path: fullPath,
                mtimeMs: fs.statSync(fullPath).mtimeMs
            };
        })
        .sort((a, b) => b.mtimeMs - a.mtimeMs);

    if (!candidates.length) {
        throw new Error(
            "Keine SQLite-Backup-Datei gefunden. Bitte zuerst npm run backup ausführen."
        );
    }

    return candidates[0].path;
}

async function main() {
    const backupPath = resolveBackupPath();

    const tempDir = fs.mkdtempSync(
        path.join(os.tmpdir(), "foodcalc-restore-")
    );
    const restoredPath = path.join(tempDir, "restored.sqlite");

    fs.copyFileSync(backupPath, restoredPath);

    const connection = openDatabase(restoredPath);

    try {
        await configureDatabase(connection);

        const integrity = await connection.get(
            "PRAGMA integrity_check"
        );

        const tables = await connection.all(
            "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name"
        );

        if (!integrity || integrity.integrity_check !== "ok") {
            throw new Error(
                `Integrity Check fehlgeschlagen: ${JSON.stringify(integrity)}`
            );
        }

        console.log(JSON.stringify({
            ok: true,
            backupPath,
            restoredPath,
            integrity: "ok",
            tables: tables.map(row => row.name)
        }, null, 2));
    } finally {
        await connection.close();
        fs.rmSync(tempDir, {
            recursive: true,
            force: true
        });
    }
}

main().catch(error => {
    console.error(JSON.stringify({
        ok: false,
        error: error.message
    }, null, 2));
    process.exit(1);
});
