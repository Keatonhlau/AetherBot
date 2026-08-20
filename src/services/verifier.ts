// Cryptographic developer verification service.
// Handles token generation, hashing, storage, and the full verification flow.
// Never stores or logs plaintext tokens.

import crypto from "crypto";
import { Client, GuildMember } from "discord.js";
import { config } from "../config.js";
import {
  githubLinks,
  verificationTokens,
  verifiedExtensions,
} from "../db.js";
import { GitHubClient } from "./github.js";
import { getExtension } from "./registry.js";
import { assignRoles } from "./roles.js";

// ---------------------------------------------------------------------------
// Token generation
// ---------------------------------------------------------------------------

/** Generate a cryptographically secure random token (64 hex chars). */
export function generateToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

/** SHA-256 hash a token. */
export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

/** Compare a plaintext token against a stored hash in constant time. */
export function verifyTokenHash(plaintext: string, hash: string): boolean {
  const computed = hashToken(plaintext);
  // constant-time compare to prevent timing attacks
  try {
    return crypto.timingSafeEqual(
      Buffer.from(computed, "hex"),
      Buffer.from(hash, "hex")
    );
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Initiate verification
// ---------------------------------------------------------------------------

export type InitiateResult =
  | { ok: true; token: string; expiresAt: number; repoUrl: string }
  | { ok: false; reason: string };

export async function initiateVerification(
  userId: string,
  extensionId: string
): Promise<InitiateResult> {
  // Must have a linked GitHub account
  const link = githubLinks.get(userId);
  if (!link) {
    return {
      ok: false,
      reason: "You have not linked a GitHub account. Use `/link-github` first.",
    };
  }

  // Extension must exist in the registry
  const extension = getExtension(extensionId);
  if (!extension) {
    return {
      ok: false,
      reason: `Extension \`${extensionId}\` was not found in the registry.`,
    };
  }

  // Official extensions are team-maintained — no individual verification
  if (extension.trust === "official") {
    return {
      ok: false,
      reason: `Extension \`${extensionId}\` is maintained by the Aether team and doesn't require verification.`,
    };
  }

  // Community extensions need a repository for ownership verification
  if (!extension.repository) {
    return {
      ok: false,
      reason: `Extension \`${extensionId}\` has no repository configured in the registry yet. The Aether team must add one before it can be verified.`,
    };
  }

  // Check for an existing valid token (cooldown: don't spam)
  const existing = verificationTokens.getActive(userId, extensionId);
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
  const ttlMs = config.verifyTokenTtlHours * 3_600_000;
  const expiresAt = Date.now() + ttlMs;

  verificationTokens.insert(userId, extensionId, tokenHash, expiresAt);

  return {
    ok: true,
    token,
    expiresAt,
    repoUrl: extension.repository,
  };
}

// ---------------------------------------------------------------------------
// Complete verification
// ---------------------------------------------------------------------------

export type VerifyResult =
  | { ok: true; extensionId: string; roleGranted: boolean }
  | { ok: false; reason: string };

export async function completeVerification(
  userId: string,
  extensionId: string,
  member: GuildMember,
  client: Client
): Promise<VerifyResult> {
  // Check GitHub link
  const link = githubLinks.get(userId);
  if (!link) {
    return { ok: false, reason: "No linked GitHub account. Use `/link-github` first." };
  }

  // Extension must exist
  const extension = getExtension(extensionId);
  if (!extension) {
    return { ok: false, reason: `Extension \`${extensionId}\` not found in the registry.` };
  }
  if (extension.trust === "official") {
    return {
      ok: false,
      reason: `Extension \`${extensionId}\` is maintained by the Aether team and doesn't require verification.`,
    };
  }
  if (!extension.repository) {
    return {
      ok: false,
      reason: `Extension \`${extensionId}\` has no repository configured in the registry yet.`,
    };
  }

  // Get the active token
  const tokenRecord = verificationTokens.getActive(userId, extensionId);
  if (!tokenRecord) {
    return {
      ok: false,
      reason: `No pending verification token for \`${extensionId}\`. Run \`/verify ${extensionId}\` to generate one.`,
    };
  }

  const now = Date.now();
  if (tokenRecord.expires_at < now) {
    verificationTokens.invalidate(tokenRecord.id);
    return { ok: false, reason: "Your verification token has expired. Run `/verify` again to get a new one." };
  }

  if (tokenRecord.failed_attempts >= 3) {
    verificationTokens.invalidate(tokenRecord.id);
    return { ok: false, reason: "Token invalidated after 3 failed attempts. Run `/verify` to generate a new one." };
  }

  // Fetch aether-verify.txt from the extension's repository
  // Use the registry's repo, NOT any user-supplied value
  const ghClient = new GitHubClient(config.githubToken);

  // Extract repo path from URL (e.g. https://github.com/owner/repo)
  const repoPath = extension.repository
    .replace(/^https?:\/\/github\.com\//, "")
    .replace(/\/$/, "");

  console.log(
    `[verifier] Checking ${repoPath}/aether-verify.txt for user ${userId}`
  );

  const fileContent = await ghClient.getVerifyTxt(repoPath);

  if (fileContent === null) {
    verificationTokens.incrementFailed(tokenRecord.id);
    const newFailed = tokenRecord.failed_attempts + 1;
    const msg =
      newFailed >= 3
        ? `\`aether-verify.txt\` not found or unreadable. Token invalidated after 3 failed attempts.`
        : `\`aether-verify.txt\` not found on \`main\` or \`master\` branch. Attempts remaining: ${3 - newFailed}.`;
    if (newFailed >= 3) verificationTokens.invalidate(tokenRecord.id);
    return { ok: false, reason: msg };
  }

  // Compare the file content against the stored hash
  const matches = verifyTokenHash(fileContent, tokenRecord.token_hash);
  if (!matches) {
    verificationTokens.incrementFailed(tokenRecord.id);
    const newFailed = tokenRecord.failed_attempts + 1;
    if (newFailed >= 3) {
      verificationTokens.invalidate(tokenRecord.id);
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
  verificationTokens.invalidate(tokenRecord.id);
  verifiedExtensions.add(userId, extensionId);

  console.log(`[verifier] ✓ ${userId} verified ownership of ${extensionId}`);

  // Assign appropriate roles
  const roleGranted = await assignRoles(member, client);

  return { ok: true, extensionId, roleGranted };
}
