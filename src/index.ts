// AetherBot — Entry Point
// Loads commands, registers slash commands, starts the poller and registry loop.

import {
  Client,
  GatewayIntentBits,
  Partials,
  REST,
  Routes,
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  Guild,
} from "discord.js";
import { config } from "./config.js";
import { startPoller } from "./services/poller.js";
import {
  refreshRegistry,
  onRegistryRefresh,
  startRegistryRefreshLoop,
} from "./services/registry.js";
import { syncAllRoles } from "./services/roles.js";
import type { Extension } from "./services/registry.js";

// ---------------------------------------------------------------------------
// Command loader
// ---------------------------------------------------------------------------

interface Command {
  data: SlashCommandBuilder | ReturnType<SlashCommandBuilder["addSubcommand"]>;
  execute: (interaction: ChatInputCommandInteraction) => Promise<void>;
}

async function loadCommands(): Promise<Map<string, Command>> {
  const map = new Map<string, Command>();

  const modules = [
    await import("./commands/announcements.js"),
    await import("./commands/registry.js"),
    await import("./commands/verify.js"),
    await import("./commands/admin.js"),
  ];

  for (const mod of modules) {
    for (const cmd of mod.commands as Command[]) {
      map.set(cmd.data.name, cmd);
    }
  }

  return map;
}

// ---------------------------------------------------------------------------
// Register slash commands with Discord
// ---------------------------------------------------------------------------

async function registerCommands(commands: Map<string, Command>): Promise<void> {
  const rest = new REST().setToken(config.discordToken);
  const bodies = [...commands.values()].map((c) => c.data.toJSON());

  try {
    console.log(`[discord] Registering ${bodies.length} application commands...`);
    await rest.put(
      Routes.applicationCommands(
        (await rest.get(Routes.currentApplication()) as { id: string }).id
      ),
      { body: bodies }
    );
    console.log("[discord] Commands registered globally.");
  } catch (err) {
    console.error("[discord] Failed to register commands:", err);
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Guild join / sync helpers
// ---------------------------------------------------------------------------

async function onGuildJoin(guild: Guild, client: Client): Promise<void> {
  console.log(`[discord] Joined guild: ${guild.name} (${guild.id})`);
  await syncAllRoles(guild.id, client);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log("[aetherbot] Starting up...");

  // Load commands
  const commands = await loadCommands();
  console.log(`[aetherbot] Loaded ${commands.size} commands`);

  // Register with Discord
  await registerCommands(commands);

  // Create Discord client (standard non-privileged intent)
  const client = new Client({
    intents: [GatewayIntentBits.Guilds],
  });

  // ---------------------------------------------------------------------------
  // Interaction handler
  // ---------------------------------------------------------------------------
  client.on("interactionCreate", async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    const cmd = commands.get(interaction.commandName);
    if (!cmd) return;

    try {
      await cmd.execute(interaction);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(
        `[discord] Error executing /${interaction.commandName}: ${msg}`
      );
      const reply = {
        content: "An unexpected error occurred. Please try again later.",
        ephemeral: true,
      };
      try {
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp(reply);
        } else {
          await interaction.reply(reply);
        }
      } catch {
        // Ignore reply failures
      }
    }
  });

  // ---------------------------------------------------------------------------
  // Guild events
  // ---------------------------------------------------------------------------
  client.on("guildCreate", (guild) => {
    onGuildJoin(guild, client).catch((err) =>
      console.error("[discord] guildCreate error:", err)
    );
  });

  // ---------------------------------------------------------------------------
  // Ready
  // ---------------------------------------------------------------------------
  client.once("ready", async (readyClient) => {
    console.log(`[discord] Logged in as ${readyClient.user.tag}`);

    // Initial registry load
    await refreshRegistry(readyClient);

    // Register registry refresh callback for role re-sync
    onRegistryRefresh(async (prev: Extension[], next: Extension[]) => {
      // Detect trust-level changes
      const changed = next.filter((ext) => {
        const prevExt = prev.find((p) => p.id === ext.id);
        return prevExt && prevExt.trust !== ext.trust;
      });

      if (changed.length > 0) {
        console.log(
          `[registry] Trust level changed for: ${changed.map((e) => e.id).join(", ")}`
        );
        // Re-sync roles in all guilds
        for (const guild of readyClient.guilds.cache.values()) {
          await syncAllRoles(guild.id, readyClient).catch((err) =>
            console.error(`[roles] Sync error in ${guild.id}:`, err)
          );
        }
      }
    });

    // Start background registry refresh loop
    startRegistryRefreshLoop(readyClient);

    // Sync owner roles across all guilds on startup
    for (const guild of readyClient.guilds.cache.values()) {
      await syncAllRoles(guild.id, readyClient).catch((err) =>
        console.error(`[roles] Startup sync error in ${guild.id}:`, err)
      );
    }

    // Start release poller
    startPoller(readyClient);

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
  const shutdown = async (signal: string) => {
    console.log(`[aetherbot] Received ${signal}, shutting down...`);
    client.destroy();
    process.exit(0);
  };
  process.once("SIGINT", () => shutdown("SIGINT"));
  process.once("SIGTERM", () => shutdown("SIGTERM"));

  // Login
  await client.login(config.discordToken);
}

main().catch((err) => {
  console.error("[aetherbot] Fatal startup error:", err);
  process.exit(1);
});
