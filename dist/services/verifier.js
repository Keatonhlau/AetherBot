"use strict";
// Cryptographic developer verification service.
// Handles token generation, hashing, storage, and the full verification flow.
// Never stores or logs plaintext tokens.
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateToken = generateToken;
exports.hashToken = hashToken;
exports.verifyTokenHash = verifyTokenHash;
exports.initiateVerification = initiateVerification;
exports.completeVerification = completeVerification;
const crypto_1 = __importDefault(require("crypto"));
const config_js_1 = require("../config.js");
const db_js_1 = require("../db.js");
const github_js_1 = require("./github.js");
const registry_js_1 = require("./registry.js");
const roles_js_1 = require("./roles.js");
// ---------------------------------------------------------------------------
// Token generation
// ---------------------------------------------------------------------------
/** Generate a cryptographically secure random token (64 hex chars). */
function generateToken() {
    return crypto_1.default.randomBytes(32).toString("hex");
}
/** SHA-256 hash a token. */
function hashToken(token) {
    return crypto_1.default.createHash("sha256").update(token).digest("hex");
}
/** Compare a plaintext token against a stored hash in constant time. */
function verifyTokenHash(plaintext, hash) {
    const computed = hashToken(plaintext);
    // constant-time compare to prevent timing attacks
    try {
        return crypto_1.default.timingSafeEqual(Buffer.from(computed, "hex"), Buffer.from(hash, "hex"));
    }
    catch {
        return false;
    }
}
async function initiateVerification(userId, extensionId) {
    // Must have a linked GitHub account
    const link = db_js_1.githubLinks.get(userId);
    if (!link) {
        return {
            ok: false,
            reason: "You have not linked a GitHub account. Use `/link-github` first.",
        };
    }
    // Extension must exist in the registry
    const extension = (0, registry_js_1.getExtension)(extensionId);
    if (!extension) {
        return {
            ok: false,
            reason: `Extension \`${extensionId}\` was not found in the registry.`,
        };
    }
    // Extension must have a repository field
    if (!extension.repository) {
        return {
            ok: false,
            reason: `Extension \`${extensionId}\` does not have a repository configured in the registry. Verification is not possible.`,
        };
    }
    // Check for an existing valid token (cooldown: don't spam)
    const existing = db_js_1.verificationTokens.getActive(userId, extensionId);
    if (existing) {
        const now = Date.now();
        if (existing.expires_at > now) {
            const minsLeft = Math.ceil((existing.expires_at - now) / 60_000);
            return {
                ok: false,
                reason: `You already have a pending verification token for \`${extensionId}\`. It expires in ${minsLeft} minute(s). Place it in \`aether-verify.txt\` and run \`/verify ${extensionId}\` to complete.`,
            };
        }
    }
    const token = generateToken();
    const tokenHash = hashToken(token);
    const ttlMs = config_js_1.config.verifyTokenTtlHours * 3_600_000;
    const expiresAt = Date.now() + ttlMs;
    db_js_1.verificationTokens.insert(userId, extensionId, tokenHash, expiresAt);
    return {
        ok: true,
        token,
        expiresAt,
        repoUrl: extension.repository,
    };
}
async function completeVerification(userId, extensionId, member, client) {
    // Check GitHub link
    const link = db_js_1.githubLinks.get(userId);
    if (!link) {
        return { ok: false, reason: "No linked GitHub account. Use `/link-github` first." };
    }
    // Extension must exist
    const extension = (0, registry_js_1.getExtension)(extensionId);
    if (!extension) {
        return { ok: false, reason: `Extension \`${extensionId}\` not found in the registry.` };
    }
    if (!extension.repository) {
        return { ok: false, reason: `Extension \`${extensionId}\` has no repository configured.` };
    }
    // Get the active token
    const tokenRecord = db_js_1.verificationTokens.getActive(userId, extensionId);
    if (!tokenRecord) {
        return {
            ok: false,
            reason: `No pending verification token for \`${extensionId}\`. Run \`/verify ${extensionId}\` to generate one.`,
        };
    }
    const now = Date.now();
    if (tokenRecord.expires_at < now) {
        db_js_1.verificationTokens.invalidate(tokenRecord.id);
        return { ok: false, reason: "Your verification token has expired. Run `/verify` again to get a new one." };
    }
    if (tokenRecord.failed_attempts >= 3) {
        db_js_1.verificationTokens.invalidate(tokenRecord.id);
        return { ok: false, reason: "Token invalidated after 3 failed attempts. Run `/verify` to generate a new one." };
    }
    // Fetch aether-verify.txt from the extension's repository
    // Use the registry's repo, NOT any user-supplied value
    const ghClient = new github_js_1.GitHubClient(config_js_1.config.githubToken);
    // Extract repo path from URL (e.g. https://github.com/owner/repo)
    const repoPath = extension.repository
        .replace(/^https?:\/\/github\.com\//, "")
        .replace(/\/$/, "");
    console.log(`[verifier] Checking ${repoPath}/aether-verify.txt for user ${userId}`);
    const fileContent = await ghClient.getVerifyTxt(repoPath);
    if (fileContent === null) {
        db_js_1.verificationTokens.incrementFailed(tokenRecord.id);
        const newFailed = tokenRecord.failed_attempts + 1;
        const msg = newFailed >= 3
            ? `\`aether-verify.txt\` not found or unreadable. Token invalidated after 3 failed attempts.`
            : `\`aether-verify.txt\` not found on \`main\` or \`master\` branch. Attempts remaining: ${3 - newFailed}.`;
        if (newFailed >= 3)
            db_js_1.verificationTokens.invalidate(tokenRecord.id);
        return { ok: false, reason: msg };
    }
    // Compare the file content against the stored hash
    const matches = verifyTokenHash(fileContent, tokenRecord.token_hash);
    if (!matches) {
        db_js_1.verificationTokens.incrementFailed(tokenRecord.id);
        const newFailed = tokenRecord.failed_attempts + 1;
        if (newFailed >= 3) {
            db_js_1.verificationTokens.invalidate(tokenRecord.id);
            return {
                ok: false,
                reason: "Token mismatch. Token has been invalidated after 3 failed attempts. Run `/verify` to get a new one.",
            };
        }
        return {
            ok: false,
            reason: `Token mismatch. Check the contents of \`aether-verify.txt\` exactly match the generated token. Attempts remaining: ${3 - newFailed}.`,
        };
    }
    // Success — record and grant roles
    db_js_1.verificationTokens.invalidate(tokenRecord.id);
    db_js_1.verifiedExtensions.add(userId, extensionId);
    console.log(`[verifier] ✓ ${userId} verified ownership of ${extensionId}`);
    // Assign appropriate roles
    const roleGranted = await (0, roles_js_1.assignRoles)(member, client);
    return { ok: true, extensionId, roleGranted };
}
//# sourceMappingURL=verifier.js.map