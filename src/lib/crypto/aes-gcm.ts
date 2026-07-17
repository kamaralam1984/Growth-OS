import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";

/**
 * Generic AES-256-GCM encrypt/decrypt, keyed by a 64-hex-char (32 byte) key
 * passed in by the caller. Extracted from what was originally a single
 * AgentMemory-only helper (src/lib/ai/encryption.ts) so it can be reused for
 * other at-rest secrets (e.g. IntegrationConnection OAuth tokens,
 * src/lib/integrations/crypto.ts) WITHOUT sharing an encryption key across
 * unrelated secret domains — each caller supplies its own env-var-sourced
 * key, so rotating one never silently breaks the other.
 */
export function encryptWithKey(plaintext: string, keyHex: string): string {
  const key = parseKey(keyHex);
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, ciphertext]).toString("base64");
}

export function decryptWithKey(encoded: string, keyHex: string): string {
  const key = parseKey(keyHex);
  const raw = Buffer.from(encoded, "base64");
  const iv = raw.subarray(0, 12);
  const authTag = raw.subarray(12, 28);
  const ciphertext = raw.subarray(28);
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

function parseKey(hex: string | undefined): Buffer {
  if (!hex || hex.length !== 64) {
    throw new Error("Encryption key must be a 64-character hex string (32 bytes).");
  }
  return Buffer.from(hex, "hex");
}

/**
 * Binary-safe counterparts of encryptWithKey/decryptWithKey — the string
 * versions above run ciphertext through utf8 encode/decode, which corrupts
 * arbitrary binary data (PDFs, images). Used for at-rest file storage
 * encryption (src/lib/storage/file-store.ts), where payloads are never text.
 */
export function encryptBufferWithKey(plaintext: Buffer, keyHex: string): Buffer {
  const key = parseKey(keyHex);
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, ciphertext]);
}

export function decryptBufferWithKey(encoded: Buffer, keyHex: string): Buffer {
  const key = parseKey(keyHex);
  const iv = encoded.subarray(0, 12);
  const authTag = encoded.subarray(12, 28);
  const ciphertext = encoded.subarray(28);
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}
