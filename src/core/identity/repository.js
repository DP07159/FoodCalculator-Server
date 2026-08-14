const { run, get, all } = require("../../database/database");

async function countUsers() {
    const row = await get(`SELECT COUNT(*) AS count FROM users`);
    return Number(row?.count || 0);
}

function findUserById(userId) {
    return get(`SELECT * FROM users WHERE id = ?`, [userId]);
}

function findUserByPublicId(publicId) {
    return get(`SELECT * FROM users WHERE public_id = ?`, [publicId]);
}

function findUserByEmail(email) {
    return get(`SELECT * FROM users WHERE lower(email) = lower(?) LIMIT 1`, [email]);
}

async function createUser({ publicId, email, displayName, status = "active", locale = "de-DE" }) {
    const result = await run(
        `INSERT INTO users (public_id, email, display_name, status, locale, updated_at)
         VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
        [publicId, email, displayName, status, locale]
    );
    return findUserById(result.lastID);
}


function listUsersForAdministration() {
    return all(
        `SELECT
            u.id,
            u.public_id,
            u.email,
            u.display_name,
            u.status,
            u.locale,
            u.created_at,
            u.updated_at,
            w.public_id AS workspace_public_id,
            w.name AS workspace_name,
            wm.status AS membership_status,
            wm.is_owner,
            GROUP_CONCAT(DISTINCT r.code) AS role_codes
         FROM users u
         LEFT JOIN workspaces w
                ON w.owner_user_id = u.id
               AND w.workspace_type = 'personal'
               AND w.archived_at IS NULL
         LEFT JOIN workspace_memberships wm
                ON wm.workspace_id = w.id
               AND wm.user_id = u.id
         LEFT JOIN membership_roles mr ON mr.membership_id = wm.id
         LEFT JOIN roles r ON r.id = mr.role_id
         WHERE u.deleted_at IS NULL
         GROUP BY u.id, w.id, wm.id
         ORDER BY u.display_name COLLATE NOCASE ASC, u.id ASC`
    );
}

function updateUserStatus(userId, status) {
    return run(
        `UPDATE users
         SET status = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND deleted_at IS NULL`,
        [status, userId]
    );
}

function findCredential(userId, credentialType = "password") {
    return get(
        `SELECT * FROM user_credentials WHERE user_id = ? AND credential_type = ? LIMIT 1`,
        [userId, credentialType]
    );
}

async function createPasswordCredential(userId, passwordHash) {
    const result = await run(
        `INSERT INTO user_credentials (
            user_id, credential_type, password_hash, password_changed_at,
            failed_attempts, locked_until, updated_at
         ) VALUES (?, 'password', ?, CURRENT_TIMESTAMP, 0, NULL, CURRENT_TIMESTAMP)`,
        [userId, passwordHash]
    );
    return get(`SELECT * FROM user_credentials WHERE id = ?`, [result.lastID]);
}

function updatePasswordCredential(credentialId, passwordHash) {
    return run(
        `UPDATE user_credentials
         SET password_hash = ?,
             password_changed_at = CURRENT_TIMESTAMP,
             failed_attempts = 0,
             locked_until = NULL,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND credential_type = 'password'`,
        [passwordHash, credentialId]
    );
}


function revokeAllSessions(userId) {
    return run(
        `UPDATE user_sessions
         SET revoked_at = COALESCE(revoked_at, CURRENT_TIMESTAMP)
         WHERE user_id = ?
           AND revoked_at IS NULL`,
        [userId]
    );
}

function revokeOtherSessions(userId, currentSessionId) {
    return run(
        `UPDATE user_sessions
         SET revoked_at = COALESCE(revoked_at, CURRENT_TIMESTAMP)
         WHERE user_id = ?
           AND id <> ?
           AND revoked_at IS NULL`,
        [userId, currentSessionId]
    );
}

function resetCredentialFailures(credentialId) {
    return run(
        `UPDATE user_credentials
         SET failed_attempts = 0, locked_until = NULL, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [credentialId]
    );
}

function registerCredentialFailure(credentialId, failedAttempts, lockedUntil = null) {
    return run(
        `UPDATE user_credentials
         SET failed_attempts = ?, locked_until = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [failedAttempts, lockedUntil, credentialId]
    );
}

async function createSession({ userId, tokenHash, expiresAt, ipHash = null, userAgent = null }) {
    const result = await run(
        `INSERT INTO user_sessions (
            user_id, token_hash, expires_at, last_seen_at, ip_hash, user_agent
         ) VALUES (?, ?, ?, CURRENT_TIMESTAMP, ?, ?)`,
        [userId, tokenHash, expiresAt, ipHash, userAgent]
    );
    return get(`SELECT * FROM user_sessions WHERE id = ?`, [result.lastID]);
}

function findActiveSessionByTokenHash(tokenHash) {
    return get(
        `SELECT
            s.*,
            u.public_id AS user_public_id,
            u.email AS user_email,
            u.display_name AS user_display_name,
            u.status AS user_status,
            u.locale AS user_locale,
            u.created_at AS user_created_at,
            u.updated_at AS user_updated_at
         FROM user_sessions s
         JOIN users u ON u.id = s.user_id
         WHERE s.token_hash = ?
           AND s.revoked_at IS NULL
           AND datetime(s.expires_at) > datetime('now')
         LIMIT 1`,
        [tokenHash]
    );
}

function touchSession(sessionId) {
    return run(
        `UPDATE user_sessions SET last_seen_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [sessionId]
    );
}

function revokeSessionById(sessionId, userId) {
    return run(
        `UPDATE user_sessions
         SET revoked_at = COALESCE(revoked_at, CURRENT_TIMESTAMP)
         WHERE id = ? AND user_id = ?`,
        [sessionId, userId]
    );
}

function revokeSessionByTokenHash(tokenHash) {
    return run(
        `UPDATE user_sessions
         SET revoked_at = COALESCE(revoked_at, CURRENT_TIMESTAMP)
         WHERE token_hash = ?`,
        [tokenHash]
    );
}

function listActiveSessionsForUser(userId) {
    return all(
        `SELECT id, expires_at, last_seen_at, user_agent, created_at
         FROM user_sessions
         WHERE user_id = ?
           AND revoked_at IS NULL
           AND datetime(expires_at) > datetime('now')
         ORDER BY datetime(last_seen_at) DESC, id DESC`,
        [userId]
    );
}

function deleteExpiredSessions() {
    return run(
        `DELETE FROM user_sessions
         WHERE datetime(expires_at) <= datetime('now')
            OR (revoked_at IS NOT NULL AND datetime(revoked_at) < datetime('now', '-30 days'))`
    );
}

module.exports = {
    countUsers,
    findUserById,
    findUserByPublicId,
    findUserByEmail,
    createUser,
    listUsersForAdministration,
    updateUserStatus,
    findCredential,
    createPasswordCredential,
    updatePasswordCredential,
    revokeAllSessions,
    revokeOtherSessions,
    resetCredentialFailures,
    registerCredentialFailure,
    createSession,
    findActiveSessionByTokenHash,
    touchSession,
    revokeSessionById,
    revokeSessionByTokenHash,
    listActiveSessionsForUser,
    deleteExpiredSessions
};
