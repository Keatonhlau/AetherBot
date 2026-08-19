import "dotenv/config";
import fs from "fs";
import path from "path";

export interface GuildConfig {
  announceChannelIds?: string[];
  extensionDeveloperRoleId?: string;
  verifiedDeveloperRoleId?: string;
}

export interface Config {
  discordToken: string;
  githubToken: string;
  githubRepo: string;
  githubRegistryRepo: string;
  pollIntervalSeconds: number;
  verifyTokenTtlHours: number;
  ownerUserIds: string[];
  guilds: Record<string, GuildConfig>;
}

function loadFileConfig(): Partial<Config> {
  const filePath = path.resolve(process.cwd(), "config.json");
  if (!fs.existsSync(filePath)) return {};
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(raw);
  } catch (err) {
    console.error("[config] Failed to parse config.json:", err);
    return {};
  }
}

function requireEnv(key: string): string {
  const val = process.env[key];
  if (!val) {
    console.error(`[config] Missing required environment variable: ${key}`);
    process.exit(1);
  }
  return val;
}

function loadConfig(): Config {
  const file = loadFileConfig();

  const ownerRaw = process.env["OWNER_USER_IDS"] ?? "";
  const ownerIds =
    ownerRaw.length > 0
      ? ownerRaw
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      : ((file.ownerUserIds as string[] | undefined) ?? []);

  return {
    discordToken: requireEnv("DISCORD_TOKEN"),
    githubToken: process.env["GITHUB_TOKEN"] ?? "",
    githubRepo:
      process.env["GITHUB_REPO"] ??
      (file.githubRepo as string | undefined) ??
      "wayback09/Aether",
    githubRegistryRepo:
      process.env["GITHUB_REGISTRY_REPO"] ??
      (file.githubRegistryRepo as string | undefined) ??
      "wayback09/Aether-Extensions",
    pollIntervalSeconds:
      (parseInt(process.env["POLL_INTERVAL_SECONDS"] ?? "0", 10) ||
      file.pollIntervalSeconds) ??
      300,
    verifyTokenTtlHours:
      (parseInt(process.env["VERIFY_TOKEN_TTL_HOURS"] ?? "0", 10) ||
      file.verifyTokenTtlHours) ??
      24,
    ownerUserIds: ownerIds,
    guilds: (file.guilds as Record<string, GuildConfig> | undefined) ?? {},
  };
}

export const config = loadConfig();
