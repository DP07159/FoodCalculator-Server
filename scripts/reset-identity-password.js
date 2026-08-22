const argon2 = require("argon2");
const database = require("../src/database/database");
const { runMigrations } = require("../lib/migrationRunner");
const repository = require("../src/core/identity/repository");
const {
    normalizeEmail,
    validateEmail,
    validatePassword
} = require("../src/core/identity/validator");

function readArgs(argv) {
    const values = {};
    for (let i = 0; i < argv.length; i += 1) {
        const arg = argv[i];
        if (!arg.startsWith("--")) continue;
        const key = arg.slice(2);
        const value = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : "";
        values[key] = value;
    }
    return values;
}

async function main() {
    const args = readArgs(process.argv.slice(2));

    const email = normalizeEmail(
        args.email || process.env.IDENTITY_RESET_EMAIL
    );
    const password =
        args.password || process.env.IDENTITY_RESET_PASSWORD || "";

    const emailError = validateEmail(email);
    if (emailError) throw new Error(emailError);

    const passwordError = validatePassword(password);
    if (passwordError) throw new Error(passwordError);

    const connection = database.getDefaultConnection();
    await database.configureDatabase(connection);
    await runMigrations(connection);

    const user = await repository.findUserByEmail(email);
    if (!user) {
        throw new Error("Benutzer wurde nicht gefunden.");
    }

    const credential = await repository.findCredential(user.id, "password");
    if (!credential) {
        throw new Error("Für diesen Benutzer existiert kein Passwort-Credential.");
    }

    const passwordHash = await argon2.hash(password, {
        type: argon2.argon2id,
        memoryCost: 65536,
        timeCost: 3,
        parallelism: 1
    });

    await repository.updatePasswordCredential(
        credential.id,
        passwordHash
    );

    await repository.revokeAllSessions(user.id);

    console.log(JSON.stringify({
        ok: true,
        user: {
            public_id: user.public_id,
            email: user.email,
            display_name: user.display_name,
            status: user.status
        },
        password_changed: true,
        sessions_revoked: true
    }, null, 2));
}

main().catch(error => {
    console.error(JSON.stringify({
        ok: false,
        error: error.message
    }, null, 2));
    process.exit(1);
});
