const identityService = require("./service");

function getBearerToken(req) {
    const header = String(req.headers.authorization || "");
    const match = header.match(/^Bearer\s+(.+)$/i);
    return match ? match[1].trim() : "";
}

async function optionalAuthentication(req, res, next) {
    try {
        const token = getBearerToken(req);
        req.auth = token ? await identityService.authenticateToken(token) : null;
        req.authToken = token || null;
        next();
    } catch (error) {
        next(error);
    }
}

async function requireAuthentication(req, res, next) {
    try {
        const token = getBearerToken(req);
        if (!token) return res.status(401).json({ error: "Anmeldung erforderlich." });

        const auth = await identityService.authenticateToken(token);
        if (!auth) return res.status(401).json({ error: "Sitzung ist ungültig oder abgelaufen." });

        req.auth = auth;
        req.authToken = token;
        next();
    } catch (error) {
        next(error);
    }
}

module.exports = { getBearerToken, optionalAuthentication, requireAuthentication };
