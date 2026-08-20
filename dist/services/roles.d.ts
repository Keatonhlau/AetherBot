import { Client, GuildMember } from "discord.js";
export interface RoleEligibility {
    extensionDeveloper: boolean;
    verifiedDeveloper: boolean;
}
export declare function evaluateEligibility(userId: string, guildId: string): RoleEligibility;
/**
 * Assign or revoke Aether-managed roles for a guild member.
 * Never touches roles we don't own. Returns true if any change was made.
 */
export declare function assignRoles(member: GuildMember, _client: Client): Promise<boolean>;
/**
 * Re-evaluate all users in a guild who have verified extensions.
 * Called on registry refresh when trust levels may have changed.
 */
export declare function syncAllRoles(guildId: string, client: Client): Promise<void>;
//# sourceMappingURL=roles.d.ts.map