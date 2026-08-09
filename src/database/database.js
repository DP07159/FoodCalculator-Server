const fs = require("fs");
const path = require("path");
const sqlite3 = require("sqlite3").verbose();

function resolveDatabasePath() {
    if (process.env.DB_PATH) return path.resolve(process.env.DB_PATH);
    if (process.env.RENDER) return "/var/data/food_calculator.sqlite";
    return path.join(__dirname, "..", "..", "data", "food_calculator.sqlite");
}

function ensureParentDirectory(filePath) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function openDatabase(databasePath = resolveDatabasePath()) {
    ensureParentDirectory(databasePath);
    const db = new sqlite3.Database(databasePath);

    const run = (sql, params = []) => new Promise((resolve, reject) => {
        db.run(sql, params, function (error) {
            if (error) reject(error);
            else resolve(this);
        });
    });

    const get = (sql, params = []) => new Promise((resolve, reject) => {
        db.get(sql, params, (error, row) => {
            if (error) reject(error);
            else resolve(row);
        });
    });

    const all = (sql, params = []) => new Promise((resolve, reject) => {
        db.all(sql, params, (error, rows) => {
            if (error) reject(error);
            else resolve(rows);
        });
    });

    const exec = sql => new Promise((resolve, reject) => {
        db.exec(sql, error => error ? reject(error) : resolve());
    });

    const close = () => new Promise((resolve, reject) => {
        db.close(error => error ? reject(error) : resolve());
    });

    return { db, databasePath, dbPath: databasePath, run, get, all, exec, close };
}

async function configureDatabase(connection) {
    await connection.exec(`
        PRAGMA foreign_keys = ON;
        PRAGMA journal_mode = WAL;
        PRAGMA busy_timeout = 5000;
    `);

    const foreignKeys = await connection.get("PRAGMA foreign_keys");
    if (!foreignKeys || Number(foreignKeys.foreign_keys) !== 1) {
        throw new Error("SQLite Foreign Keys konnten nicht aktiviert werden.");
    }
}

let defaultConnection = null;

function getDefaultConnection() {
    if (!defaultConnection) {
        defaultConnection = openDatabase();
    }
    return defaultConnection;
}

function run(sql, params = []) {
    return getDefaultConnection().run(sql, params);
}

function get(sql, params = []) {
    return getDefaultConnection().get(sql, params);
}

function all(sql, params = []) {
    return getDefaultConnection().all(sql, params);
}

function exec(sql) {
    return getDefaultConnection().exec(sql);
}

module.exports = {
    resolveDatabasePath,
    openDatabase,
    configureDatabase,
    getDefaultConnection,
    run,
    get,
    all,
    exec
};
