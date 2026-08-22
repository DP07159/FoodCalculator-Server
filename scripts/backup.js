const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { openDatabase, configureDatabase, resolveDatabasePath } = require("../lib/database");

function timestamp() {
    return new Date().toISOString().replace(/[:.]/g, "-");
}

async function main() {
    const sourcePath = resolveDatabasePath();
    if (!fs.existsSync(sourcePath)) throw new Error(`Datenbank nicht gefunden: ${sourcePath}`);

    const backupDir = path.resolve(process.env.BACKUP_DIR || "/var/data/backups");
    fs.mkdirSync(backupDir, { recursive: true });
    const targetPath = path.join(backupDir, `food_calculator_${timestamp()}.sqlite`);

    const connection = openDatabase(sourcePath);
    try {
        await configureDatabase(connection);
        await connection.exec("PRAGMA wal_checkpoint(FULL);");
        await connection.close();
        fs.copyFileSync(sourcePath, targetPath, fs.constants.COPYFILE_EXCL);
        const content = fs.readFileSync(targetPath);
        const sha256 = crypto.createHash("sha256").update(content).digest("hex");
        fs.writeFileSync(`${targetPath}.sha256`, `${sha256}  ${path.basename(targetPath)}\n`);
        console.log(JSON.stringify({ ok: true, sourcePath, targetPath, bytes: content.length, sha256 }, null, 2));
    } catch (error) {
        await connection.close().catch(() => {});
        throw error;
    }
}

main().catch(error => {
    console.error(JSON.stringify({ ok: false, error: error.message }, null, 2));
    process.exit(1);
});
