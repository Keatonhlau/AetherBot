"use strict";
// Role assignment service.
// Evaluates what roles a user should have based on verified extensions,
// registry trust levels, and owner configuration.
// All role operations are idempotent.
Object.defineProperty(exports, "__esModule", { value: true });
exports.evaluateEligibility = evaluateEligibility;
exports.assignRoles = assignRoles;
exports.syncAllRoles = syncAllRoles;
const config_js_1 = require("../config.js");
const db_js_1 = require("../db.js");
const registry_js_1 = require("./registry.js");
function evaluateEligibility(userId, guildId) {
    const isOwner = config_js_1.config.ownerUserIds.includes(userId);
    if (isOwner) {
        return { extensionDeveloper: true, verifiedDeveloper: true };
    }
    const userExts = db_js_1.verifiedExtensions.getForUser(userId);
    if (userExts.length === 0) {
        return { extensionDeveloper: false, verifiedDeveloper: false };
    }
    const extensionDeveloper = true; // Has at least one verified extension
    // Verified developer if any extension is "verified" or "official"
    const verifiedDeveloper = userExts.some((ve) => {
        const ext = (0, registry_js_1.getExtension)(ve.extension_id);
        return ext?.trust === "verified" || ext?.trust === "official";
    });
    return { extensionDeveloper, verifiedDeveloper };
}
// ---------------------------------------------------------------------------
// Role grant / revoke (idempotent)
// ---------------------------------------------------------------------------
/**
 * Assign or revoke Aether-managed roles for a guild member.
 * Never touches roles we don't own. Returns true if any change was made.
 */
async function assignRoles(member, _client) {
    const guildId = member.guild.id;
    const userId = member.id;
    const settings = db_js_1.guildSettings.get(guildId);
    const guildCfg = config_js_1.config.guilds[guildId];
    const devRoleId = settings?.extension_developer_role_id ??
        guildCfg?.extensionDeveloperRoleId;
    const verifiedRoleId = settings?.verified_developer_role_id ??
        guildCfg?.verifiedDeveloperRoleId;
    if (!devRoleId && !verifiedRoleId) {
        // No roles configured for this guild — nothing to do
        return false;
    }
    const eligibility = evaluateEligibility(userId, guildId);
    let changed = false;
    try {
        if (devRoleId) {
            const hasRole = member.roles.cache.has(devRoleId);
            if (eligibility.extensionDeveloper && !hasRole) {
                await member.roles.add(devRoleId, "AetherBot: verified extension developer");
                console.log(`[roles] +ExtensionDeveloper → ${userId} in ${guildId}`);
                changed = true;
            }
            else if (!eligibility.extensionDeveloper && hasRole) {
                await member.roles.remove(devRoleId, "AetherBot: no longer qualifies");
                console.log(`[roles] -ExtensionDeveloper → ${userId} in ${guildId}`);
                changed = true;
            }
        }
        if (verifiedRoleId) {
            const hasRole = member.roles.cache.has(verifiedRoleId);
            if (eligibility.verifiedDeveloper && !hasRole) {
                await member.roles.add(verifiedRoleId, "AetherBot: verified developer");
                console.log(`[roles] +VerifiedDeveloper → ${userId} in ${guildId}`);
                changed = true;
            }
            else if (!eligibility.verifiedDeveloper && hasRole) {
                await member.roles.remove(verifiedRoleId, "AetherBot: no longer qualifies");
                console.log(`[roles] -VerifiedDeveloper → ${userId} in ${guildId}`);
                changed = true;
            }
        }
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[roles] Failed to update roles for ${userId} in ${guildId}: ${msg}`);
    }
    return changed;
}
/**
 * Re-evaluate all users in a guild who have verified extensions.
 * Called on registry refresh when trust levels may have changed.
 */
async function syncAllRoles(guildId, client) {
    const guild = client.guilds.cache.get(guildId);
    if (!guild)
        return;
    const allVerified = db_js_1.verifiedExtensions.getAll();
    const userIds = [...new Set(allVerified.map((ve) => ve.discord_user_id))];
    for (const userId of userIds) {
        try {
            const member = await guild.members.fetch(userId).catch(() => null);
            if (!member)
                continue;
            await assignRoles(member, client);
        }
        catch (err) {
            console.error(`[roles] syncAllRoles error for ${userId}:`, err);
        }
    }
    // Also ensure owners have their roles
    for (const ownerId of config_js_1.config.ownerUserIds) {
        try {
            const member = await guild.members.fetch(ownerId).catch(() => null);
            if (!member)
                continue;
            await assignRoles(member, client);
        }
        catch (err) {
            console.error(`[roles] owner sync error for ${ownerId}:`, err);
        }
    }
}
//# sourceMappingURL=roles.js.map