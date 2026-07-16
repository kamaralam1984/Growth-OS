import { encryptWithKey, decryptWithKey } from "@/lib/crypto/aes-gcm";

/**
 * Encrypts/decrypts User.twoFactorSecret at rest. A fifth, independent
 * AES-256-GCM key domain alongside AGENT_MEMORY_ENCRYPTION_KEY,
 * INTEGRATION_TOKEN_ENCRYPTION_KEY, SECRETS_MANAGER_ENCRYPTION_KEY, and
 * WEBHOOK_SECRET_ENCRYPTION_KEY — a DB dump alone must not be enough to
 * generate valid TOTP codes for every 2FA-enrolled account.
 */
export function encryptTwoFactorSecret(plaintext: string): string {
  return encryptWithKey(plaintext, requireKey());
}

/**
 * Decrypts a stored twoFactorSecret. Falls back to returning the value
 * as-is when it isn't valid ciphertext for this key — the same
 * format-detecting idiom used for the bcrypt->Argon2 password migration
 * (src/lib/auth/password.ts) — so any secret enrolled before this
 * encryption was introduced keeps working until the user re-enrolls
 * (startTwoFactorEnrollment always writes a freshly encrypted value).
 */
export function decryptTwoFactorSecret(stored: string): string {
  // requireKey() is deliberately called OUTSIDE the try/catch below: a
  // missing encryption key must fail loudly, never be swallowed into the
  // legacy-plaintext fallback (which is only for values that fail to
  // decrypt with a correctly configured key).
  const key = requireKey();
  try {
    return decryptWithKey(stored, key);
  } catch {
    return stored;
  }
}

function requireKey(): string {
  const key = process.env.TWO_FACTOR_SECRET_ENCRYPTION_KEY;
  if (!key) {
    throw new Error("TWO_FACTOR_SECRET_ENCRYPTION_KEY must be set to a 64-character hex string (32 bytes) to enroll 2FA.");
  }
  return key;
}
