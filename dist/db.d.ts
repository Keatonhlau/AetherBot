import { Database as DatabaseType } from "better-sqlite3";
declare const db: DatabaseType;
export interface GithubLink {
    discord_user_id: string;
    github_username: string;
    created_at: number;
}
export interface VerificationToken {
    id: number;
    discord_user_id: string;
    extension_id: string;
    token_hash: string;
    expires_at: number;
    failed_attempts: number;
    created_at: number;
}
export interface AnnouncedRelease {
    release_id: number;
    tag_name: string;
    announced_at: number;
}
export interface GuildSettings {
    guild_id: string;
    extension_developer_role_id: string | null;
    verified_developer_role_id: string | null;
}
export interface VerifiedExtension {
    discord_user_id: string;
    extension_id: string;
    verified_at: number;
}
export declare const githubLinks: {
    get(userId: string): GithubLink | undefined;
    upsert(userId: string, username: string): void;
    delete(userId: string): void;
};
export declare const verificationTokens: {
    getActive(userId: string, extensionId: string): VerificationToken | undefined;
    insert(userId: string, extensionId: string, tokenHash: string, expiresAt: number): void;
    incrementFailed(id: number): void;
    invalidate(id: number): void;
    deleteAllForUser(userId: string): void;
    getAnyPending(userId: string): VerificationToken | undefined;
};
export declare const announcedReleases: {
    has(releaseId: number): boolean;
    mark(releaseId: number, tagName: string): void;
};
export declare const announcedExtensions: {
    has(extensionId: string): boolean;
    mark(extensionId: string): void;
    count(): number;
};
export declare const guildSettings: {
    get(guildId: string): GuildSettings | undefined;
    setExtensionDevRole(guildId: string, roleId: string): void;
    setVerifiedDevRole(guildId: string, roleId: string): void;
};
export declare const announceChannels: {
    list(guildId: string): string[];
    add(guildId: string, channelId: string): void;
    remove(guildId: string, channelId: string): void;
};
export declare const verifiedExtensions: {
    getForUser(userId: string): VerifiedExtension[];
    add(userId: string, extensionId: string): void;
    deleteAllForUser(userId: string): void;
    getUsersForExtension(extensionId: string): string[];
    getAll(): VerifiedExtension[];
};
export default db;
//# sourceMappingURL=db.d.ts.map