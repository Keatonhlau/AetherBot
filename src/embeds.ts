import {
  EmbedBuilder,
  ColorResolvable,
  APIEmbedField,
} from "discord.js";
import type { Extension } from "./services/registry.js";
import type { GitHubRelease } from "./services/github.js";

// ---------------------------------------------------------------------------
// Aether colour palette (dark, accent cyan-blue)
// ---------------------------------------------------------------------------
const COLOR_PRIMARY: ColorResolvable = 0x5b8dee;   // Aether blue
const COLOR_SUCCESS: ColorResolvable = 0x57d99a;   // green
const COLOR_WARNING: ColorResolvable = 0xf0b429;   // amber
const COLOR_ERROR: ColorResolvable = 0xe05c5c;     // red
const COLOR_NEUTRAL: ColorResolvable = 0x2f3136;   // dark grey
const COLOR_VERIFIED: ColorResolvable = 0x57d99a;  // same as success

const FOOTER_TEXT = "AetherBot • Aether Extension Ecosystem";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function base(): EmbedBuilder {
  return new EmbedBuilder().setFooter({ text: FOOTER_TEXT }).setTimestamp();
}

function trustBadge(trust: string): string {
  switch (trust) {
    case "official":  return "🔵 Official";
    case "verified":  return "✅ Verified";
    case "community": return "👤 Community";
    default:          return "❓ Unknown";
  }
}

function trustColor(trust: string): ColorResolvable {
  switch (trust) {
    case "official":  return COLOR_PRIMARY;
    case "verified":  return COLOR_VERIFIED;
    case "community": return COLOR_WARNING;
    default:          return COLOR_NEUTRAL;
  }
}

function releaseBadge(prerelease: boolean): string {
  return prerelease ? "🧪 Prerelease" : "✅ Stable";
}

function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max - 1) + "…" : text;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

// ---------------------------------------------------------------------------
// Release embed
// ---------------------------------------------------------------------------

export function releaseEmbed(release: GitHubRelease): EmbedBuilder {
  const fields: APIEmbedField[] = [
    {
      name: "Status",
      value: releaseBadge(release.prerelease),
      inline: true,
    },
    {
      name: "Tag",
      value: `\`${release.tag_name}\``,
      inline: true,
    },
    {
      name: "Published",
      value: formatDate(release.published_at),
      inline: true,
    },
  ];

  if (release.assets && release.assets.length > 0) {
    const assetLines = release.assets
      .slice(0, 8)
      .map(
        (a) =>
          `• [${a.name}](${a.browser_download_url}) — ${(a.size / 1_048_576).toFixed(1)} MB`
      )
      .join("\n");
    fields.push({
      name: `📦 Assets (${release.assets.length})`,
      value: truncate(assetLines, 1024),
      inline: false,
    });
  }

  const body = release.body
    ? truncate(release.body, 3800)
    : "_No release notes provided._";

  return base()
    .setColor(release.prerelease ? COLOR_WARNING : COLOR_PRIMARY)
    .setTitle(
      `${release.prerelease ? "🧪" : "🚀"} ${release.name || release.tag_name}`
    )
    .setURL(release.html_url)
    .setDescription(body)
    .addFields(fields)
    .setAuthor({ name: "Aether Release" });
}

// ---------------------------------------------------------------------------
// Extension detail embed
// ---------------------------------------------------------------------------

export function extensionEmbed(ext: Extension): EmbedBuilder {
  const fields: APIEmbedField[] = [
    { name: "ID",     value: `\`${ext.id}\``,          inline: true },
    { name: "Author", value: ext.author,                inline: true },
    { name: "Trust",  value: trustBadge(ext.trust),     inline: true },
  ];

  if (ext.version) {
    fields.push({ name: "Version", value: `\`${ext.version}\``, inline: true });
  }
  if (ext.repository) {
    fields.push({ name: "Repository", value: ext.repository, inline: false });
  }
  if (ext.install_url ?? ext.url) {
    fields.push({
      name: "Install URL",
      value: ext.install_url ?? ext.url ?? "",
      inline: false,
    });
  }

  return base()
    .setColor(trustColor(ext.trust))
    .setTitle(ext.name)
    .setDescription(ext.description ?? "_No description provided._")
    .addFields(fields);
}

// ---------------------------------------------------------------------------
// New extension announcement embed
// ---------------------------------------------------------------------------

export function newExtensionEmbed(ext: Extension): EmbedBuilder {
  const fields: APIEmbedField[] = [
    { name: "Extension ID", value: `\`${ext.id}\``, inline: true },
    { name: "Author",       value: ext.author,        inline: true },
    { name: "Trust Tier",   value: trustBadge(ext.trust), inline: true },
  ];

  if (ext.version) {
    fields.push({ name: "Version", value: `\`${ext.version}\``, inline: true });
  }
  if (ext.repository) {
    fields.push({ name: "Repository", value: ext.repository, inline: false });
  }
  if (ext.install_url ?? ext.url) {
    fields.push({
      name: "Install URL",
      value: ext.install_url ?? ext.url ?? "",
      inline: false,
    });
  }

  return base()
    .setColor(trustColor(ext.trust))
    .setTitle(`🔌 New Extension Released: ${ext.name}`)
    .setDescription(ext.description ?? "_No description provided._")
    .addFields(fields)
    .setAuthor({ name: "Aether Extension Registry" });
}

// ---------------------------------------------------------------------------
// Extensions list embed (paginated)
// ---------------------------------------------------------------------------

export function extensionsListEmbed(
  exts: Extension[],
  page: number,
  totalPages: number
): EmbedBuilder {
  const lines = exts.map((e) => {
    const badge = trustBadge(e.trust);
    const desc = e.description ? ` — ${truncate(e.description, 60)}` : "";
    return `${badge} **${e.name}** \`${e.id}\`${desc}`;
  });

  return base()
    .setColor(COLOR_PRIMARY)
    .setTitle("🔌 Aether Extension Registry")
    .setDescription(lines.join("\n") || "_No extensions found._")
    .setFooter({ text: `Page ${page} of ${totalPages} • ${FOOTER_TEXT}` });
}

// ---------------------------------------------------------------------------
// Registry status embed
// ---------------------------------------------------------------------------

export interface RegistryStatus {
  count: number;
  cacheAgeMs: number;
  lastRefresh: number | null;
  healthy: boolean;
  stale: boolean;
}

export function registryStatusEmbed(status: RegistryStatus): EmbedBuilder {
  const ageSeconds = Math.floor(status.cacheAgeMs / 1000);
  const ageLabel =
    ageSeconds < 60
      ? `${ageSeconds}s`
      : `${Math.floor(ageSeconds / 60)}m ${ageSeconds % 60}s`;

  const lastLabel = status.lastRefresh
    ? new Date(status.lastRefresh).toUTCString()
    : "Never";

  const statusLine = status.healthy
    ? "✅ GitHub reachable"
    : "⚠️ GitHub unreachable (serving cached data)";

  return base()
    .setColor(status.healthy ? COLOR_SUCCESS : COLOR_WARNING)
    .setTitle("📋 Extension Registry Status")
    .addFields(
      { name: "Extensions",    value: String(status.count),   inline: true },
      { name: "Cache Age",     value: ageLabel,                inline: true },
      { name: "GitHub",        value: statusLine,              inline: false },
      { name: "Last Refresh",  value: lastLabel,               inline: false },
      {
        name: "Stale",
        value: status.stale ? "⚠️ Yes — cache is older than 10 minutes" : "✅ No",
        inline: false,
      }
    );
}

// ---------------------------------------------------------------------------
// Verification status embed
// ---------------------------------------------------------------------------

export interface VerifyStatusData {
  githubUsername: string | null;
  verifiedExtensions: Array<{ id: string; name: string; trust: string }>;
  hasDeveloperRole: boolean;
  hasVerifiedRole: boolean;
  pendingToken: { extensionId: string; expiresAt: number } | null;
}

export function verifyStatusEmbed(data: VerifyStatusData): EmbedBuilder {
  const fields: APIEmbedField[] = [];

  fields.push({
    name: "GitHub Account",
    value: data.githubUsername
      ? `[@${data.githubUsername}](https://github.com/${data.githubUsername})`
      : "❌ Not linked — use `/link-github`",
    inline: false,
  });

  if (data.verifiedExtensions.length > 0) {
    fields.push({
      name: "Verified Extensions",
      value: data.verifiedExtensions
        .map((e) => `${trustBadge(e.trust)} **${e.name}** \`${e.id}\``)
        .join("\n"),
      inline: false,
    });
  } else {
    fields.push({
      name: "Verified Extensions",
      value: "_None_ — use `/verify <extension-id>`",
      inline: false,
    });
  }

  fields.push(
    {
      name: "Extension Developer Role",
      value: data.hasDeveloperRole ? "✅ Granted" : "❌ Not granted",
      inline: true,
    },
    {
      name: "Verified Developer Role",
      value: data.hasVerifiedRole ? "✅ Granted" : "❌ Not granted",
      inline: true,
    }
  );

  if (data.pendingToken) {
    const expiresIn = Math.max(
      0,
      Math.floor((data.pendingToken.expiresAt - Date.now()) / 60_000)
    );
    fields.push({
      name: "⏳ Pending Verification",
      value: `Extension: \`${data.pendingToken.extensionId}\`\nExpires in: ${expiresIn} minute(s)`,
      inline: false,
    });
  }

  return base()
    .setColor(data.hasDeveloperRole ? COLOR_SUCCESS : COLOR_NEUTRAL)
    .setTitle("🔍 Your Verification Status")
    .addFields(fields);
}

// ---------------------------------------------------------------------------
// Verification initiation embed (token display)
// ---------------------------------------------------------------------------

export function verifyInitEmbed(
  token: string,
  extensionId: string,
  repoUrl: string,
  expiresAt: number,
): EmbedBuilder {
  const expiresIn = Math.floor((expiresAt - Date.now()) / 3_600_000);

  return base()
    .setColor(COLOR_PRIMARY)
    .setTitle("🔐 Verification Token Generated")
    .setDescription(
      [
        `To verify ownership of **\`${extensionId}\`**, place the following token in a file called \`aether-verify.txt\` at the **root** of your repository:`,
        "",
        `\`\`\`\n${token}\n\`\`\``,
        "",
        `**Repository:** ${repoUrl}`,
        "",
        `Once the file is live on GitHub (on the \`main\` or \`master\` branch), run \`/verify ${extensionId}\` again to complete verification.`,
        "",
        `> ⚠️ This token is shown **once only**. Do not share it. It expires in **${expiresIn} hour(s)**.`,
      ].join("\n")
    );
}

// ---------------------------------------------------------------------------
// Success / error embeds
// ---------------------------------------------------------------------------

export function successEmbed(title: string, description?: string): EmbedBuilder {
  const e = base().setColor(COLOR_SUCCESS).setTitle(`✅ ${title}`);
  if (description) e.setDescription(description);
  return e;
}

export function errorEmbed(title: string, description?: string): EmbedBuilder {
  const e = base().setColor(COLOR_ERROR).setTitle(`❌ ${title}`);
  if (description) e.setDescription(description);
  return e;
}

export function infoEmbed(title: string, description?: string): EmbedBuilder {
  const e = base().setColor(COLOR_PRIMARY).setTitle(`ℹ️ ${title}`);
  if (description) e.setDescription(description);
  return e;
}
