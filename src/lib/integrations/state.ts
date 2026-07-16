import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Signs/verifies the OAuth `state` param so the callback route can recover
 * which organization/user initiated the connect flow without trusting an
 * unsigned client-supplied value (CSRF/tampering protection). Reuses
 * AUTH_SECRET (already required for NextAuth) rather than introducing a new
 * env var — this is a distinct HMAC purpose, not a shared cipher key.
 */
interface StatePayload {
  organizationId: string;
  userId: string;
  nonce: string;
}

function getSecret(): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET must be set.");
  return secret;
}

export function signState(organizationId: string, userId: string): string {
  const payload: StatePayload = { organizationId, userId, nonce: randomBytes(8).toString("hex") };
  const json = JSON.stringify(payload);
  const encoded = Buffer.from(json, "utf8").toString("base64url");
  const signature = createHmac("sha256", getSecret()).update(encoded).digest("base64url");
  return `${encoded}.${signature}`;
}

export function verifyState(state: string): StatePayload | null {
  const [encoded, signature] = state.split(".");
  if (!encoded || !signature) return null;

  const expected = createHmac("sha256", getSecret()).update(encoded).digest("base64url");
  const expectedBuf = Buffer.from(expected);
  const actualBuf = Buffer.from(signature);
  if (expectedBuf.length !== actualBuf.length || !timingSafeEqual(expectedBuf, actualBuf)) return null;

  try {
    return JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as StatePayload;
  } catch {
    return null;
  }
}
