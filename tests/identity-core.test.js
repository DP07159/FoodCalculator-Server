const argon2 = require("argon2");
const {
    validateBootstrapPayload,
    validateLoginPayload,
    validateChangePasswordPayload
} = require("../src/core/identity/validator");
const { hashSessionToken } = require("../src/core/identity/service");

async function main() {
    const bootstrap = validateBootstrapPayload({
        email: "Test.User@example.com",
        display_name: "Test User",
        password: "EinSehrSicheresPasswort!2026",
        locale: "de-DE"
    });
    if (bootstrap.error) throw new Error(bootstrap.error);
    if (bootstrap.value.email !== "test.user@example.com") throw new Error("E-Mail-Normalisierung fehlgeschlagen.");

    const login = validateLoginPayload({ email: "test.user@example.com", password: "x" });
    if (login.error) throw new Error(login.error);

    const password = "EinSehrSicheresPasswort!2026";
    const hash = await argon2.hash(password, { type: argon2.argon2id });
    if (!await argon2.verify(hash, password)) throw new Error("Argon2id-Verifikation fehlgeschlagen.");

    const changePassword = validateChangePasswordPayload({
        current_password: "AktuellesPasswort!2026",
        new_password: "NeuesPasswort!2026",
        revoke_other_sessions: true
    });
    if (changePassword.error) throw new Error(changePassword.error);
    if (!changePassword.value.revokeOtherSessions) throw new Error("Session-Widerruf beim Passwortwechsel wurde nicht korrekt validiert.");

    const tokenHashA = hashSessionToken("session-token");
    const tokenHashB = hashSessionToken("session-token");
    if (tokenHashA !== tokenHashB || tokenHashA === "session-token") throw new Error("Session-Token-Hashing fehlgeschlagen.");

    console.log(JSON.stringify({
        ok: true,
        emailNormalization: true,
        argon2id: true,
        sessionTokenHashing: true,
        passwordChangeValidation: true
    }, null, 2));
}

main().catch(error => {
    console.error(JSON.stringify({ ok: false, error: error.message }, null, 2));
    process.exit(1);
});
