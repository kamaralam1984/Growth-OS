import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Stateless, time-limited signed download tokens for the local-disk file
 * storage in this directory (src/lib/storage/file-store.ts) — lets a file
 * (e.g. a platform invoice PDF) be shared via a plain URL with someone who
 * should never need a full dashboard/portal account (an accounts-payable
 * contact, e.g.), without a DB row to track: the token itself carries the
 * payload + expiry + an HMAC-SHA256 signature, so verifySignedFileToken
 * never needs a database round-trip and there is nothing to look up by id.
 * The tradeoff every stateless signed-URL scheme makes: a token can't be
 * revoked early short of rotating FILE_SIGNED_URL_SECRET (which invalidates
 * every outstanding link, not just one) — acceptable here since these are
 * short-lived, narrowly-scoped download links, never an auth session.
 *
 * Uses its own dedicated env-var key (FILE_SIGNED_URL_SECRET), separate
 * from FILE_STORAGE_ENCRYPTION_KEY and every other encryption key domain in
 * this codebase (see src/lib/secrets/crypto.ts's requireKey() for the
 * pattern this mirrors), so rotating one never silently breaks the other.
 */
export interface SignedFilePayload {
  subdir: string;
  storageKey: string;
  filename: string;
  contentType: string;
}

export interface CreateSignedFileTokenInput extends SignedFilePayload {
  expiresInSeconds: number;
}

interface TokenClaims extends SignedFilePayload {
  exp: number;
}

function requireSecret(): string {
  const secret = process.env.FILE_SIGNED_URL_SECRET;
  if (!secret) {
    throw new Error("FILE_SIGNED_URL_SECRET must be set to create signed file download URLs.");
  }
  return secret;
}

function sign(payloadB64: string, secret: string): string {
  return createHmac("sha256", secret).update(payloadB64).digest("base64url");
}

/** Produces a self-contained `<payload>.<signature>` token — base64url-encoded JSON claims, HMAC-SHA256-signed with FILE_SIGNED_URL_SECRET. Throws if that env var is unset (same "never silently no-op" pattern as src/lib/secrets/crypto.ts's requireKey()) rather than issuing an unsigned or weakly-signed link. */
export function createSignedFileToken(input: CreateSignedFileTokenInput): string {
  const secret = requireSecret();
  const { expiresInSeconds, subdir, storageKey, filename, contentType } = input;
  const exp = Math.floor(Date.now() / 1000) + Math.max(1, Math.floor(expiresInSeconds));
  const claims: TokenClaims = { subdir, storageKey, filename, contentType, exp };
  const payloadB64 = Buffer.from(JSON.stringify(claims), "utf8").toString("base64url");
  const signature = sign(payloadB64, secret);
  return `${payloadB64}.${signature}`;
}

/** Verifies a token's HMAC signature (timing-safe) and expiry, returning its payload or null. Never throws — any tampering, expiry, or malformed input is indistinguishable from "no such link" to a caller, on purpose. */
export function verifySignedFileToken(token: string): SignedFilePayload | null {
  try {
    const secret = process.env.FILE_SIGNED_URL_SECRET;
    if (!secret) return null;

    const parts = token.split(".");
    if (parts.length !== 2) return null;
    const [payloadB64, signature] = parts;
    if (!payloadB64 || !signature) return null;

    const expected = Buffer.from(sign(payloadB64, secret), "base64url");
    const provided = Buffer.from(signature, "base64url");
    if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
      return null;
    }

    const decoded = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8")) as Partial<TokenClaims>;
    if (
      typeof decoded.subdir !== "string" ||
      typeof decoded.storageKey !== "string" ||
      typeof decoded.filename !== "string" ||
      typeof decoded.contentType !== "string" ||
      typeof decoded.exp !== "number"
    ) {
      return null;
    }
    if (decoded.exp < Math.floor(Date.now() / 1000)) return null;

    return { subdir: decoded.subdir, storageKey: decoded.storageKey, filename: decoded.filename, contentType: decoded.contentType };
  } catch {
    return null;
  }
}
