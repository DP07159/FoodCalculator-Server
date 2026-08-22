const identityService = require("./service");
const { mapUser } = require("./mapper");

async function login(req, res) {
    try {
        const result = await identityService.login(req.body, {
            ip: req.ip,
            userAgent: req.get("user-agent")
        });
        if (result.error) return res.status(result.status || 400).json({ error: result.error });
        res.json(result);
    } catch (error) {
        console.error("Fehler bei POST /auth/login:", error.message);
        res.status(500).json({ error: "Anmeldung konnte nicht verarbeitet werden." });
    }
}

async function changePassword(req, res) {
    try {
        const result = await identityService.changePassword(
            req.auth.user.id,
            req.auth.session.id,
            req.body
        );
        if (result.error) return res.status(result.status || 400).json({ error: result.error });
        res.json(result);
    } catch (error) {
        console.error("Fehler bei POST /auth/change-password:", error.message);
        res.status(500).json({ error: "Passwort konnte nicht geändert werden." });
    }
}

async function logout(req, res) {
    try {
        await identityService.logout(req.authToken);
        res.json({ success: true });
    } catch (error) {
        console.error("Fehler bei POST /auth/logout:", error.message);
        res.status(500).json({ error: "Abmeldung konnte nicht verarbeitet werden." });
    }
}

function me(req, res) {
    res.json({ user: mapUser(req.auth?.user) });
}

async function sessions(req, res) {
    try {
        res.json({ sessions: await identityService.listSessions(req.auth.user.id) });
    } catch (error) {
        console.error("Fehler bei GET /auth/sessions:", error.message);
        res.status(500).json({ error: "Sitzungen konnten nicht geladen werden." });
    }
}

async function revokeSession(req, res) {
    try {
        const revoked = await identityService.revokeOwnSession(req.auth.user.id, req.params.id);
        if (!revoked) return res.status(404).json({ error: "Sitzung wurde nicht gefunden." });
        res.json({ success: true });
    } catch (error) {
        console.error("Fehler bei DELETE /auth/sessions/:id:", error.message);
        res.status(500).json({ error: "Sitzung konnte nicht beendet werden." });
    }
}

module.exports = { login, changePassword, logout, me, sessions, revokeSession };
