import argon2 from "argon2";
import bcrypt from "bcryptjs";

/**
 * Real Argon2id password hashing (the memory-hard, GPU-resistant algorithm
 * OWASP currently recommends over bcrypt) for every user-chosen password
 * in this app (User.password, ClientPortalUser.passwordHash) — NOT for
 * high-entropy random tokens like API keys (src/lib/auth/api-key.ts,
 * profile/actions.ts's createApiKey), which stay on bcrypt deliberately:
 * bcrypt's cost factor defends against brute-forcing a low-entropy
 * human-chosen secret, which a 256-bit random API key was never at risk
 * from in the first place — switching those would be pure churn, not a
 * real security improvement.
 *
 * Existing accounts keep their bcrypt hash and keep working exactly as
 * before (verifyPassword detects the hash format and calls the right
 * algorithm) — there is no forced migration/reset. `needsRehash` +
 * `rehashIfNeeded` implement the standard "upgrade transparently on next
 * successful login" pattern so the whole user base migrates to Argon2
 * organically over time, verified-password-in-hand, never by re-hashing a
 * password this code hasn't actually just confirmed is correct.
 */

const ARGON2_OPTIONS = { type: argon2.argon2id } as const;

export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, ARGON2_OPTIONS);
}

function isBcryptHash(hash: string): boolean {
  return hash.startsWith("$2a$") || hash.startsWith("$2b$") || hash.startsWith("$2y$");
}

function isArgon2Hash(hash: string): boolean {
  return hash.startsWith("$argon2");
}

/** Real verification against whichever real algorithm actually produced this hash — never assumes a format. */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  if (isArgon2Hash(hash)) return argon2.verify(hash, password);
  if (isBcryptHash(hash)) return bcrypt.compare(password, hash);
  return false; // unrecognized hash format — never a fabricated match
}

export function needsRehash(hash: string): boolean {
  return !isArgon2Hash(hash);
}

/**
 * Call after a real, already-successful verifyPassword() — re-hashes with
 * Argon2 and returns the new hash for the caller to persist, or null if
 * this hash is already Argon2 (nothing to do). Never called speculatively
 * against an unverified password.
 */
export async function rehashIfNeeded(password: string, currentHash: string): Promise<string | null> {
  if (!needsRehash(currentHash)) return null;
  return hashPassword(password);
}
