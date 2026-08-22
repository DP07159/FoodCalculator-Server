const crypto = require("crypto");
const argon2 = require("argon2");
const repository = require("./repository");
const { mapUser, mapSession } = require("./mapper");
const {
    validateBootstrapPayload,
    validateLoginPayload,
    validateChangePasswordPayload
} = require("./validator");

const SESSION_TTL_DAYS = Math.max(1, Number(process.env.SESSION_TTL_DAYS || 30));
const MAX_FAILED_ATTEMPTS = 5;
const LOCK_MINUTES = 15;

function hashSessionToken(token) {
    return crypto.createHash("sha256").update(String(token || "")).digest("hex");
}

function hashIp(ip) {
    const value = String(ip || "").trim();
    const secret = process.env.IP_HASH_SECRET;
    if (!value || !secret) return null;
    return crypto.createHmac("sha256", secret).update(value).digest("hex");
}

function createRawSessionToken() {
    return crypto.randomBytes(32).toString("base64url");
}

function sessionExpiryDate() {
    const date = new Date();
    date.setUTCDate(date.getUTCDate() + SESSION_TTL_DAYS);
    return date.toISOString();
}

async function hashPassword(password) {
    return argon2.hash(password, {
        type: argon2.argon2id,
        memoryCost: 65536,
        timeCost: 3,
        parallelism: 1
    });
}

function isLocked(credential) {
    if (!credential?.locked_until) return false;
    return new Date(credential.locked_until).getTime() > Date.now();
}

async function bootstrapInitialUser(payload) {
    const validation = validateBootstrapPayload(payload);
    if (validation.error) return { error: validation.error };

    const existingCount = await repository.countUsers();
    if (existingCount > 0) {
        return { error: "Initialisierung ist gesperrt: Es existiert bereits mindestens ein Benutzer." };
    }

    const { email, displayName, password, locale } = validation.value;
    const passwordHash = await hashPassword(password);
    const publicId = crypto.randomUUID();

    const user = await repository.createUser({
        publicId,
        email,
        displayName,
        status: "active",
        locale
    });

    await repository.createPasswordCredential(user.id, passwordHash);

    return { user: mapUser(user) };
}

async function login(payload, context = {}) {
    const validation = validateLoginPayload(payload);
    if (validation.error) return { error: validation.error, status: 400 };

    const user = await repository.findUserByEmail(validation.value.email);
    if (!user) return { error: "E-Mail-Adresse oder Passwort ist falsch.", status: 401 };
    if (user.status !== "active") return { error: "Benutzerkonto ist nicht aktiv.", status: 403 };

    const credential = await repository.findCredential(user.id, "password");
    if (!credential?.password_hash) return { error: "E-Mail-Adresse oder Passwort ist falsch.", status: 401 };
    if (isLocked(credential)) return { error: "Anmeldung vorübergehend gesperrt. Bitte später erneut versuchen.", status: 423 };

    const valid = await argon2.verify(credential.password_hash, validation.value.password);
    if (!valid) {
        const failedAttempts = Number(credential.failed_attempts || 0) + 1;
        const lockedUntil = failedAttempts >= MAX_FAILED_ATTEMPTS
            ? new Date(Date.now() + LOCK_MINUTES * 60 * 1000).toISOString()
            : null;
        await repository.registerCredentialFailure(credential.id, failedAttempts, lockedUntil);
        return { error: "E-Mail-Adresse oder Passwort ist falsch.", status: 401 };
    }

    await repository.resetCredentialFailures(credential.id);
    await repository.deleteExpiredSessions();

    const token = createRawSessionToken();
    const session = await repository.createSession({
        userId: user.id,
        tokenHash: hashSessionToken(token),
        expiresAt: sessionExpiryDate(),
        ipHash: hashIp(context.ip),
        userAgent: String(context.userAgent || "").slice(0, 500) || null
    });

    return {
        token,
        token_type: "Bearer",
        expires_at: session.expires_at,
        user: mapUser(user)
    };
}

async function authenticateToken(token) {
    const rawToken = String(token || "").trim();
    if (!rawToken) return null;

    const row = await repository.findActiveSessionByTokenHash(hashSessionToken(rawToken));
    if (!row || row.user_status !== "active") return null;

    await repository.touchSession(row.id);

    return {
        session: {
            id: row.id,
            user_id: row.user_id,
            expires_at: row.expires_at
        },
        user: {
            id: row.user_id,
            public_id: row.user_public_id,
            email: row.user_email,
            display_name: row.user_display_name,
            status: row.user_status,
            locale: row.user_locale,
            created_at: row.user_created_at,
            updated_at: row.user_updated_at
        }
    };
}

async function changePassword(userId, currentSessionId, payload) {
    const validation = validateChangePasswordPayload(payload);
    if (validation.error) return { error: validation.error, status: 400 };

    const credential = await repository.findCredential(userId, "password");
    if (!credential?.password_hash) {
        return { error: "Für dieses Benutzerkonto ist kein Passwort-Login eingerichtet.", status: 409 };
    }

    const currentPasswordValid = await argon2.verify(
        credential.password_hash,
        validation.value.currentPassword
    );

    if (!currentPasswordValid) {
        return { error: "Aktuelles Passwort ist falsch.", status: 401 };
    }

    const newHash = await hashPassword(validation.value.newPassword);
    await repository.updatePasswordCredential(credential.id, newHash);

    if (validation.value.revokeOtherSessions) {
        await repository.revokeOtherSessions(userId, currentSessionId);
    }

    return {
        success: true,
        other_sessions_revoked: validation.value.revokeOtherSessions
    };
}

async function logout(token) {
    const rawToken = String(token || "").trim();
    if (!rawToken) return false;
    const result = await repository.revokeSessionByTokenHash(hashSessionToken(rawToken));
    return result.changes > 0;
}

async function listSessions(userId) {
    const rows = await repository.listActiveSessionsForUser(userId);
    return rows.map(mapSession);
}

async function revokeOwnSession(userId, sessionId) {
    const id = Number(sessionId);
    if (!Number.isInteger(id) || id <= 0) return false;
    const result = await repository.revokeSessionById(id, userId);
    return result.changes > 0;
}

module.exports = {
    bootstrapInitialUser,
    login,
    authenticateToken,
    changePassword,
    logout,
    listSessions,
    revokeOwnSession,
    hashSessionToken,
    hashPassword
};
