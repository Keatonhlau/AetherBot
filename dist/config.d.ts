import "dotenv/config";
export interface GuildConfig {
    announceChannelIds?: string[];
    extensionDeveloperRoleId?: string;
    verifiedDeveloperRoleId?: string;
}
export interface Config {
    discordToken: string;
    githubToken: string;
    githubRepo: string;
    githubRegistryRepo: string;
    pollIntervalSeconds: number;
    verifyTokenTtlHours: number;
    ownerUserIds: string[];
    guilds: Record<string, GuildConfig>;
}
export declare const config: Config;
//# sourceMappingURL=config.d.ts.map