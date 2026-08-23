const dns = require("dns").promises;
const net = require("net");

function isPrivateIp(ip) {
    if (!ip) return true;
    if (net.isIPv4(ip)) {
        const p = ip.split(".").map(Number);
        return p[0] === 10 || p[0] === 127 || p[0] === 0 || (p[0] === 169 && p[1] === 254) || (p[0] === 172 && p[1] >= 16 && p[1] <= 31) || (p[0] === 192 && p[1] === 168);
    }
    const value = ip.toLowerCase();
    return value === "::1" || value.startsWith("fc") || value.startsWith("fd") || value.startsWith("fe80:");
}

async function assertPublicUrl(raw) {
    const url = new URL(raw);
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('unsupported protocol');
    if (url.username || url.password) throw new Error('credentials not allowed');
    const records = await dns.lookup(url.hostname, { all: true });
    if (!records.length || records.some(record => isPrivateIp(record.address))) throw new Error('private address not allowed');
    return url;
}

function decodeEntities(value = '') {
    return value.replace(/&amp;/gi, '&').replace(/&quot;/gi, '"').replace(/&#39;/gi, "'").replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').trim();
}
function pickMeta(html, key) {
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const a = new RegExp(`<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']+)["'][^>]*>`, 'i').exec(html);
    const b = new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${escaped}["'][^>]*>`, 'i').exec(html);
    return decodeEntities((a || b || [])[1] || '');
}
function pickTitle(html) {
    return decodeEntities((/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html) || [])[1] || '').replace(/\s+/g, ' ').trim();
}
function absoluteUrl(value, base) {
    if (!value) return null;
    try { return new URL(value, base).toString(); } catch (_) { return null; }
}

async function fetchHtml(rawUrl, maxRedirects = 3) {
    let current = (await assertPublicUrl(rawUrl)).toString();
    for (let i = 0; i <= maxRedirects; i += 1) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 2800);
        let response;
        try {
            response = await fetch(current, { redirect: 'manual', signal: controller.signal, headers: { 'User-Agent': 'FoodMomentPlatform/1.0 (+metadata-preview)', Accept: 'text/html,application/xhtml+xml' } });
        } finally { clearTimeout(timeout); }
        if ([301,302,303,307,308].includes(response.status)) {
            const location = response.headers.get('location');
            if (!location) throw new Error('redirect without location');
            current = (await assertPublicUrl(new URL(location, current).toString())).toString();
            continue;
        }
        if (!response.ok) throw new Error(`source returned ${response.status}`);
        const type = (response.headers.get('content-type') || '').toLowerCase();
        if (!type.includes('text/html') && !type.includes('application/xhtml+xml')) throw new Error('source is not html');
        const reader = response.body?.getReader();
        if (!reader) return { html: await response.text(), finalUrl: current };
        const chunks = []; let size = 0;
        while (size < 512000) {
            const { done, value } = await reader.read();
            if (done) break;
            chunks.push(value); size += value.byteLength;
        }
        try { reader.cancel(); } catch (_) {}
        return { html: Buffer.concat(chunks.map(v => Buffer.from(v))).toString('utf8'), finalUrl: current };
    }
    throw new Error('too many redirects');
}

async function preview(rawUrl) {
    try {
        const { html, finalUrl } = await fetchHtml(rawUrl);
        const title = pickMeta(html, 'og:title') || pickMeta(html, 'twitter:title') || pickTitle(html);
        const image = pickMeta(html, 'og:image') || pickMeta(html, 'twitter:image') || pickMeta(html, 'twitter:image:src');
        return { title: title ? title.slice(0, 240) : null, image_url: absoluteUrl(image, finalUrl), final_url: finalUrl };
    } catch (_) {
        return { title: null, image_url: null, final_url: rawUrl };
    }
}
module.exports = { preview, isPrivateIp };
