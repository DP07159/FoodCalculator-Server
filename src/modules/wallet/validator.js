function cleanText(value, maxLength = 500) {
    const text = String(value ?? "").trim();
    return text ? text.slice(0, maxLength) : "";
}

function normalizeUrl(value) {
    const raw = cleanText(value, 2048);
    if (!raw) return "";
    try {
        const parsed = new URL(raw);
        if (!["http:", "https:"].includes(parsed.protocol)) return "";
        return parsed.toString();
    } catch (_) {
        return "";
    }
}

function validateCreate(payload = {}) {
    const sourceUrl = normalizeUrl(payload.source_url);
    const title = cleanText(payload.title, 240);
    const note = cleanText(payload.note, 2000);
    const sourceType = sourceUrl ? "link" : "note";

    if (!sourceUrl && !title && !note) {
        return { error: "Speichere mindestens einen Link, Titel oder eine Notiz." };
    }

    if (payload.source_url && !sourceUrl) {
        return { error: "Die Quelle muss eine gültige http- oder https-Adresse sein." };
    }

    return {
        value: {
            source_type: sourceType,
            source_url: sourceUrl || null,
            title: title || null,
            note: note || null
        }
    };
}

function validateUpdate(payload = {}) {
    const allowedStatus = new Set(["saved", "used", "archived"]);
    const value = {};

    if (Object.prototype.hasOwnProperty.call(payload, "title")) value.title = cleanText(payload.title, 240) || null;
    if (Object.prototype.hasOwnProperty.call(payload, "note")) value.note = cleanText(payload.note, 2000) || null;
    if (Object.prototype.hasOwnProperty.call(payload, "status")) {
        const status = cleanText(payload.status, 32);
        if (!allowedStatus.has(status)) return { error: "Unbekannter Wallet-Status." };
        value.status = status;
    }

    if (!Object.keys(value).length) return { error: "Keine gültige Änderung angegeben." };
    return { value };
}

module.exports = { validateCreate, validateUpdate };
