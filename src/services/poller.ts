// Release poller — fetches new Aether releases and announces them.
// Uses recursive setTimeout to avoid overlapping runs.

import { Client, TextChannel } from "discord.js";
import { config } from "../config.js";
import { GitHubClient } from "./github.js";
import { announcedReleases, announceChannels } from "../db.js";
import { releaseEmbed } from "../embeds.js";
import type { GitHubRelease } from "./github.js";

// ---------------------------------------------------------------------------
// Announce a single release to all configured channels in all guilds
// ---------------------------------------------------------------------------

export async function announceRelease(
  client: Client,
  release: GitHubRelease,
  mark = true
): Promise<number> {
  let sent = 0;

  for (const guild of client.guilds.cache.values()) {
    const channelIds = announceChannels.list(guild.id);
    for (const channelId of channelIds) {
      try {
        const channel = await client.channels
          .fetch(channelId)
          .catch(() => null);
        if (!channel || !(channel instanceof TextChannel)) {
          console.warn(
            `[poller] Channel ${channelId} in guild ${guild.id} not found or not a text channel`
          );
          continue;
        }
        await channel.send({ embeds: [releaseEmbed(release)] });
        sent++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(
          `[poller] Failed to send to channel ${channelId}: ${msg}`
        );
      }
    }
  }

  if (mark) {
    announcedReleases.mark(release.id, release.tag_name);
  }

  return sent;
}

// ---------------------------------------------------------------------------
// Poll loop
// ---------------------------------------------------------------------------

let pollTimeout: ReturnType<typeof setTimeout> | null = null;

async function poll(client: Client): Promise<void> {
  const gh = new GitHubClient(config.githubToken);
  const result = await gh.getReleases(config.githubRepo);

  if (!result.ok) {
    console.warn(`[poller] Failed to fetch releases: ${result.message}`);
    return;
  }

  // Sort ascending by published date so we announce in chronological order
  const releases = result.data
    .filter((r) => !r.draft)
    .sort(
      (a, b) =>
        new Date(a.published_at).getTime() - new Date(b.published_at).getTime()
    );

  let announced = 0;
  for (const release of releases) {
    if (!announcedReleases.has(release.id)) {
      const sent = await announceRelease(client, release, true);
      if (sent > 0 || client.guilds.cache.size === 0) {
        // Mark even if no channels are configured, to avoid re-checking forever
        console.log(
          `[poller] Announced release ${release.tag_name} to ${sent} channel(s)`
        );
      }
      announced++;
    }
  }

  if (announced === 0) {
    // No new releases — quiet log
    console.debug(
      `[poller] No new releases (checked ${releases.length} releases)`
    );
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function startPoller(client: Client): void {
  const intervalMs = config.pollIntervalSeconds * 1000;

  const tick = async () => {
    try {
      await poll(client);
    } catch (err) {
      console.error("[poller] Unexpected error during poll:", err);
    } finally {
      pollTimeout = setTimeout(tick, intervalMs);
    }
  };

  console.log(
    `[poller] Starting release poller (interval: ${config.pollIntervalSeconds}s)`
  );
  // First run after a short delay to let the bot fully start
  pollTimeout = setTimeout(tick, 5000);
}

export function stopPoller(): void {
  if (pollTimeout) {
    clearTimeout(pollTimeout);
    pollTimeout = null;
  }
}

/**
 * Fetch and return the latest release without marking it as announced.
 * Used by /announce-now.
 */
export async function fetchLatestRelease(
  repo?: string
): Promise<GitHubRelease | null> {
  const gh = new GitHubClient(config.githubToken);
  const targetRepo = repo ?? config.githubRepo;
  
  // Fetch releases list to include prereleases (GitHub /releases/latest API ignores prereleases)
  const result = await gh.getReleases(targetRepo);
  if (result.ok && result.data.length > 0) {
    const nonDrafts = result.data.filter((r) => !r.draft);
    if (nonDrafts.length > 0) return nonDrafts[0];
  }

  // Fallback to getLatestRelease if list call failed
  const fallback = await gh.getLatestRelease(targetRepo);
  return fallback.ok ? fallback.data : null;
}
