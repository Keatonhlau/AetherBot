// /config — admin-only guild configuration command
// Manages roles, poll interval, and other guild-specific settings.

import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChatInputCommandInteraction,
} from "discord.js";
import { guildSettings } from "../db.js";
import { syncAllRoles } from "../services/roles.js";
import { successEmbed, errorEmbed, infoEmbed } from "../embeds.js";

const configCommand = new SlashCommandBuilder()
  .setName("config")
  .setDescription("Configure AetherBot for this server (admin only)")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addSubcommand((sub) =>
    sub
      .setName("set-dev-role")
      .setDescription("Set the Extension Developer role")
      .addRoleOption((opt) =>
        opt
          .setName("role")
          .setDescription("The role to assign to verified extension developers")
          .setRequired(true)
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName("set-verified-role")
      .setDescription("Set the Verified Extension Developer role")
      .addRoleOption((opt) =>
        opt
          .setName("role")
          .setDescription(
            "The role to assign to developers of verified/official extensions"
          )
          .setRequired(true)
      )
  )
  .addSubcommand((sub) =>
    sub.setName("show").setDescription("Show the current bot configuration")
  )
  .addSubcommand((sub) =>
    sub
      .setName("sync-roles")
      .setDescription(
        "Re-evaluate and sync all Aether-managed roles in this server"
      )
  );

async function handleConfig(
  interaction: ChatInputCommandInteraction
): Promise<void> {
  await interaction.deferReply({ ephemeral: true });

  const guildId = interaction.guildId;
  if (!guildId || !interaction.guild) {
    await interaction.editReply({
      embeds: [errorEmbed("Server Only", "This command can only be used in a server.")],
    });
    return;
  }

  const sub = interaction.options.getSubcommand();

  // ------------------------------------------------------------------
  // set-dev-role
  // ------------------------------------------------------------------
  if (sub === "set-dev-role") {
    const role = interaction.options.getRole("role", true);

    // Validate the bot can assign this role
    const botMember = await interaction.guild.members.fetchMe();
    const botHighest = botMember.roles.highest.position;
    const rolePosition =
      interaction.guild.roles.cache.get(role.id)?.position ?? 0;

    if (rolePosition >= botHighest) {
      await interaction.editReply({
        embeds: [
          errorEmbed(
            "Role Hierarchy Error",
            `The bot's role must be positioned **above** <@&${role.id}> in Server Settings → Roles. Currently the bot cannot manage this role.`
          ),
        ],
      });
      return;
    }

    guildSettings.setExtensionDevRole(guildId, role.id);
    await interaction.editReply({
      embeds: [
        successEmbed(
          "Extension Developer Role Set",
          `<@&${role.id}> will be granted to verified extension developers.`
        ),
      ],
    });
    return;
  }

  // ------------------------------------------------------------------
  // set-verified-role
  // ------------------------------------------------------------------
  if (sub === "set-verified-role") {
    const role = interaction.options.getRole("role", true);

    const botMember = await interaction.guild.members.fetchMe();
    const botHighest = botMember.roles.highest.position;
    const rolePosition =
      interaction.guild.roles.cache.get(role.id)?.position ?? 0;

    if (rolePosition >= botHighest) {
      await interaction.editReply({
        embeds: [
          errorEmbed(
            "Role Hierarchy Error",
            `The bot's role must be positioned **above** <@&${role.id}> in Server Settings → Roles.`
          ),
        ],
      });
      return;
    }

    guildSettings.setVerifiedDevRole(guildId, role.id);
    await interaction.editReply({
      embeds: [
        successEmbed(
          "Verified Developer Role Set",
          `<@&${role.id}> will be granted to developers of verified/official extensions.`
        ),
      ],
    });
    return;
  }

  // ------------------------------------------------------------------
  // show
  // ------------------------------------------------------------------
  if (sub === "show") {
    const settings = guildSettings.get(guildId);

    const devRole = settings?.extension_developer_role_id
      ? `<@&${settings.extension_developer_role_id}>`
      : "❌ Not configured";
    const verifiedRole = settings?.verified_developer_role_id
      ? `<@&${settings.verified_developer_role_id}>`
      : "❌ Not configured";

    await interaction.editReply({
      embeds: [
        infoEmbed(
          "AetherBot Configuration",
          [
            `**Extension Developer Role:** ${devRole}`,
            `**Verified Developer Role:** ${verifiedRole}`,
            "",
            "Use `/announce-channel list` to see configured announcement channels.",
          ].join("\n")
        ),
      ],
    });
    return;
  }

  // ------------------------------------------------------------------
  // sync-roles
  // ------------------------------------------------------------------
  if (sub === "sync-roles") {
    await interaction.editReply({
      embeds: [infoEmbed("Syncing Roles", "Re-evaluating all Aether-managed roles...")],
    });

    try {
      await syncAllRoles(guildId, interaction.client);
      await interaction.editReply({
        embeds: [
          successEmbed(
            "Roles Synced",
            "All Aether-managed roles have been re-evaluated and updated."
          ),
        ],
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await interaction.editReply({
        embeds: [errorEmbed("Sync Failed", `An error occurred: ${msg}`)],
      });
    }
    return;
  }
}

export const commands = [{ data: configCommand, execute: handleConfig }];
