import { Client, GuildMember } from "discord.js";
/** Generate a cryptographically secure random token (64 hex chars). */
export declare function generateToken(): string;
/** SHA-256 hash a token. */
export declare function hashToken(token: string): string;
/** Compare a plaintext token against a stored hash in constant time. */
export declare function verifyTokenHash(plaintext: string, hash: string): boolean;
export type InitiateResult = {
    ok: true;
    token: string;
    expiresAt: number;
    repoUrl: string;
} | {
    ok: false;
    reason: string;
};
export declare function initiateVerification(userId: string, extensionId: string): Promise<InitiateResult>;
export type VerifyResult = {
    ok: true;
    extensionId: string;
    roleGranted: boolean;
} | {
    ok: false;
    reason: string;
};
export declare function completeVerification(userId: string, extensionId: string, member: GuildMember, client: Client): Promise<VerifyResult>;
//# sourceMappingURL=verifier.d.ts.map