"use strict";
// Extension registry service.
// Fetches index.json from GitHub with a 10-minute in-memory cache.
// Serves stale data gracefully when GitHub is unavailable.
Object.defineProperty(exports, "__esModule", { value: true });
exports.refreshRegistry = refreshRegistry;
exports.onRegistryRefresh = onRegistryRefresh;
exports.getRegistry = getRegistry;
exports.getExtension = getExtension;
exports.getRegistryStatus = getRegistryStatus;
exports.startRegistryRefreshLoop = startRegistryRefreshLoop;
const github_js_1 = require("./github.js");
const config_js_1 = require("../config.js");
// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes
let cache = null;
let refreshCallbacks = [];
// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------
function isValidExtension(raw) {
    if (!raw || typeof raw !== "object")
        return false;
    const obj = raw;
    return (typeof obj["id"] === "string" &&
        typeof obj["name"] === "string" &&
        typeof obj["author"] === "string" &&
        (obj["trust"] === "official" ||
            obj["trust"] === "verified" ||
            obj["trust"] === "community"));
}
function parseRegistry(raw) {
    if (!Array.isArray(raw)) {
        console.error("[registry] index.json is not an array");
        return [];
    }
    const exts = [];
    for (const item of raw) {
        if (isValidExtension(item)) {
            exts.push(item);
        }
        else {
            console.warn("[registry] Skipping invalid entry:", JSON.stringify(item).slice(0, 80));
        }
    }
    return exts;
}
// ---------------------------------------------------------------------------
// Refresh logic
// ---------------------------------------------------------------------------
async function refreshRegistry() {
    const client = new github_js_1.GitHubClient(config_js_1.config.githubToken);
    const result = await client.getRegistryIndex(config_js_1.config.githubRegistryRepo);
    if (!result.ok) {
        console.warn(`[registry] Refresh failed: ${result.message}`);
        if (cache) {
            // Keep serving stale cache
            cache = { ...cache, healthy: false };
        }
        return;
    }
    const extensions = parseRegistry(result.data);
    const prevExtensions = cache?.extensions ?? [];
    cache = { extensions, fetchedAt: Date.now(), healthy: true };
    console.log(`[registry] Refreshed — ${extensions.length} extensions loaded`);
    // Notify listeners about trust-level changes
    if (prevExtensions.length > 0 && refreshCallbacks.length > 0) {
        for (const cb of refreshCallbacks) {
            try {
                cb(prevExtensions, extensions);
            }
            catch (err) {
                console.error("[registry] Refresh callback error:", err);
            }
        }
    }
}
// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------
function onRegistryRefresh(cb) {
    refreshCallbacks.push(cb);
}
async function getRegistry() {
    const now = Date.now();
    if (!cache || now - cache.fetchedAt > CACHE_TTL_MS) {
        await refreshRegistry();
    }
    return cache?.extensions ?? [];
}
function getExtension(id) {
    return cache?.extensions.find((e) => e.id === id);
}
function getRegistryStatus() {
    if (!cache) {
        return {
            count: 0,
            cacheAgeMs: 0,
            lastRefresh: null,
            healthy: false,
            stale: true,
        };
    }
    const ageMs = Date.now() - cache.fetchedAt;
    return {
        count: cache.extensions.length,
        cacheAgeMs: ageMs,
        lastRefresh: cache.fetchedAt,
        healthy: cache.healthy,
        stale: ageMs > CACHE_TTL_MS,
    };
}
/** Start a background refresh loop (every CACHE_TTL_MS). */
function startRegistryRefreshLoop() {
    const loop = async () => {
        await refreshRegistry();
        setTimeout(loop, CACHE_TTL_MS);
    };
    setTimeout(loop, CACHE_TTL_MS); // first manual refresh is done at startup
}
//# sourceMappingURL=registry.js.map