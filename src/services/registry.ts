// Extension registry service.
// Fetches index.json from GitHub with a 10-minute in-memory cache.
// Serves stale data gracefully when GitHub is unavailable.

import { GitHubClient } from "./github.js";
import { config } from "../config.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Extension {
  id: string;
  name: string;
  author: string;
  description?: string;
  version?: string;
  url?: string;
  install_url?: string;
  iconUrl?: string;
  repository?: string;
  trust: "official" | "verified" | "community";
}

export interface RegistryCache {
  extensions: Extension[];
  fetchedAt: number;
  healthy: boolean;
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

let cache: RegistryCache | null = null;
let refreshCallbacks: Array<(prev: Extension[], next: Extension[]) => void> = [];

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function isValidExtension(raw: unknown): raw is Extension {
  if (!raw || typeof raw !== "object") return false;
  const obj = raw as Record<string, unknown>;
  return (
    typeof obj["id"] === "string" &&
    typeof obj["name"] === "string" &&
    typeof obj["author"] === "string" &&
    (obj["trust"] === "official" ||
      obj["trust"] === "verified" ||
      obj["trust"] === "community")
  );
}

function parseRegistry(raw: unknown): Extension[] {
  if (!Array.isArray(raw)) {
    console.error("[registry] index.json is not an array");
    return [];
  }
  const exts: Extension[] = [];
  for (const item of raw) {
    if (isValidExtension(item)) {
      exts.push(item);
    } else {
      console.warn("[registry] Skipping invalid entry:", JSON.stringify(item).slice(0, 80));
    }
  }
  return exts;
}

// ---------------------------------------------------------------------------
// Refresh logic
// ---------------------------------------------------------------------------

export async function refreshRegistry(): Promise<void> {
  const client = new GitHubClient(config.githubToken);
  const result = await client.getRegistryIndex(config.githubRegistryRepo);

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
      } catch (err) {
        console.error("[registry] Refresh callback error:", err);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function onRegistryRefresh(
  cb: (prev: Extension[], next: Extension[]) => void
): void {
  refreshCallbacks.push(cb);
}

export async function getRegistry(): Promise<Extension[]> {
  const now = Date.now();
  if (!cache || now - cache.fetchedAt > CACHE_TTL_MS) {
    await refreshRegistry();
  }
  return cache?.extensions ?? [];
}

export function getExtension(id: string): Extension | undefined {
  return cache?.extensions.find((e) => e.id === id);
}

export interface RegistryStatusInfo {
  count: number;
  cacheAgeMs: number;
  lastRefresh: number | null;
  healthy: boolean;
  stale: boolean;
}

export function getRegistryStatus(): RegistryStatusInfo {
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
export function startRegistryRefreshLoop(): void {
  const loop = async () => {
    await refreshRegistry();
    setTimeout(loop, CACHE_TTL_MS);
  };
  setTimeout(loop, CACHE_TTL_MS); // first manual refresh is done at startup
}
