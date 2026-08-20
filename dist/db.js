"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.verifiedExtensions = exports.announceChannels = exports.guildSettings = exports.announcedReleases = exports.verificationTokens = exports.githubLinks = void 0;
const better_sqlite3_1 = __importDefault(require("better-sqlite3"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------
const DATA_DIR = path_1.default.resolve(process.cwd(), "data");
if (!fs_1.default.existsSync(DATA_DIR))
    fs_1.default.mkdirSync(DATA_DIR, { recursive: true });
const db = new better_sqlite3_1.default(path_1.default.join(DATA_DIR, "aetherbot.db"));
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
// Prepared statements — github_links
// ---------------------------------------------------------------------------
const _getLink = db.prepare("SELECT * FROM github_links WHERE discord_user_id = ?");
const _upsertLink = db.prepare(`INSERT INTO github_links (discord_user_id, github_username, created_at)
   VALUES (?, ?, ?)
   ON CONFLICT(discord_user_id) DO UPDATE SET
     github_username = excluded.github_username,
     created_at = excluded.created_at`);
const _deleteLink = db.prepare("DELETE FROM github_links WHERE discord_user_id = ?");
exports.githubLinks = {
    get(userId) {
        return _getLink.get(userId);
    },
    upsert(userId, username) {
        _upsertLink.run(userId, username, Date.now());
    },
    delete(userId) {
        _deleteLink.run(userId);
    },
};
// ---------------------------------------------------------------------------
// Prepared statements — verification_tokens
// ---------------------------------------------------------------------------
const _getActiveToken = db.prepare(`SELECT * FROM verification_tokens
   WHERE discord_user_id = ? AND extension_id = ?
   ORDER BY created_at DESC LIMIT 1`);
const _insertToken = db.prepare(`INSERT INTO verification_tokens
     (discord_user_id, extension_id, token_hash, expires_at, failed_attempts, created_at)
   VALUES (?, ?, ?, ?, 0, ?)`);
const _deleteTokensForUser = db.prepare("DELETE FROM verification_tokens WHERE discord_user_id = ?");
const _deleteToken = db.prepare("DELETE FROM verification_tokens WHERE id = ?");
const _incrementFailed = db.prepare("UPDATE verification_tokens SET failed_attempts = failed_attempts + 1 WHERE id = ?");
const _invalidateToken = db.prepare("DELETE FROM verification_tokens WHERE id = ?");
exports.verificationTokens = {
    getActive(userId, extensionId) {
        return _getActiveToken.get(userId, extensionId);
    },
    insert(userId, extensionId, tokenHash, expiresAt) {
        // Clear any previous token for the same user+extension first
        db.prepare("DELETE FROM verification_tokens WHERE discord_user_id = ? AND extension_id = ?").run(userId, extensionId);
        _insertToken.run(userId, extensionId, tokenHash, expiresAt, Date.now());
    },
    incrementFailed(id) {
        _incrementFailed.run(id);
    },
    invalidate(id) {
        _invalidateToken.run(id);
    },
    deleteAllForUser(userId) {
        _deleteTokensForUser.run(userId);
    },
    getAnyPending(userId) {
        return db
            .prepare(`SELECT * FROM verification_tokens
         WHERE discord_user_id = ? AND expires_at > ?
         ORDER BY created_at DESC LIMIT 1`)
            .get(userId, Date.now());
    },
};
// ---------------------------------------------------------------------------
// Prepared statements — announced_releases
// ---------------------------------------------------------------------------
const _isAnnounced = db.prepare("SELECT release_id FROM announced_releases WHERE release_id = ?");
const _markAnnounced = db.prepare(`INSERT OR IGNORE INTO announced_releases (release_id, tag_name, announced_at)
   VALUES (?, ?, ?)`);
exports.announcedReleases = {
    has(releaseId) {
        return !!_isAnnounced.get(releaseId);
    },
    mark(releaseId, tagName) {
        _markAnnounced.run(releaseId, tagName, Date.now());
    },
};
// ---------------------------------------------------------------------------
// Prepared statements — guild_settings
// ---------------------------------------------------------------------------
const _getSettings = db.prepare("SELECT * FROM guild_settings WHERE guild_id = ?");
const _upsertSettings = db.prepare(`INSERT INTO guild_settings (guild_id, extension_developer_role_id, verified_developer_role_id)
   VALUES (?, ?, ?)
   ON CONFLICT(guild_id) DO UPDATE SET
     extension_developer_role_id = COALESCE(excluded.extension_developer_role_id, guild_settings.extension_developer_role_id),
     verified_developer_role_id  = COALESCE(excluded.verified_developer_role_id, guild_settings.verified_developer_role_id)`);
const _setDevRole = db.prepare(`INSERT INTO guild_settings (guild_id, extension_developer_role_id, verified_developer_role_id)
   VALUES (?, ?, NULL)
   ON CONFLICT(guild_id) DO UPDATE SET extension_developer_role_id = excluded.extension_developer_role_id`);
const _setVerifiedRole = db.prepare(`INSERT INTO guild_settings (guild_id, extension_developer_role_id, verified_developer_role_id)
   VALUES (?, NULL, ?)
   ON CONFLICT(guild_id) DO UPDATE SET verified_developer_role_id = excluded.verified_developer_role_id`);
exports.guildSettings = {
    get(guildId) {
        return _getSettings.get(guildId);
    },
    setExtensionDevRole(guildId, roleId) {
        _setDevRole.run(guildId, roleId);
    },
    setVerifiedDevRole(guildId, roleId) {
        _setVerifiedRole.run(guildId, roleId);
    },
};
// ---------------------------------------------------------------------------
// Prepared statements — announce_channels
// ---------------------------------------------------------------------------
const _getChannels = db.prepare("SELECT channel_id FROM announce_channels WHERE guild_id = ?");
const _addChannel = db.prepare("INSERT OR IGNORE INTO announce_channels (guild_id, channel_id) VALUES (?, ?)");
const _removeChannel = db.prepare("DELETE FROM announce_channels WHERE guild_id = ? AND channel_id = ?");
exports.announceChannels = {
    list(guildId) {
        return _getChannels.all(guildId).map((r) => r.channel_id);
    },
    add(guildId, channelId) {
        _addChannel.run(guildId, channelId);
    },
    remove(guildId, channelId) {
        _removeChannel.run(guildId, channelId);
    },
};
// ---------------------------------------------------------------------------
// Prepared statements — verified_extensions
// ---------------------------------------------------------------------------
const _getVerifiedExts = db.prepare("SELECT * FROM verified_extensions WHERE discord_user_id = ?");
const _addVerifiedExt = db.prepare(`INSERT OR REPLACE INTO verified_extensions (discord_user_id, extension_id, verified_at)
   VALUES (?, ?, ?)`);
const _deleteVerifiedExts = db.prepare("DELETE FROM verified_extensions WHERE discord_user_id = ?");
const _getUsersForExtension = db.prepare("SELECT discord_user_id FROM verified_extensions WHERE extension_id = ?");
const _getAllVerified = db.prepare("SELECT * FROM verified_extensions");
exports.verifiedExtensions = {
    getForUser(userId) {
        return _getVerifiedExts.all(userId);
    },
    add(userId, extensionId) {
        _addVerifiedExt.run(userId, extensionId, Date.now());
    },
    deleteAllForUser(userId) {
        _deleteVerifiedExts.run(userId);
    },
    getUsersForExtension(extensionId) {
        return _getUsersForExtension.all(extensionId).map((r) => r.discord_user_id);
    },
    getAll() {
        return _getAllVerified.all();
    },
};
exports.default = db;
//# sourceMappingURL=db.js.map