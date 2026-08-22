import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ChatInputCommandInteraction, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { infoEmbed } from "../embeds";

const configCommand = new SlashCommandBuilder()
  .setName("tickets")
  .setDescription("Sends the ticket message")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
export default function handleCommand(
  interaction: ChatInputCommandInteraction
) {
  const channel = interaction.channel
  if (!channel) return interaction.reply("Channel is not valid!")
  if (!channel.isSendable()) return interaction.reply("Channel is not sendable!")
  const button = new ButtonBuilder()
    .setCustomId("tickets")
    .setStyle(ButtonStyle.Primary)
    .setLabel("Create Ticket")
  const actionrow = new ActionRowBuilder<ButtonBuilder>()
    .setComponents(button)
  channel.send({ components: [actionrow], embeds: [infoEmbed("Tickets", "Need help? Click the button below to open a support ticket and talk to staff.")] })
}

export const commands = [{ data: configCommand, execute: handleCommand }];
