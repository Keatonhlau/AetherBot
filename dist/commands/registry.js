"use strict";
// /extensions  — paginated list of all extensions
// /extension   — detail view for a single extension
// /registry    — registry health & status
Object.defineProperty(exports, "__esModule", { value: true });
exports.commands = void 0;
const discord_js_1 = require("discord.js");
const registry_js_1 = require("../services/registry.js");
const embeds_js_1 = require("../embeds.js");
const PAGE_SIZE = 8;
// ---------------------------------------------------------------------------
// /extensions
// ---------------------------------------------------------------------------
const extensionsCommand = new discord_js_1.SlashCommandBuilder()
    .setName("extensions")
    .setDescription("Browse the Aether extension registry");
async function handleExtensions(interaction) {
    await interaction.deferReply();
    const registry = await (0, registry_js_1.getRegistry)();
    if (registry.length === 0) {
        await interaction.editReply({
            embeds: [
                (0, embeds_js_1.errorEmbed)("Registry Unavailable", "Could not load the extension registry. GitHub may be temporarily unavailable."),
            ],
        });
        return;
    }
    const totalPages = Math.ceil(registry.length / PAGE_SIZE);
    let page = 1;
    const getPageEmbed = (p) => {
        const slice = registry.slice((p - 1) * PAGE_SIZE, p * PAGE_SIZE);
        return (0, embeds_js_1.extensionsListEmbed)(slice, p, totalPages);
    };
    const buildRow = (p) => new discord_js_1.ActionRowBuilder().addComponents(new discord_js_1.ButtonBuilder()
        .setCustomId("ext_prev")
        .setLabel("◀ Previous")
        .setStyle(discord_js_1.ButtonStyle.Secondary)
        .setDisabled(p <= 1), new discord_js_1.ButtonBuilder()
        .setCustomId("ext_next")
        .setLabel("Next ▶")
        .setStyle(discord_js_1.ButtonStyle.Secondary)
        .setDisabled(p >= totalPages));
    const msg = await interaction.editReply({
        embeds: [getPageEmbed(page)],
        components: totalPages > 1 ? [buildRow(page)] : [],
    });
    if (totalPages <= 1)
        return;
    const collector = msg.createMessageComponentCollector({
        componentType: discord_js_1.ComponentType.Button,
        time: 120_000, // 2 minutes
        filter: (i) => i.user.id === interaction.user.id,
    });
    collector.on("collect", async (btn) => {
        if (btn.customId === "ext_prev")
            page = Math.max(1, page - 1);
        if (btn.customId === "ext_next")
            page = Math.min(totalPages, page + 1);
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
const extensionCommand = new discord_js_1.SlashCommandBuilder()
    .setName("extension")
    .setDescription("Get details about a specific extension")
    .addStringOption((opt) => opt
    .setName("id")
    .setDescription("The extension ID (e.g. modrinth, forge)")
    .setRequired(true));
async function handleExtension(interaction) {
    await interaction.deferReply();
    const id = interaction.options.getString("id", true).toLowerCase().trim();
    // Make sure the registry is loaded
    await (0, registry_js_1.getRegistry)();
    const ext = (0, registry_js_1.getExtension)(id);
    if (!ext) {
        await interaction.editReply({
            embeds: [
                (0, embeds_js_1.errorEmbed)("Extension Not Found", `No extension with ID \`${id}\` exists in the registry.\nUse \`/extensions\` to browse all available extensions.`),
            ],
        });
        return;
    }
    await interaction.editReply({ embeds: [(0, embeds_js_1.extensionEmbed)(ext)] });
}
// ---------------------------------------------------------------------------
// /registry
// ---------------------------------------------------------------------------
const registryCommand = new discord_js_1.SlashCommandBuilder()
    .setName("registry")
    .setDescription("View the Aether extension registry status");
async function handleRegistry(interaction) {
    await interaction.deferReply();
    // Trigger a refresh if needed
    await (0, registry_js_1.getRegistry)();
    const status = (0, registry_js_1.getRegistryStatus)();
    await interaction.editReply({ embeds: [(0, embeds_js_1.registryStatusEmbed)(status)] });
}
// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------
exports.commands = [
    { data: extensionsCommand, execute: handleExtensions },
    { data: extensionCommand, execute: handleExtension },
    { data: registryCommand, execute: handleRegistry },
];
//# sourceMappingURL=registry.js.map