import { EmbedBuilder } from "discord.js";
import type { Extension } from "./services/registry.js";
import type { GitHubRelease } from "./services/github.js";
export declare function releaseEmbed(release: GitHubRelease): EmbedBuilder;
export declare function extensionEmbed(ext: Extension): EmbedBuilder;
export declare function extensionsListEmbed(exts: Extension[], page: number, totalPages: number): EmbedBuilder;
export interface RegistryStatus {
    count: number;
    cacheAgeMs: number;
    lastRefresh: number | null;
    healthy: boolean;
    stale: boolean;
}
export declare function registryStatusEmbed(status: RegistryStatus): EmbedBuilder;
export interface VerifyStatusData {
    githubUsername: string | null;
    verifiedExtensions: Array<{
        id: string;
        name: string;
        trust: string;
    }>;
    hasDeveloperRole: boolean;
    hasVerifiedRole: boolean;
    pendingToken: {
        extensionId: string;
        expiresAt: number;
    } | null;
}
export declare function verifyStatusEmbed(data: VerifyStatusData): EmbedBuilder;
export declare function verifyInitEmbed(token: string, extensionId: string, repoUrl: string, expiresAt: number): EmbedBuilder;
export declare function successEmbed(title: string, description?: string): EmbedBuilder;
export declare function errorEmbed(title: string, description?: string): EmbedBuilder;
export declare function infoEmbed(title: string, description?: string): EmbedBuilder;
//# sourceMappingURL=embeds.d.ts.map