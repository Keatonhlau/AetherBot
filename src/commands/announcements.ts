// /announce-channel add | remove | list
// /announce-now
// All require Manage Guild permission.

import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChatInputCommandInteraction,
  ChannelType,
} from "discord.js";
import { announceChannels } from "../db.js";
import { fetchLatestRelease, announceRelease } from "../services/poller.js";
import { successEmbed, errorEmbed, infoEmbed, releaseEmbed } from "../embeds.js";

// ---------------------------------------------------------------------------
// /announce-channel
// ---------------------------------------------------------------------------

const announceChannelCommand = new SlashCommandBuilder()
  .setName("announce-channel")
  .setDescription("Manage release announcement channels for this server")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addSubcommand((sub) =>
    sub
      .setName("add")
      .setDescription("Add a channel to receive Aether release announcements")
      .addChannelOption((opt) =>
        opt
          .setName("channel")
          .setDescription("The channel to add")
          .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
          .setRequired(true)
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName("remove")
      .setDescription("Remove a channel from release announcements")
      .addChannelOption((opt) =>
        opt
          .setName("channel")
          .setDescription("The channel to remove")
          .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
          .setRequired(true)
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName("list")
      .setDescription("List all configured announcement channels")
  );

async function handleAnnounceChannel(
  interaction: ChatInputCommandInteraction
): Promise<void> {
  await interaction.deferReply({ ephemeral: true });

  const guildId = interaction.guildId;
  if (!guildId) {
    await interaction.editReply({
      embeds: [errorEmbed("Server Only", "This command can only be used in a server.")],
    });
    return;
  }

  const sub = interaction.options.getSubcommand();

  if (sub === "add") {
    const channel = interaction.options.getChannel("channel", true);
    announceChannels.add(guildId, channel.id);
    await interaction.editReply({
      embeds: [
        successEmbed(
          "Channel Added",
          `<#${channel.id}> will now receive Aether release announcements.`
        ),
      ],
    });
    return;
  }

  if (sub === "remove") {
    const channel = interaction.options.getChannel("channel", true);
    announceChannels.remove(guildId, channel.id);
    await interaction.editReply({
      embeds: [
        successEmbed(
          "Channel Removed",
          `<#${channel.id}> has been removed from announcement channels.`
        ),
      ],
    });
    return;
  }

  if (sub === "list") {
    const channels = announceChannels.list(guildId);
    if (channels.length === 0) {
      await interaction.editReply({
        embeds: [
          infoEmbed(
            "No Channels Configured",
            "Use `/announce-channel add` to configure announcement channels."
          ),
        ],
      });
      return;
    }
    const list = channels.map((id) => `<#${id}>`).join("\n");
    await interaction.editReply({
      embeds: [
        infoEmbed(
          "Announcement Channels",
          `The following channels will receive release announcements:\n\n${list}`
        ),
      ],
    });
    return;
  }
}

// ---------------------------------------------------------------------------
// /announce-now
// ---------------------------------------------------------------------------

const announceNowCommand = new SlashCommandBuilder()
  .setName("announce-now")
  .setDescription("Immediately post the latest Aether release (admin only)")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild);

async function handleAnnounceNow(
  interaction: ChatInputCommandInteraction
): Promise<void> {
  await interaction.deferReply({ ephemeral: true });

  const guildId = interaction.guildId;
  if (!guildId) {
    await interaction.editReply({
      embeds: [errorEmbed("Server Only", "This command can only be used in a server.")],
    });
    return;
  }

  const channels = announceChannels.list(guildId);
  if (channels.length === 0) {
    await interaction.editReply({
      embeds: [
        errorEmbed(
          "No Channels Configured",
          "Use `/announce-channel add` to set up announcement channels first."
        ),
      ],
    });
    return;
  }

  const release = await fetchLatestRelease();
  if (!release) {
    await interaction.editReply({
      embeds: [
        errorEmbed(
          "GitHub Unavailable",
          "Could not fetch the latest release. GitHub may be unavailable."
        ),
      ],
    });
    return;
  }

  // Post to channels in this guild only (don't mark as announced globally)
  let sent = 0;
  let failReason: string | null = null;

  for (const channelId of channels) {
    try {
      const channel = await interaction.client.channels
        .fetch(channelId)
        .catch(() => null);
      if (!channel || !channel.isTextBased()) {
        failReason = `Channel <#${channelId}> not found or not text-based.`;
        continue;
      }
      if ("send" in channel && typeof channel.send === "function") {
        await channel.send({
          embeds: [releaseEmbed(release)],
        });
        sent++;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[announce-now] Failed to send to ${channelId}:`, err);
      failReason = msg;
    }
  }

  if (sent > 0) {
    await interaction.editReply({
      embeds: [
        successEmbed(
          "Release Posted",
          `Posted **${release.name || release.tag_name}** to ${sent} channel(s).`
        ),
      ],
    });
  } else {
    await interaction.editReply({
      embeds: [
        errorEmbed(
          "Announcement Failed",
          `Could not send announcement to configured channel(s).\n\n**Reason:** ${failReason ?? "Bot lacks permission."}\n\nMake sure the bot role has **View Channel**, **Send Messages**, and **Embed Links** permissions in the announcement channel.`
        ),
      ],
    });
  }
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export const commands = [
  {
    data: announceChannelCommand,
    execute: handleAnnounceChannel,
  },
  {
    data: announceNowCommand,
    execute: handleAnnounceNow,
  },
];
