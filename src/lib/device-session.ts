import { prisma } from "@/lib/prisma";

/**
 * DeviceSession is populated from two places, by design:
 *
 * 1. `events.signIn` in src/auth.ts calls this on every successful sign-in
 *    (any provider). Auth.js's `events.signIn` message only carries
 *    `{ user, account, profile, isNewUser }` — no Request/IP/User-Agent is
 *    exposed there in any provider flow — so that call site records a "bare"
 *    row (no ipAddress/userAgent) purely to guarantee a row always exists.
 * 2. Route handlers / middleware that DO have the incoming `Request` (e.g.
 *    the credentials login route, or a dedicated post-auth route) should
 *    call `recordDeviceSession(userId, request)` directly so the row gets a
 *    real ipAddress/userAgent/deviceName. This function upserts by
 *    (userId, userAgent) heuristically — see below — so calling it again
 *    after the bare `events.signIn` row just enriches the same "device"
 *    rather than creating a duplicate every time.
 *
 * This is intentionally best-effort: callers should never let a failure
 * here block a sign-in.
 *
 * `fingerprintHash` (optional, third bucket of matching below) is a real
 * composite client-side fingerprint — SHA-256 of timezone + screen
 * resolution + platform + hardwareConcurrency, collected in the browser by
 * src/lib/device-fingerprint.ts and submitted via `submitDeviceFingerprint`
 * (src/app/profile/actions.ts) shortly after the page loads. It can never
 * be known at sign-in time itself (no client JS has run yet), so it always
 * arrives as a follow-up call against an already-existing row, keyed by
 * userId + userAgent, same as the enrichment call above — this is an
 * additional signal layered on top of that heuristic, not a replacement
 * for it: a User-Agent string alone is identical across every install of
 * the same browser/OS, so two different physical devices can share one
 * DeviceSession row; the fingerprint at least distinguishes them going
 * forward for any code that chooses to compare it.
 */
export async function recordDeviceSession(
  userId: string,
  request?: Request | { headers: Headers | Record<string, string | null | undefined> } | null,
  fingerprintHash?: string,
): Promise<void> {
  try {
    const headers = extractHeaders(request);
    const userAgent = headers.get("user-agent") ?? undefined;
    const ipAddress = extractIp(headers) ?? undefined;

    // Look for a recent matching session for this user+device to update
    // in-place instead of growing the table unbounded on every sign-in.
    let existing = userAgent
      ? await prisma.deviceSession.findFirst({
          where: { userId, userAgent },
          orderBy: { lastActiveAt: "desc" },
        })
      : null;

    // No User-Agent available (e.g. the "bare" call from events.signIn,
    // which Auth.js gives no Request context to in ANY provider flow) —
    // this is likely the SAME sign-in that a moment ago already recorded an
    // enriched row via a route/callback that did have the Request (e.g.
    // Credentials' authorize()). Bump that just-created row instead of
    // inserting a second, redundant "device" for one physical sign-in.
    // Anything older than this window is treated as a genuinely new sign-in
    // event (the best we can do for OAuth/email flows, which never get a
    // Request here at all).
    if (!existing && !userAgent) {
      const recent = await prisma.deviceSession.findFirst({
        where: { userId, createdAt: { gte: new Date(Date.now() - 30_000) } },
        orderBy: { createdAt: "desc" },
      });
      existing = recent;
    }

    // A bare fingerprint-only follow-up call (no Request at all) — match
    // whichever of this user's devices was active most recently, since
    // that's overwhelmingly the browser tab that just ran the fingerprint
    // script.
    if (!existing && !userAgent && !request && fingerprintHash) {
      existing = await prisma.deviceSession.findFirst({
        where: { userId },
        orderBy: { lastActiveAt: "desc" },
      });
    }

    if (existing) {
      await prisma.deviceSession.update({
        where: { id: existing.id },
        data: {
          lastActiveAt: new Date(),
          ipAddress: ipAddress ?? existing.ipAddress,
          fingerprintHash: fingerprintHash ?? existing.fingerprintHash,
        },
      });
      return;
    }

    await prisma.deviceSession.create({
      data: { userId, userAgent, ipAddress, fingerprintHash },
    });
  } catch (error) {
    console.error("[device-session] failed to record device session:", error);
  }
}

function extractHeaders(
  request?: Request | { headers: Headers | Record<string, string | null | undefined> } | null,
): Headers {
  if (!request) return new Headers();
  const raw = request.headers;
  if (raw instanceof Headers) return raw;
  const headers = new Headers();
  for (const [key, value] of Object.entries(raw ?? {})) {
    if (typeof value === "string") headers.set(key, value);
  }
  return headers;
}

function extractIp(headers: Headers): string | null {
  const forwardedFor = headers.get("x-forwarded-for");
  if (forwardedFor) return forwardedFor.split(",")[0]?.trim() ?? null;
  return headers.get("x-real-ip");
}
