// /extensions  — paginated list of all extensions
// /extension   — detail view for a single extension
// /registry    — registry health & status

import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  ButtonInteraction,
} from "discord.js";
import {
  getRegistry,
  getExtension,
  getRegistryStatus,
} from "../services/registry.js";
import {
  extensionEmbed,
  extensionsListEmbed,
  registryStatusEmbed,
  errorEmbed,
} from "../embeds.js";

const PAGE_SIZE = 8;

// ---------------------------------------------------------------------------
// /extensions
// ---------------------------------------------------------------------------

const extensionsCommand = new SlashCommandBuilder()
  .setName("extensions")
  .setDescription("Browse the Aether extension registry");

async function handleExtensions(
  interaction: ChatInputCommandInteraction
): Promise<void> {
  await interaction.deferReply();

  const registry = await getRegistry();
  if (registry.length === 0) {
    await interaction.editReply({
      embeds: [
        errorEmbed(
          "Registry Unavailable",
          "Could not load the extension registry. GitHub may be temporarily unavailable."
        ),
      ],
    });
    return;
  }

  const totalPages = Math.ceil(registry.length / PAGE_SIZE);
  let page = 1;

  const getPageEmbed = (p: number) => {
    const slice = registry.slice((p - 1) * PAGE_SIZE, p * PAGE_SIZE);
    return extensionsListEmbed(slice, p, totalPages);
  };

  const buildRow = (p: number) =>
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId("ext_prev")
        .setLabel("◀ Previous")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(p <= 1),
      new ButtonBuilder()
        .setCustomId("ext_next")
        .setLabel("Next ▶")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(p >= totalPages)
    );

  const msg = await interaction.editReply({
    embeds: [getPageEmbed(page)],
    components: totalPages > 1 ? [buildRow(page)] : [],
  });

  if (totalPages <= 1) return;

  const collector = msg.createMessageComponentCollector({
    componentType: ComponentType.Button,
    time: 120_000, // 2 minutes
    filter: (i: ButtonInteraction) => i.user.id === interaction.user.id,
  });

  collector.on("collect", async (btn: ButtonInteraction) => {
    if (btn.customId === "ext_prev") page = Math.max(1, page - 1);
    if (btn.customId === "ext_next") page = Math.min(totalPages, page + 1);
    await btn.update({
      embeds: [getPageEmbed(page)],
      components: [buildRow(page)],
    });
  });

  collector.on("end", async () => {
    await interaction
      .editReply({ components: [] })
      .catch(() => null);
  });
}

// ---------------------------------------------------------------------------
// /extension <id>
// ---------------------------------------------------------------------------

const extensionCommand = new SlashCommandBuilder()
  .setName("extension")
  .setDescription("Get details about a specific extension")
  .addStringOption((opt) =>
    opt
      .setName("id")
      .setDescription("The extension ID (e.g. modrinth, forge)")
      .setRequired(true)
  );

async function handleExtension(
  interaction: ChatInputCommandInteraction
): Promise<void> {
  await interaction.deferReply();

  const id = interaction.options.getString("id", true).toLowerCase().trim();

  // Make sure the registry is loaded
  await getRegistry();
  const ext = getExtension(id);

  if (!ext) {
    await interaction.editReply({
      embeds: [
        errorEmbed(
          "Extension Not Found",
          `No extension with ID \`${id}\` exists in the registry.\nUse \`/extensions\` to browse all available extensions.`
        ),
      ],
    });
    return;
  }

  await interaction.editReply({ embeds: [extensionEmbed(ext)] });
}

// ---------------------------------------------------------------------------
// /registry
// ---------------------------------------------------------------------------

const registryCommand = new SlashCommandBuilder()
  .setName("registry")
  .setDescription("View the Aether extension registry status");

async function handleRegistry(
  interaction: ChatInputCommandInteraction
): Promise<void> {
  await interaction.deferReply();

  // Trigger a refresh if needed
  await getRegistry();
  const status = getRegistryStatus();

  await interaction.editReply({ embeds: [registryStatusEmbed(status)] });
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export const commands = [
  { data: extensionsCommand,  execute: handleExtensions },
  { data: extensionCommand,   execute: handleExtension },
  { data: registryCommand,    execute: handleRegistry },
];
