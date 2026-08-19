// /link-github   — link a Discord account to a GitHub username
// /verify        — initiate or complete extension ownership verification
// /verify-status — show current verification state
// /unlink        — remove GitHub link and invalidate tokens

import { SlashCommandBuilder, ChatInputCommandInteraction, GuildMember } from "discord.js";
import { GitHubClient } from "../services/github.js";
import {
  initiateVerification,
  completeVerification,
} from "../services/verifier.js";
import { getRegistry, getExtension } from "../services/registry.js";
import { assignRoles } from "../services/roles.js";
import {
  githubLinks,
  verificationTokens,
  verifiedExtensions,
  guildSettings,
} from "../db.js";
import { config } from "../config.js";
import {
  successEmbed,
  errorEmbed,
  verifyStatusEmbed,
  verifyInitEmbed,
  infoEmbed,
} from "../embeds.js";

// ---------------------------------------------------------------------------
// /link-github <username>
// ---------------------------------------------------------------------------

const linkGithubCommand = new SlashCommandBuilder()
  .setName("link-github")
  .setDescription("Link your Discord account to a GitHub username")
  .addStringOption((opt) =>
    opt
      .setName("username")
      .setDescription("Your GitHub username")
      .setRequired(true)
  );

async function handleLinkGithub(
  interaction: ChatInputCommandInteraction
): Promise<void> {
  await interaction.deferReply({ ephemeral: true });

  const username = interaction.options.getString("username", true).trim();

  // Validate the GitHub account exists
  const gh = new GitHubClient(config.githubToken);
  const userResult = await gh.getUser(username);

  if (!userResult.ok) {
    if (userResult.status === 404) {
      await interaction.editReply({
        embeds: [
          errorEmbed(
            "GitHub User Not Found",
            `No GitHub account found for \`${username}\`. Check the spelling and try again.`
          ),
        ],
      });
    } else {
      await interaction.editReply({
        embeds: [
          errorEmbed(
            "GitHub Unavailable",
            "Could not verify the GitHub account. GitHub may be temporarily unavailable. Try again later."
          ),
        ],
      });
    }
    return;
  }

  const ghUser = userResult.data;
  githubLinks.upsert(interaction.user.id, ghUser.login);

  await interaction.editReply({
    embeds: [
      successEmbed(
        "GitHub Account Linked",
        [
          `Your Discord account is now linked to **[@${ghUser.login}](${ghUser.html_url})**.`,
          "",
          "You can now use `/verify <extension-id>` to verify ownership of your extensions.",
        ].join("\n")
      ),
    ],
  });
}

// ---------------------------------------------------------------------------
// /verify <extension-id>
// ---------------------------------------------------------------------------

const verifyCommand = new SlashCommandBuilder()
  .setName("verify")
  .setDescription("Verify ownership of an Aether extension")
  .addStringOption((opt) =>
    opt
      .setName("extension-id")
      .setDescription("The extension ID (e.g. my-extension)")
      .setRequired(true)
  );

async function handleVerify(
  interaction: ChatInputCommandInteraction
): Promise<void> {
  await interaction.deferReply({ ephemeral: true });

  const extensionId = interaction.options
    .getString("extension-id", true)
    .toLowerCase()
    .trim();

  const userId = interaction.user.id;
  const guildId = interaction.guildId;

  // Make sure the registry is loaded
  await getRegistry();

  // Check for an active token — if one exists, try to complete verification
  const existing = verificationTokens.getActive(userId, extensionId);
  const hasActiveToken =
    existing && existing.expires_at > Date.now() && existing.failed_attempts < 3;

  if (hasActiveToken && interaction.guild) {
    // Attempt to complete verification
    const member = interaction.member as GuildMember;
    const result = await completeVerification(
      userId,
      extensionId,
      member,
      interaction.client
    );

    if (result.ok) {
      await interaction.editReply({
        embeds: [
          successEmbed(
            "Extension Verified!",
            [
              `✅ You've successfully verified ownership of \`${extensionId}\`.`,
              result.roleGranted
                ? "\n🎉 Developer role(s) have been granted."
                : "\n_(No roles were configured for this server.)_",
            ].join("\n")
          ),
        ],
      });
    } else {
      await interaction.editReply({
        embeds: [errorEmbed("Verification Failed", result.reason)],
      });
    }
    return;
  }

  // No active token — initiate a new verification
  const initResult = await initiateVerification(userId, extensionId);

  if (!initResult.ok) {
    await interaction.editReply({
      embeds: [errorEmbed("Cannot Start Verification", initResult.reason)],
    });
    return;
  }

  // Show the token exactly once (ephemeral reply)
  await interaction.editReply({
    embeds: [
      verifyInitEmbed(
        initResult.token,
        extensionId,
        initResult.repoUrl,
        initResult.expiresAt
      ),
    ],
  });
}

// ---------------------------------------------------------------------------
// /verify-status
// ---------------------------------------------------------------------------

const verifyStatusCommand = new SlashCommandBuilder()
  .setName("verify-status")
  .setDescription("View your GitHub link and verification status");

async function handleVerifyStatus(
  interaction: ChatInputCommandInteraction
): Promise<void> {
  await interaction.deferReply({ ephemeral: true });

  const userId = interaction.user.id;
  const guildId = interaction.guildId;

  // Make sure registry is fresh
  await getRegistry();

  const link = githubLinks.get(userId);
  const userExts = verifiedExtensions.getForUser(userId);
  const pending = verificationTokens.getAnyPending(userId);

  // Resolve extension names + trust from registry
  const extDetails = userExts.map((ve) => {
    const ext = getExtension(ve.extension_id);
    return {
      id: ve.extension_id,
      name: ext?.name ?? ve.extension_id,
      trust: ext?.trust ?? "community",
    };
  });

  // Check roles
  let hasDeveloperRole = false;
  let hasVerifiedRole = false;

  if (interaction.guild && guildId) {
    try {
      const member = await interaction.guild.members.fetch(userId);
      const settings = guildSettings.get(guildId);
      const guildCfg = config.guilds[guildId];
      const devRoleId =
        settings?.extension_developer_role_id ?? guildCfg?.extensionDeveloperRoleId;
      const verifiedRoleId =
        settings?.verified_developer_role_id ?? guildCfg?.verifiedDeveloperRoleId;

      if (devRoleId) hasDeveloperRole = member.roles.cache.has(devRoleId);
      if (verifiedRoleId) hasVerifiedRole = member.roles.cache.has(verifiedRoleId);
    } catch {
      // Non-critical — just leave as false
    }
  }

  await interaction.editReply({
    embeds: [
      verifyStatusEmbed({
        githubUsername: link?.github_username ?? null,
        verifiedExtensions: extDetails,
        hasDeveloperRole,
        hasVerifiedRole,
        pendingToken: pending
          ? { extensionId: pending.extension_id, expiresAt: pending.expires_at }
          : null,
      }),
    ],
  });
}

// ---------------------------------------------------------------------------
// /unlink
// ---------------------------------------------------------------------------

const unlinkCommand = new SlashCommandBuilder()
  .setName("unlink")
  .setDescription("Remove your linked GitHub account and invalidate pending verifications");

async function handleUnlink(
  interaction: ChatInputCommandInteraction
): Promise<void> {
  await interaction.deferReply({ ephemeral: true });

  const userId = interaction.user.id;

  const link = githubLinks.get(userId);
  if (!link) {
    await interaction.editReply({
      embeds: [infoEmbed("Not Linked", "You don't have a GitHub account linked.")],
    });
    return;
  }

  // Remove everything
  githubLinks.delete(userId);
  verificationTokens.deleteAllForUser(userId);
  verifiedExtensions.deleteAllForUser(userId);

  // Re-evaluate roles (will remove if they no longer qualify)
  if (interaction.guild) {
    try {
      const member = await interaction.guild.members.fetch(userId);
      await assignRoles(member, interaction.client);
    } catch {
      // Non-critical
    }
  }

  await interaction.editReply({
    embeds: [
      successEmbed(
        "Account Unlinked",
        [
          `GitHub account **@${link.github_username}** has been unlinked.`,
          "All pending verification tokens and verified extension records have been removed.",
          "Aether-managed roles have been re-evaluated.",
        ].join("\n")
      ),
    ],
  });
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export const commands = [
  { data: linkGithubCommand,    execute: handleLinkGithub },
  { data: verifyCommand,        execute: handleVerify },
  { data: verifyStatusCommand,  execute: handleVerifyStatus },
  { data: unlinkCommand,        execute: handleUnlink },
];
