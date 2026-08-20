import { Client } from "discord.js";
import type { GitHubRelease } from "./github.js";
export declare function announceRelease(client: Client, release: GitHubRelease, mark?: boolean): Promise<number>;
export declare function startPoller(client: Client): void;
export declare function stopPoller(): void;
/**
 * Fetch and return the latest release without marking it as announced.
 * Used by /announce-now.
 */
export declare function fetchLatestRelease(repo?: string): Promise<GitHubRelease | null>;
//# sourceMappingURL=poller.d.ts.map