"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.config = void 0;
require("dotenv/config");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
function loadFileConfig() {
    const filePath = path_1.default.resolve(process.cwd(), "config.json");
    if (!fs_1.default.existsSync(filePath))
        return {};
    try {
        const raw = fs_1.default.readFileSync(filePath, "utf-8");
        return JSON.parse(raw);
    }
    catch (err) {
        console.error("[config] Failed to parse config.json:", err);
        return {};
    }
}
function requireEnv(key) {
    const val = process.env[key];
    if (!val) {
        console.error(`[config] Missing required environment variable: ${key}`);
        process.exit(1);
    }
    return val;
}
function loadConfig() {
    const file = loadFileConfig();
    const ownerRaw = process.env["OWNER_USER_IDS"] ?? "";
    const ownerIds = ownerRaw.length > 0
        ? ownerRaw
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean)
        : (file.ownerUserIds ?? []);
    return {
        discordToken: requireEnv("DISCORD_TOKEN"),
        githubToken: process.env["GITHUB_TOKEN"] ?? "",
        githubRepo: process.env["GITHUB_REPO"] ??
            file.githubRepo ??
            "wayback09/Aether",
        githubRegistryRepo: process.env["GITHUB_REGISTRY_REPO"] ??
            file.githubRegistryRepo ??
            "wayback09/Aether-Extensions",
        pollIntervalSeconds: (parseInt(process.env["POLL_INTERVAL_SECONDS"] ?? "0", 10) ||
            file.pollIntervalSeconds) ??
            300,
        verifyTokenTtlHours: (parseInt(process.env["VERIFY_TOKEN_TTL_HOURS"] ?? "0", 10) ||
            file.verifyTokenTtlHours) ??
            24,
        ownerUserIds: ownerIds,
        guilds: file.guilds ?? {},
    };
}
exports.config = loadConfig();
//# sourceMappingURL=config.js.map