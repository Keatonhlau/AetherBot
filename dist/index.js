"use strict";
// AetherBot — Entry Point
// Loads commands, registers slash commands, starts the poller and registry loop.
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const discord_js_1 = require("discord.js");
const config_js_1 = require("./config.js");
const poller_js_1 = require("./services/poller.js");
const registry_js_1 = require("./services/registry.js");
const roles_js_1 = require("./services/roles.js");
async function loadCommands() {
    const map = new Map();
    const modules = [
        await Promise.resolve().then(() => __importStar(require("./commands/announcements.js"))),
        await Promise.resolve().then(() => __importStar(require("./commands/registry.js"))),
        await Promise.resolve().then(() => __importStar(require("./commands/verify.js"))),
        await Promise.resolve().then(() => __importStar(require("./commands/admin.js"))),
    ];
    for (const mod of modules) {
        for (const cmd of mod.commands) {
            map.set(cmd.data.name, cmd);
        }
    }
    return map;
}
// ---------------------------------------------------------------------------
// Register slash commands with Discord
// ---------------------------------------------------------------------------
async function registerCommands(commands) {
    const rest = new discord_js_1.REST().setToken(config_js_1.config.discordToken);
    const bodies = [...commands.values()].map((c) => c.data.toJSON());
    try {
        console.log(`[discord] Registering ${bodies.length} application commands...`);
        await rest.put(discord_js_1.Routes.applicationCommands((await rest.get(discord_js_1.Routes.currentApplication())).id), { body: bodies });
        console.log("[discord] Commands registered globally.");
    }
    catch (err) {
        console.error("[discord] Failed to register commands:", err);
        throw err;
    }
}
// ---------------------------------------------------------------------------
// Guild join / sync helpers
// ---------------------------------------------------------------------------
async function onGuildJoin(guild, client) {
    console.log(`[discord] Joined guild: ${guild.name} (${guild.id})`);
    await (0, roles_js_1.syncAllRoles)(guild.id, client);
}
// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
    console.log("[aetherbot] Starting up...");
    // Load commands
    const commands = await loadCommands();
    console.log(`[aetherbot] Loaded ${commands.size} commands`);
    // Register with Discord
    await registerCommands(commands);
    // Create Discord client (standard non-privileged intent)
    const client = new discord_js_1.Client({
        intents: [discord_js_1.GatewayIntentBits.Guilds],
    });
    // ---------------------------------------------------------------------------
    // Interaction handler
    // ---------------------------------------------------------------------------
    client.on("interactionCreate", async (interaction) => {
        if (!interaction.isChatInputCommand())
            return;
        const cmd = commands.get(interaction.commandName);
        if (!cmd)
            return;
        try {
            await cmd.execute(interaction);
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            console.error(`[discord] Error executing /${interaction.commandName}: ${msg}`);
            const reply = {
                content: "An unexpected error occurred. Please try again later.",
                ephemeral: true,
            };
            try {
                if (interaction.replied || interaction.deferred) {
                    await interaction.followUp(reply);
                }
                else {
                    await interaction.reply(reply);
                }
            }
            catch {
                // Ignore reply failures
            }
        }
    });
    // ---------------------------------------------------------------------------
    // Guild events
    // ---------------------------------------------------------------------------
    client.on("guildCreate", (guild) => {
        onGuildJoin(guild, client).catch((err) => console.error("[discord] guildCreate error:", err));
    });
    // ---------------------------------------------------------------------------
    // Ready
    // ---------------------------------------------------------------------------
    client.once("ready", async (readyClient) => {
        console.log(`[discord] Logged in as ${readyClient.user.tag}`);
        // Initial registry load
        await (0, registry_js_1.refreshRegistry)();
        // Register registry refresh callback for role re-sync
        (0, registry_js_1.onRegistryRefresh)(async (prev, next) => {
            // Detect trust-level changes
            const changed = next.filter((ext) => {
                const prevExt = prev.find((p) => p.id === ext.id);
                return prevExt && prevExt.trust !== ext.trust;
            });
            if (changed.length > 0) {
                console.log(`[registry] Trust level changed for: ${changed.map((e) => e.id).join(", ")}`);
                // Re-sync roles in all guilds
                for (const guild of readyClient.guilds.cache.values()) {
                    await (0, roles_js_1.syncAllRoles)(guild.id, readyClient).catch((err) => console.error(`[roles] Sync error in ${guild.id}:`, err));
                }
            }
        });
        // Start background registry refresh loop
        (0, registry_js_1.startRegistryRefreshLoop)();
        // Sync owner roles across all guilds on startup
        for (const guild of readyClient.guilds.cache.values()) {
            await (0, roles_js_1.syncAllRoles)(guild.id, readyClient).catch((err) => console.error(`[roles] Startup sync error in ${guild.id}:`, err));
        }
        // Start release poller
        (0, poller_js_1.startPoller)(readyClient);
        console.log("[aetherbot] ✅ Ready");
    });
    // ---------------------------------------------------------------------------
    // Error handling
    // ---------------------------------------------------------------------------
    client.on("error", (err) => {
        console.error("[discord] Client error:", err.message);
    });
    process.on("unhandledRejection", (err) => {
        console.error("[aetherbot] Unhandled rejection:", err);
    });
    process.on("uncaughtException", (err) => {
        console.error("[aetherbot] Uncaught exception:", err);
        // Don't exit — let the process continue if possible
    });
    // Graceful shutdown
    const shutdown = async (signal) => {
        console.log(`[aetherbot] Received ${signal}, shutting down...`);
        client.destroy();
        process.exit(0);
    };
    process.once("SIGINT", () => shutdown("SIGINT"));
    process.once("SIGTERM", () => shutdown("SIGTERM"));
    // Login
    await client.login(config_js_1.config.discordToken);
}
main().catch((err) => {
    console.error("[aetherbot] Fatal startup error:", err);
    process.exit(1);
});
//# sourceMappingURL=index.js.map