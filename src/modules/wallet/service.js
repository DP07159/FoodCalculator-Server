const crypto = require("crypto");
const repository = require("./repository");
const validator = require("./validator");

function detectPlatform(sourceUrl) {
    if (!sourceUrl) return null;
    try {
        const host = new URL(sourceUrl).hostname.toLowerCase().replace(/^www\./, "");
        if (host.endsWith("instagram.com")) return "instagram";
        if (host.endsWith("tiktok.com")) return "tiktok";
        if (host.endsWith("youtube.com") || host === "youtu.be") return "youtube";
        if (host.endsWith("pinterest.com") || host.endsWith("pin.it")) return "pinterest";
        return host;
    } catch (_) {
        return null;
    }
}

function mapItem(row) {
    if (!row) return null;
    return {
        public_id: row.public_id,
        source_type: row.source_type,
        source_url: row.source_url,
        source_platform: row.source_platform,
        title: row.title,
        note: row.note,
        status: row.status,
        saved_at: row.saved_at,
        created_at: row.created_at,
        updated_at: row.updated_at,
        created_by_name: row.created_by_name || null
    };
}

async function listItems(workspaceId, status) {
    const rows = await repository.listItems(workspaceId, status);
    return rows.map(mapItem);
}

async function createItem({ workspaceId, userId, payload }) {
    const validation = validator.validateCreate(payload);
    if (validation.error) return validation;
    const value = validation.value;
    const publicId = crypto.randomUUID();
    await repository.insertItem({
        public_id: publicId,
        workspace_id: workspaceId,
        created_by_user_id: userId,
        source_type: value.source_type,
        source_url: value.source_url,
        source_platform: detectPlatform(value.source_url),
        source_external_id: null,
        title: value.title,
        note: value.note
    });
    return { value: mapItem(await repository.findByPublicId(workspaceId, publicId)) };
}

async function updateItem({ workspaceId, publicId, payload }) {
    const validation = validator.validateUpdate(payload);
    if (validation.error) return validation;
    const changed = await repository.updateItem(workspaceId, publicId, validation.value);
    if (!changed) return { notFound: true };
    return { value: mapItem(await repository.findByPublicId(workspaceId, publicId)) };
}

async function deleteItem(workspaceId, publicId) {
    return (await repository.deleteItem(workspaceId, publicId)) > 0;
}

module.exports = { listItems, createItem, updateItem, deleteItem, detectPlatform };
