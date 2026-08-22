function normalizeEmail(value) {
    return String(value || "").trim().toLowerCase();
}

function validateEmail(email) {
    if (!email) return "E-Mail-Adresse ist erforderlich.";
    if (email.length > 254) return "E-Mail-Adresse ist zu lang.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return "E-Mail-Adresse ist ungültig.";
    return null;
}

function validatePassword(password) {
    const value = String(password || "");
    if (value.length < 12) return "Passwort muss mindestens 12 Zeichen lang sein.";
    if (value.length > 256) return "Passwort ist zu lang.";
    return null;
}

function validateLoginPayload(payload = {}) {
    const email = normalizeEmail(payload.email);
    const password = typeof payload.password === "string" ? payload.password : "";
    const emailError = validateEmail(email);
    if (emailError) return { error: emailError };
    if (!password) return { error: "Passwort ist erforderlich." };
    return { value: { email, password } };
}

function validateChangePasswordPayload(payload = {}) {
    const currentPassword = typeof payload.current_password === "string" ? payload.current_password : "";
    const newPassword = typeof payload.new_password === "string" ? payload.new_password : "";
    const revokeOtherSessions = payload.revoke_other_sessions !== false;

    if (!currentPassword) return { error: "Aktuelles Passwort ist erforderlich." };
    const passwordError = validatePassword(newPassword);
    if (passwordError) return { error: passwordError };
    if (currentPassword === newPassword) return { error: "Das neue Passwort muss sich vom aktuellen Passwort unterscheiden." };

    return {
        value: {
            currentPassword,
            newPassword,
            revokeOtherSessions
        }
    };
}

function validateBootstrapPayload(payload = {}) {
    const email = normalizeEmail(payload.email);
    const displayName = String(payload.display_name || payload.displayName || "").trim();
    const password = typeof payload.password === "string" ? payload.password : "";
    const locale = String(payload.locale || "de-DE").trim() || "de-DE";

    const emailError = validateEmail(email);
    if (emailError) return { error: emailError };
    if (!displayName) return { error: "Anzeigename ist erforderlich." };
    if (displayName.length > 120) return { error: "Anzeigename ist zu lang." };
    const passwordError = validatePassword(password);
    if (passwordError) return { error: passwordError };

    return { value: { email, displayName, password, locale } };
}

module.exports = {
    normalizeEmail,
    validateEmail,
    validatePassword,
    validateLoginPayload,
    validateChangePasswordPayload,
    validateBootstrapPayload
};
