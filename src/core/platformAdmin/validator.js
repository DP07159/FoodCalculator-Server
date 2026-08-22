const USER_STATUSES = new Set([
    "pending",
    "active",
    "suspended"
]);

function validateUserStatus(value) {
    const status = String(value || "").trim();
    if (!USER_STATUSES.has(status)) {
        return {
            error: "User-Status ist ungültig."
        };
    }
    return { value: status };
}

function validateBoolean(value, fieldName = "enabled") {
    if (typeof value !== "boolean") {
        return {
            error: `${fieldName} muss true oder false sein.`
        };
    }
    return { value };
}

function normalizeCode(value) {
    return String(value || "").trim();
}

module.exports = {
    USER_STATUSES,
    validateUserStatus,
    validateBoolean,
    normalizeCode
};
