import { encryptWithKey, decryptWithKey } from "@/lib/crypto/aes-gcm";

/**
 * Encrypts/decrypts Secret.encryptedValue. Uses its own dedicated env-var
 * key (separate from AGENT_MEMORY_ENCRYPTION_KEY and
 * INTEGRATION_TOKEN_ENCRYPTION_KEY) so rotating the Secrets Manager's key
 * domain never silently breaks agent memory or OAuth token decryption, or
 * vice versa.
 */
export function encryptSecret(plaintext: string): string {
  return encryptWithKey(plaintext, requireKey());
}

export function decryptSecret(encoded: string): string {
  return decryptWithKey(encoded, requireKey());
}

function requireKey(): string {
  const key = process.env.SECRETS_MANAGER_ENCRYPTION_KEY;
  if (!key) {
    throw new Error("SECRETS_MANAGER_ENCRYPTION_KEY must be set to a 64-character hex string (32 bytes) to store secrets.");
  }
  return key;
}
