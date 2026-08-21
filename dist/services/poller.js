"use strict";
// Release poller — fetches new Aether releases and announces them.
// Uses recursive setTimeout to avoid overlapping runs.
Object.defineProperty(exports, "__esModule", { value: true });
exports.announceRelease = announceRelease;
exports.startPoller = startPoller;
exports.stopPoller = stopPoller;
exports.fetchLatestRelease = fetchLatestRelease;
const config_js_1 = require("../config.js");
const github_js_1 = require("./github.js");
const db_js_1 = require("../db.js");
const embeds_js_1 = require("../embeds.js");
// ---------------------------------------------------------------------------
// Announce a single release to all configured channels in all guilds
// ---------------------------------------------------------------------------
async function announceRelease(client, release, mark = true) {
    let sent = 0;
    for (const guild of client.guilds.cache.values()) {
        const channelIds = db_js_1.announceChannels.list(guild.id);
        for (const channelId of channelIds) {
            try {
                const channel = await client.channels
                    .fetch(channelId)
                    .catch(() => null);
                if (!channel || !channel.isTextBased()) {
                    console.warn(`[poller] Channel ${channelId} in guild ${guild.id} not found or not text-based`);
                    continue;
                }
                if ("send" in channel && typeof channel.send === "function") {
                    await channel.send({ embeds: [(0, embeds_js_1.releaseEmbed)(release)] });
                    sent++;
                }
            }
            catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                console.error(`[poller] Failed to send to channel ${channelId}: ${msg}`);
            }
        }
    }
    if (mark) {
        db_js_1.announcedReleases.mark(release.id, release.tag_name);
    }
    return sent;
}
// ---------------------------------------------------------------------------
// Poll loop
// ---------------------------------------------------------------------------
let pollTimeout = null;
async function poll(client) {
    const gh = new github_js_1.GitHubClient(config_js_1.config.githubToken);
    const result = await gh.getReleases(config_js_1.config.githubRepo);
    if (!result.ok) {
        console.warn(`[poller] Failed to fetch releases: ${result.message}`);
        return;
    }
    // Sort ascending by published date so we announce in chronological order
    const releases = result.data
        .filter((r) => !r.draft)
        .sort((a, b) => new Date(a.published_at).getTime() - new Date(b.published_at).getTime());
    let announced = 0;
    for (const release of releases) {
        if (!db_js_1.announcedReleases.has(release.id)) {
            const sent = await announceRelease(client, release, true);
            if (sent > 0 || client.guilds.cache.size === 0) {
                // Mark even if no channels are configured, to avoid re-checking forever
                console.log(`[poller] Announced release ${release.tag_name} to ${sent} channel(s)`);
            }
            announced++;
        }
    }
    if (announced === 0) {
        // No new releases — quiet log
        console.debug(`[poller] No new releases (checked ${releases.length} releases)`);
    }
}
// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------
function startPoller(client) {
    const intervalMs = config_js_1.config.pollIntervalSeconds * 1000;
    const tick = async () => {
        try {
            await poll(client);
        }
        catch (err) {
            console.error("[poller] Unexpected error during poll:", err);
        }
        finally {
            pollTimeout = setTimeout(tick, intervalMs);
        }
    };
    console.log(`[poller] Starting release poller (interval: ${config_js_1.config.pollIntervalSeconds}s)`);
    // First run after a short delay to let the bot fully start
    pollTimeout = setTimeout(tick, 5000);
}
function stopPoller() {
    if (pollTimeout) {
        clearTimeout(pollTimeout);
        pollTimeout = null;
    }
}
/**
 * Fetch and return the latest release without marking it as announced.
 * Used by /announce-now.
 */
async function fetchLatestRelease(repo) {
    const gh = new github_js_1.GitHubClient(config_js_1.config.githubToken);
    const targetRepo = repo ?? config_js_1.config.githubRepo;
    // Fetch releases list to include prereleases (GitHub /releases/latest API ignores prereleases)
    const result = await gh.getReleases(targetRepo);
    if (result.ok && result.data.length > 0) {
        const nonDrafts = result.data.filter((r) => !r.draft);
        if (nonDrafts.length > 0)
            return nonDrafts[0];
    }
    // Fallback to getLatestRelease if list call failed
    const fallback = await gh.getLatestRelease(targetRepo);
    return fallback.ok ? fallback.data : null;
}
//# sourceMappingURL=poller.js.map