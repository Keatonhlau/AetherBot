import Database, { Database as DatabaseType } from "better-sqlite3";
import path from "path";
import fs from "fs";

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

const DATA_DIR = path.resolve(process.cwd(), "data");
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db: DatabaseType = new Database(path.join(DATA_DIR, "aetherbot.db"));

// WAL mode for concurrent reads and crash safety
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

db.exec(`
  CREATE TABLE IF NOT EXISTS github_links (
    discord_user_id TEXT PRIMARY KEY,
    github_username  TEXT NOT NULL,
    created_at       INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS verification_tokens (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    discord_user_id  TEXT NOT NULL,
    extension_id     TEXT NOT NULL,
    token_hash       TEXT NOT NULL,
    expires_at       INTEGER NOT NULL,
    failed_attempts  INTEGER NOT NULL DEFAULT 0,
    created_at       INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS announced_releases (
    release_id   INTEGER PRIMARY KEY,
    tag_name     TEXT NOT NULL,
    announced_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS guild_settings (
    guild_id                    TEXT PRIMARY KEY,
    extension_developer_role_id TEXT,
    verified_developer_role_id  TEXT
  );

  CREATE TABLE IF NOT EXISTS announce_channels (
    guild_id   TEXT NOT NULL,
    channel_id TEXT NOT NULL,
    PRIMARY KEY (guild_id, channel_id)
  );

  CREATE TABLE IF NOT EXISTS verified_extensions (
    discord_user_id TEXT NOT NULL,
    extension_id    TEXT NOT NULL,
    verified_at     INTEGER NOT NULL,
    PRIMARY KEY (discord_user_id, extension_id)
  );
`);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GithubLink {
  discord_user_id: string;
  github_username: string;
  created_at: number;
}

export interface VerificationToken {
  id: number;
  discord_user_id: string;
  extension_id: string;
  token_hash: string;
  expires_at: number;
  failed_attempts: number;
  created_at: number;
}

export interface AnnouncedRelease {
  release_id: number;
  tag_name: string;
  announced_at: number;
}

export interface GuildSettings {
  guild_id: string;
  extension_developer_role_id: string | null;
  verified_developer_role_id: string | null;
}

export interface VerifiedExtension {
  discord_user_id: string;
  extension_id: string;
  verified_at: number;
}

// ---------------------------------------------------------------------------
// Prepared statements — github_links
// ---------------------------------------------------------------------------

const _getLink = db.prepare<[string], GithubLink>(
  "SELECT * FROM github_links WHERE discord_user_id = ?"
);
const _upsertLink = db.prepare(
  `INSERT INTO github_links (discord_user_id, github_username, created_at)
   VALUES (?, ?, ?)
   ON CONFLICT(discord_user_id) DO UPDATE SET
     github_username = excluded.github_username,
     created_at = excluded.created_at`
);
const _deleteLink = db.prepare(
  "DELETE FROM github_links WHERE discord_user_id = ?"
);

export const githubLinks = {
  get(userId: string): GithubLink | undefined {
    return _getLink.get(userId);
  },
  upsert(userId: string, username: string): void {
    _upsertLink.run(userId, username, Date.now());
  },
  delete(userId: string): void {
    _deleteLink.run(userId);
  },
};

// ---------------------------------------------------------------------------
// Prepared statements — verification_tokens
// ---------------------------------------------------------------------------

const _getActiveToken = db.prepare<[string, string], VerificationToken>(
  `SELECT * FROM verification_tokens
   WHERE discord_user_id = ? AND extension_id = ?
   ORDER BY created_at DESC LIMIT 1`
);
const _insertToken = db.prepare(
  `INSERT INTO verification_tokens
     (discord_user_id, extension_id, token_hash, expires_at, failed_attempts, created_at)
   VALUES (?, ?, ?, ?, 0, ?)`
);
const _deleteTokensForUser = db.prepare(
  "DELETE FROM verification_tokens WHERE discord_user_id = ?"
);
const _deleteToken = db.prepare(
  "DELETE FROM verification_tokens WHERE id = ?"
);
const _incrementFailed = db.prepare(
  "UPDATE verification_tokens SET failed_attempts = failed_attempts + 1 WHERE id = ?"
);
const _invalidateToken = db.prepare(
  "DELETE FROM verification_tokens WHERE id = ?"
);

export const verificationTokens = {
  getActive(userId: string, extensionId: string): VerificationToken | undefined {
    return _getActiveToken.get(userId, extensionId);
  },
  insert(
    userId: string,
    extensionId: string,
    tokenHash: string,
    expiresAt: number
  ): void {
    // Clear any previous token for the same user+extension first
    db.prepare(
      "DELETE FROM verification_tokens WHERE discord_user_id = ? AND extension_id = ?"
    ).run(userId, extensionId);
    _insertToken.run(userId, extensionId, tokenHash, expiresAt, Date.now());
  },
  incrementFailed(id: number): void {
    _incrementFailed.run(id);
  },
  invalidate(id: number): void {
    _invalidateToken.run(id);
  },
  deleteAllForUser(userId: string): void {
    _deleteTokensForUser.run(userId);
  },
  getAnyPending(userId: string): VerificationToken | undefined {
    return db
      .prepare<[string, number], VerificationToken>(
        `SELECT * FROM verification_tokens
         WHERE discord_user_id = ? AND expires_at > ?
         ORDER BY created_at DESC LIMIT 1`
      )
      .get(userId, Date.now());
  },
};

// ---------------------------------------------------------------------------
// Prepared statements — announced_releases
// ---------------------------------------------------------------------------

const _isAnnounced = db.prepare<[number], { release_id: number }>(
  "SELECT release_id FROM announced_releases WHERE release_id = ?"
);
const _markAnnounced = db.prepare(
  `INSERT OR IGNORE INTO announced_releases (release_id, tag_name, announced_at)
   VALUES (?, ?, ?)`
);

export const announcedReleases = {
  has(releaseId: number): boolean {
    return !!_isAnnounced.get(releaseId);
  },
  mark(releaseId: number, tagName: string): void {
    _markAnnounced.run(releaseId, tagName, Date.now());
  },
};

// ---------------------------------------------------------------------------
// Prepared statements — guild_settings
// ---------------------------------------------------------------------------

const _getSettings = db.prepare<[string], GuildSettings>(
  "SELECT * FROM guild_settings WHERE guild_id = ?"
);
const _upsertSettings = db.prepare(
  `INSERT INTO guild_settings (guild_id, extension_developer_role_id, verified_developer_role_id)
   VALUES (?, ?, ?)
   ON CONFLICT(guild_id) DO UPDATE SET
     extension_developer_role_id = COALESCE(excluded.extension_developer_role_id, guild_settings.extension_developer_role_id),
     verified_developer_role_id  = COALESCE(excluded.verified_developer_role_id, guild_settings.verified_developer_role_id)`
);
const _setDevRole = db.prepare(
  `INSERT INTO guild_settings (guild_id, extension_developer_role_id, verified_developer_role_id)
   VALUES (?, ?, NULL)
   ON CONFLICT(guild_id) DO UPDATE SET extension_developer_role_id = excluded.extension_developer_role_id`
);
const _setVerifiedRole = db.prepare(
  `INSERT INTO guild_settings (guild_id, extension_developer_role_id, verified_developer_role_id)
   VALUES (?, NULL, ?)
   ON CONFLICT(guild_id) DO UPDATE SET verified_developer_role_id = excluded.verified_developer_role_id`
);

export const guildSettings = {
  get(guildId: string): GuildSettings | undefined {
    return _getSettings.get(guildId);
  },
  setExtensionDevRole(guildId: string, roleId: string): void {
    _setDevRole.run(guildId, roleId);
  },
  setVerifiedDevRole(guildId: string, roleId: string): void {
    _setVerifiedRole.run(guildId, roleId);
  },
};

// ---------------------------------------------------------------------------
// Prepared statements — announce_channels
// ---------------------------------------------------------------------------

const _getChannels = db.prepare<[string], { channel_id: string }>(
  "SELECT channel_id FROM announce_channels WHERE guild_id = ?"
);
const _addChannel = db.prepare(
  "INSERT OR IGNORE INTO announce_channels (guild_id, channel_id) VALUES (?, ?)"
);
const _removeChannel = db.prepare(
  "DELETE FROM announce_channels WHERE guild_id = ? AND channel_id = ?"
);

export const announceChannels = {
  list(guildId: string): string[] {
    return _getChannels.all(guildId).map((r) => r.channel_id);
  },
  add(guildId: string, channelId: string): void {
    _addChannel.run(guildId, channelId);
  },
  remove(guildId: string, channelId: string): void {
    _removeChannel.run(guildId, channelId);
  },
};

// ---------------------------------------------------------------------------
// Prepared statements — verified_extensions
// ---------------------------------------------------------------------------

const _getVerifiedExts = db.prepare<[string], VerifiedExtension>(
  "SELECT * FROM verified_extensions WHERE discord_user_id = ?"
);
const _addVerifiedExt = db.prepare(
  `INSERT OR REPLACE INTO verified_extensions (discord_user_id, extension_id, verified_at)
   VALUES (?, ?, ?)`
);
const _deleteVerifiedExts = db.prepare(
  "DELETE FROM verified_extensions WHERE discord_user_id = ?"
);
const _getUsersForExtension = db.prepare<[string], { discord_user_id: string }>(
  "SELECT discord_user_id FROM verified_extensions WHERE extension_id = ?"
);
const _getAllVerified = db.prepare<[], VerifiedExtension>(
  "SELECT * FROM verified_extensions"
);

export const verifiedExtensions = {
  getForUser(userId: string): VerifiedExtension[] {
    return _getVerifiedExts.all(userId);
  },
  add(userId: string, extensionId: string): void {
    _addVerifiedExt.run(userId, extensionId, Date.now());
  },
  deleteAllForUser(userId: string): void {
    _deleteVerifiedExts.run(userId);
  },
  getUsersForExtension(extensionId: string): string[] {
    return _getUsersForExtension.all(extensionId).map((r) => r.discord_user_id);
  },
  getAll(): VerifiedExtension[] {
    return _getAllVerified.all();
  },
};

export default db;
