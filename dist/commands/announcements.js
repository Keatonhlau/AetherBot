"use strict";
// /announce-channel add | remove | list
// /announce-now
// All require Manage Guild permission.
Object.defineProperty(exports, "__esModule", { value: true });
exports.commands = void 0;
const discord_js_1 = require("discord.js");
const db_js_1 = require("../db.js");
const poller_js_1 = require("../services/poller.js");
const embeds_js_1 = require("../embeds.js");
// ---------------------------------------------------------------------------
// /announce-channel
// ---------------------------------------------------------------------------
const announceChannelCommand = new discord_js_1.SlashCommandBuilder()
    .setName("announce-channel")
    .setDescription("Manage release announcement channels for this server")
    .setDefaultMemberPermissions(discord_js_1.PermissionFlagsBits.ManageGuild)
    .addSubcommand((sub) => sub
    .setName("add")
    .setDescription("Add a channel to receive Aether release announcements")
    .addChannelOption((opt) => opt
    .setName("channel")
    .setDescription("The channel to add")
    .addChannelTypes(discord_js_1.ChannelType.GuildText)
    .setRequired(true)))
    .addSubcommand((sub) => sub
    .setName("remove")
    .setDescription("Remove a channel from release announcements")
    .addChannelOption((opt) => opt
    .setName("channel")
    .setDescription("The channel to remove")
    .addChannelTypes(discord_js_1.ChannelType.GuildText)
    .setRequired(true)))
    .addSubcommand((sub) => sub
    .setName("list")
    .setDescription("List all configured announcement channels"));
async function handleAnnounceChannel(interaction) {
    await interaction.deferReply({ ephemeral: true });
    const guildId = interaction.guildId;
    if (!guildId) {
        await interaction.editReply({
            embeds: [(0, embeds_js_1.errorEmbed)("Server Only", "This command can only be used in a server.")],
        });
        return;
    }
    const sub = interaction.options.getSubcommand();
    if (sub === "add") {
        const channel = interaction.options.getChannel("channel", true);
        db_js_1.announceChannels.add(guildId, channel.id);
        await interaction.editReply({
            embeds: [
                (0, embeds_js_1.successEmbed)("Channel Added", `<#${channel.id}> will now receive Aether release announcements.`),
            ],
        });
        return;
    }
    if (sub === "remove") {
        const channel = interaction.options.getChannel("channel", true);
        db_js_1.announceChannels.remove(guildId, channel.id);
        await interaction.editReply({
            embeds: [
                (0, embeds_js_1.successEmbed)("Channel Removed", `<#${channel.id}> has been removed from announcement channels.`),
            ],
        });
        return;
    }
    if (sub === "list") {
        const channels = db_js_1.announceChannels.list(guildId);
        if (channels.length === 0) {
            await interaction.editReply({
                embeds: [
                    (0, embeds_js_1.infoEmbed)("No Channels Configured", "Use `/announce-channel add` to configure announcement channels."),
                ],
            });
            return;
        }
        const list = channels.map((id) => `<#${id}>`).join("\n");
        await interaction.editReply({
            embeds: [
                (0, embeds_js_1.infoEmbed)("Announcement Channels", `The following channels will receive release announcements:\n\n${list}`),
            ],
        });
        return;
    }
}
// ---------------------------------------------------------------------------
// /announce-now
// ---------------------------------------------------------------------------
const announceNowCommand = new discord_js_1.SlashCommandBuilder()
    .setName("announce-now")
    .setDescription("Immediately post the latest Aether release (admin only)")
    .setDefaultMemberPermissions(discord_js_1.PermissionFlagsBits.ManageGuild);
async function handleAnnounceNow(interaction) {
    await interaction.deferReply({ ephemeral: true });
    const guildId = interaction.guildId;
    if (!guildId) {
        await interaction.editReply({
            embeds: [(0, embeds_js_1.errorEmbed)("Server Only", "This command can only be used in a server.")],
        });
        return;
    }
    const channels = db_js_1.announceChannels.list(guildId);
    if (channels.length === 0) {
        await interaction.editReply({
            embeds: [
                (0, embeds_js_1.errorEmbed)("No Channels Configured", "Use `/announce-channel add` to set up announcement channels first."),
            ],
        });
        return;
    }
    const release = await (0, poller_js_1.fetchLatestRelease)();
    if (!release) {
        await interaction.editReply({
            embeds: [
                (0, embeds_js_1.errorEmbed)("GitHub Unavailable", "Could not fetch the latest release. GitHub may be unavailable."),
            ],
        });
        return;
    }
    // Post to channels in this guild only (don't mark as announced globally)
    let sent = 0;
    for (const channelId of channels) {
        try {
            const channel = await interaction.client.channels
                .fetch(channelId)
                .catch(() => null);
            if (!channel || !("send" in channel))
                continue;
            await channel.send({
                embeds: [
                    (0, embeds_js_1.releaseEmbed)(release),
                ],
            });
            sent++;
        }
        catch (err) {
            console.error(`[announce-now] Failed to send to ${channelId}:`, err);
        }
    }
    await interaction.editReply({
        embeds: [
            (0, embeds_js_1.successEmbed)("Release Posted", `Posted **${release.name || release.tag_name}** to ${sent} channel(s).`),
        ],
    });
}
// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------
exports.commands = [
    {
        data: announceChannelCommand,
        execute: handleAnnounceChannel,
    },
    {
        data: announceNowCommand,
        execute: handleAnnounceNow,
    },
];
//# sourceMappingURL=announcements.js.map