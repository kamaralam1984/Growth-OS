import { encryptWithKey, decryptWithKey } from "@/lib/crypto/aes-gcm";

/**
 * Encrypts/decrypts IntegrationConnection.encryptedAccessToken/
 * encryptedRefreshToken. Uses its own env-var key (separate from
 * AgentMemory's AGENT_MEMORY_ENCRYPTION_KEY) so rotating OAuth-token
 * encryption never silently breaks agent memory or vice versa.
 */
export function encryptToken(plaintext: string): string {
  return encryptWithKey(plaintext, requireKey());
}

export function decryptToken(encoded: string): string {
  return decryptWithKey(encoded, requireKey());
}

function requireKey(): string {
  const key = process.env.INTEGRATION_TOKEN_ENCRYPTION_KEY;
  if (!key) {
    throw new Error("INTEGRATION_TOKEN_ENCRYPTION_KEY must be set to a 64-character hex string (32 bytes) to store integration tokens.");
  }
  return key;
}
