import NextAuth from "next-auth";
import { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import MicrosoftEntraID from "next-auth/providers/microsoft-entra-id";
import GitHub from "next-auth/providers/github";
import LinkedIn from "next-auth/providers/linkedin";
import Nodemailer from "next-auth/providers/nodemailer";
import { encode as defaultJwtEncode } from "next-auth/jwt";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { verify as verifyTotp } from "otplib";

import { prisma } from "@/lib/prisma";
import { getEnabledOAuthProviders } from "@/lib/auth/oauth-providers";
import { recordDeviceSession } from "@/lib/device-session";
import { checkRateLimitDegradable } from "@/lib/security/rate-limit-distributed";
import { verifyPassword, rehashIfNeeded } from "@/lib/auth/password";
import { decryptTwoFactorSecret } from "@/lib/auth/two-factor-crypto";
import { clientIpFromHeaders } from "@/lib/security/client-ip";
import { logSecurityEvent } from "@/lib/security/security-events";
import { reportIpReputationToSecurityEvents } from "@/lib/security/ip-reputation";
import { sendEmail } from "@/lib/email";
import { logAudit } from "@/lib/audit";
import { notifyUser } from "@/lib/notifications";

declare module "next-auth" {
  interface User {
    /** Carries the login form's "remember me" choice from authorize() into the jwt() callback. */
    remember?: boolean;
  }
}
declare module "next-auth/jwt" {
  interface JWT {
    rememberMe?: boolean;
    /**
     * Wall-clock ms timestamp of the sign-in that minted this token — set
     * once, only when `user` is present in the jwt() callback. Deliberately
     * NOT the JWT's own `iat` claim: @auth/core's encode() re-stamps `iat`
     * to "now" every time the token is re-signed on session refresh (see
     * session.js's `jwt.encode` call), so `iat` can't be used to detect
     * "was this token minted before the user hit Logout everywhere".
     */
    signedInAt?: number;
  }
}

/** Thrown by authorize() when a caller has exceeded the sign-in attempt cap. */
class RateLimitedSignin extends CredentialsSignin {
  code = "rate_limited";
}

/** Thrown when the account is locked out from too many recent failed attempts. */
class AccountLockedSignin extends CredentialsSignin {
  code = "account_locked";
}

/**
 * Thrown when the account has 2FA enabled and no (or an invalid) TOTP code
 * was submitted. The login page distinguishes these two codes to decide
 * whether to reveal a "enter your 6-digit code" field versus showing a hard
 * failure — see src/app/login/page.tsx.
 */
class TwoFactorRequiredSignin extends CredentialsSignin {
  code = "totp_required";
}
class TwoFactorInvalidSignin extends CredentialsSignin {
  code = "totp_invalid";
}

/**
 * Persistent lockout, independent of the rolling in-memory rate limiter
 * above (which is per-process and resets on deploy/restart). This is a real,
 * durable lock stored on the User row itself.
 */
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;

/** Real session-length distinction for "remember me": 1 day when unchecked, 30 days when checked (or omitted, e.g. OAuth/magic-link sign-ins which have no such checkbox). */
const REMEMBER_ME_MAX_AGE = 30 * 24 * 60 * 60;
const SESSION_ONLY_MAX_AGE = 24 * 60 * 60;

function clientIp(request: Request): string {
  return clientIpFromHeaders(request.headers);
}

/**
 * Every OAuth provider below is only pushed into the `providers` array when
 * its client id/secret env vars are actually present (per getEnabledOAuthProviders,
 * the same check the login/register pages use to decide which "Sign in with
 * X" button to render). This lets the app build and run today with ZERO
 * OAuth env vars configured (no login buttons for these render), and "just
 * work" the moment real credentials are added to the environment later — no
 * code changes needed.
 */
const enabledOAuthProviders = getEnabledOAuthProviders();
const oauthProviders = [
  ...(enabledOAuthProviders.google
    ? [
        Google({
          clientId: process.env.GOOGLE_CLIENT_ID!,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
        }),
      ]
    : []),
  ...(enabledOAuthProviders.microsoftEntraId
    ? [
        MicrosoftEntraID({
          clientId: process.env.MICROSOFT_ENTRA_ID_CLIENT_ID!,
          clientSecret: process.env.MICROSOFT_ENTRA_ID_CLIENT_SECRET!,
          // Optional — omitted, defaults to the multi-tenant "common" issuer
          // which allows any Microsoft account (personal/school/work) to sign in.
          ...(process.env.MICROSOFT_ENTRA_ID_TENANT_ID
            ? {
                issuer: `https://login.microsoftonline.com/${process.env.MICROSOFT_ENTRA_ID_TENANT_ID}/v2.0/`,
              }
            : {}),
        }),
      ]
    : []),
  ...(enabledOAuthProviders.github
    ? [
        GitHub({
          clientId: process.env.GITHUB_CLIENT_ID!,
          clientSecret: process.env.GITHUB_CLIENT_SECRET!,
        }),
      ]
    : []),
  ...(enabledOAuthProviders.linkedin
    ? [
        LinkedIn({
          clientId: process.env.LINKEDIN_CLIENT_ID!,
          clientSecret: process.env.LINKEDIN_CLIENT_SECRET!,
        }),
      ]
    : []),
];

/**
 * Magic-link (email) sign-in. Always registered — but its send step degrades
 * gracefully: with no EMAIL_SERVER configured (the default in this
 * environment, since no real SMTP credentials exist yet) it never attempts a
 * real send, it just logs the link to the server console and resolves
 * successfully. This keeps the magic-link flow fully testable end-to-end
 * without any SMTP credentials, and never throws/breaks the request.
 */
const emailProvider = Nodemailer({
  from: process.env.EMAIL_FROM ?? "no-reply@kvlgrowthos.local",
  // The Nodemailer provider factory throws if `server` is falsy, even though
  // our sendVerificationRequest below never actually uses it in the
  // no-EMAIL_SERVER dev fallback path — so this placeholder value only
  // exists to satisfy that constructor check and is otherwise inert.
  server: process.env.EMAIL_SERVER ?? "smtp://localhost:25",
  sendVerificationRequest: async ({ identifier, url }) => {
    if (!process.env.EMAIL_SERVER) {
      console.log(`[DEV] Magic link for ${identifier}: ${url}`);
      return;
    }

    const nodemailer = await import("nodemailer");
    const transport = nodemailer.createTransport(process.env.EMAIL_SERVER);
    await transport.sendMail({
      to: identifier,
      from: process.env.EMAIL_FROM ?? "no-reply@kvlgrowthos.local",
      subject: "Sign in to KVL GrowthOS",
      text: `Sign in to KVL GrowthOS: ${url}`,
      html: `<p>Sign in to <strong>KVL GrowthOS</strong> by clicking the link below:</p><p><a href="${url}">${url}</a></p><p>If you did not request this email, you can safely ignore it.</p>`,
    });
  },
});

/** Best-effort — a failed alert email must never break a real sign-in. */
async function sendNewDeviceAlert(email: string, ip: string, userAgent: string): Promise<void> {
  try {
    await sendEmail({
      to: email,
      subject: "New sign-in to your KVL GrowthOS account",
      text: `We noticed a sign-in to your account from a device we haven't seen before.\n\nIP address: ${ip}\nDevice: ${userAgent}\n\nIf this was you, no action is needed. If you don't recognize this activity, change your password immediately from Profile → Security.`,
    });
  } catch (error) {
    console.error("[auth] failed to send new-device alert:", error);
  }
}

/**
 * Crude, dependency-free proxy for "this login came from a different
 * network than usual": the IPv4 address's first two octets (a rough /16
 * network-prefix). This is NOT real geo-IP — two addresses sharing a /16
 * can be on opposite sides of the planet, and large ISPs/mobile carriers
 * using CGNAT can put the same user on a different /16 every session — it's
 * a best-effort approximation chosen because no IP geolocation dependency
 * exists in this codebase (src/lib/geo/ only geocodes street addresses via
 * Nominatim, it has no IP-lookup capability). Returns null for anything
 * that isn't a plain dotted-quad IPv4 address (IPv6, "unknown", etc.), so
 * those never participate in the comparison.
 */
function networkPrefix(ip: string): string | null {
  const parts = ip.split(".");
  if (parts.length !== 4 || !parts.every((part) => /^\d{1,3}$/.test(part))) return null;
  return `${parts[0]}.${parts[1]}`;
}

/** Best-effort — a failed alert email must never break a real sign-in. */
async function sendSuspiciousLoginAlert(email: string, ip: string, userAgent: string): Promise<void> {
  try {
    await sendEmail({
      to: email,
      subject: "Unusual sign-in activity detected",
      text: `We detected a sign-in to your account from both a new device AND a network we haven't seen you use before — a stronger signal than an ordinary new-device sign-in.\n\nIP address: ${ip}\nDevice: ${userAgent}\n\nIf this was you, no action is needed. If you don't recognize this activity, change your password immediately and use "Logout everywhere" from Profile → Security.`,
    });
  } catch (error) {
    console.error("[auth] failed to send suspicious-login alert:", error);
  }
}

/**
 * A second, distinct-from-the-new-device-email signal. Only ever called
 * (see authorize() below) when the caller has already established this is a
 * genuinely new device — this function adds the "AND unfamiliar network"
 * half of the check, so it fires strictly less often than the plain
 * new-device alert, on a stronger combined signal. Alert-only: never blocks
 * or delays the sign-in it's evaluating, same as the new-device check.
 */
async function detectSuspiciousLogin(
  userId: string,
  email: string,
  ip: string,
  userAgent: string,
  recentSessions: Array<{ ipAddress: string | null }>,
): Promise<void> {
  try {
    const prefix = networkPrefix(ip);
    if (!prefix) return;

    // No IP history yet to compare against (e.g. this user's very first
    // sign-in ever) — nothing to call "unfamiliar" relative to, so don't fire.
    if (recentSessions.length === 0) return;

    const knownPrefixes = new Set(
      recentSessions
        .map((s) => (s.ipAddress ? networkPrefix(s.ipAddress) : null))
        .filter((p): p is string => p !== null),
    );
    if (knownPrefixes.size === 0 || knownPrefixes.has(prefix)) return;

    await logAudit({ userId, action: "auth.suspicious_login_detected", ipAddress: ip, userAgent });

    // Notification requires an organizationId — look up any active
    // membership to notify the user in-app; the email alert below doesn't
    // need one and always sends regardless.
    const membership = await prisma.membership.findFirst({
      where: { userId, status: "ACTIVE" },
      orderBy: { createdAt: "asc" },
    });
    if (membership) {
      await notifyUser({
        userId,
        organizationId: membership.organizationId,
        type: "CRITICAL_ALERT",
        title: "Unusual sign-in activity detected",
        message: `A sign-in from a new device on an unfamiliar network was detected (IP ${ip}). If this wasn't you, change your password and use "Logout everywhere" in Profile → Security.`,
      });
    }

    await sendSuspiciousLoginAlert(email, ip, userAgent);
  } catch (error) {
    console.error("[auth] detectSuspiciousLogin failed:", error);
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
  },
  jwt: {
    // Real "remember me": a session-only sign-in expires in 1 day; a
    // remembered one in 30. @auth/core's default encode() always computes
    // exp from the `maxAge` passed to it (not from any exp already on the
    // token), so the only way to make this per-login is to override encode
    // itself and choose maxAge from the token's own rememberMe flag.
    encode: async (params) => {
      const maxAge = params.token?.rememberMe === false ? SESSION_ONLY_MAX_AGE : REMEMBER_ME_MAX_AGE;
      return defaultJwtEncode({ ...params, maxAge });
    },
  },
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
        // Optional: only required when the account has 2FA enabled. Left
        // empty on the first submit attempt; the login page re-submits with
        // it filled in once it sees a `totp_required` error code.
        code: { label: "Two-factor code", type: "text" },
        remember: { label: "Remember me", type: "text" },
      },
      authorize: async (credentials, request) => {
        const email = credentials?.email;
        const password = credentials?.password;
        const code = credentials?.code;
        const remember = credentials?.remember !== "false";
        if (typeof email !== "string" || typeof password !== "string") {
          return null;
        }

        // Cap sign-in attempts per email+IP before touching the password
        // hash at all — keyed on both so one bad actor can't lock out a
        // real user's email from a different IP, while still throttling a
        // single source hammering many emails. Real, multi-instance-correct
        // enforcement: prefers the Redis-backed distributed limiter
        // (src/lib/security/rate-limit-distributed.ts) so this cap is
        // shared across every app instance, not just the one that happened
        // to handle a given request; falls back to the in-memory limiter
        // (degrading gracefully, not failing open) if Redis is unreachable.
        const ip = clientIp(request);
        const rate = await checkRateLimitDegradable(`login:${email.toLowerCase()}:${ip}`, {
          limit: 10,
          windowMs: 10 * 60_000,
        });
        if (!rate.allowed) {
          throw new RateLimitedSignin("Too many sign-in attempts. Please try again in a few minutes.");
        }

        // Real IP reputation check (AbuseIPDB) — fire-and-forget, feeds the
        // existing SecurityEvent/Incident pipeline as an additional signal
        // alongside (never instead of) the crude /16-prefix heuristic below.
        // A genuine no-op ("Not Configured") when ABUSEIPDB_API_KEY is unset
        // — never blocks this sign-in attempt either way.
        reportIpReputationToSecurityEvents(ip, { detail: email, userAgent: request.headers.get("user-agent") });

        const user = await prisma.user.findUnique({ where: { email } });
        if (!user?.password) return null;

        // Persistent lockout check — independent of the rolling rate limiter
        // above, and not reset by a process restart.
        if (user.lockedUntil && user.lockedUntil > new Date()) {
          throw new AccountLockedSignin(
            "This account is temporarily locked after too many failed sign-in attempts. Please try again later or reset your password.",
          );
        }

        const isValid = await verifyPassword(password, user.password);
        if (!isValid) {
          const attempts = user.failedLoginAttempts + 1;
          const willLock = attempts >= MAX_FAILED_ATTEMPTS;
          if (willLock) {
            await prisma.user.update({
              where: { id: user.id },
              data: { failedLoginAttempts: 0, lockedUntil: new Date(Date.now() + LOCKOUT_MINUTES * 60_000) },
            });
          } else {
            await prisma.user.update({ where: { id: user.id }, data: { failedLoginAttempts: attempts } });
          }
          void logSecurityEvent({
            userId: user.id,
            type: willLock ? "BRUTE_FORCE_DETECTED" : "LOGIN_FAILED",
            severity: willLock ? "CRITICAL" : "WARNING",
            ipAddress: ip,
            userAgent: request.headers.get("user-agent"),
            detail: email,
          });
          return null;
        }

        if (user.twoFactorEnabled && user.twoFactorSecret) {
          if (typeof code !== "string" || code.trim().length === 0) {
            throw new TwoFactorRequiredSignin("Enter your two-factor authentication code.");
          }
          const secret = decryptTwoFactorSecret(user.twoFactorSecret);
          const result = await verifyTotp({ secret, token: code.trim(), epochTolerance: 30 });
          if (!result.valid) {
            // A correct password already proved possession of the account,
            // so a wrong TOTP code counts toward the same persistent
            // lockout as a wrong password — otherwise the IP-keyed rate
            // limiter above is the only thing standing between an attacker
            // who has phished/leaked a password and unlimited TOTP
            // guessing (6 digits is only ~1M possibilities).
            const attempts = user.failedLoginAttempts + 1;
            const willLock = attempts >= MAX_FAILED_ATTEMPTS;
            if (willLock) {
              await prisma.user.update({
                where: { id: user.id },
                data: { failedLoginAttempts: 0, lockedUntil: new Date(Date.now() + LOCKOUT_MINUTES * 60_000) },
              });
            } else {
              await prisma.user.update({ where: { id: user.id }, data: { failedLoginAttempts: attempts } });
            }
            void logSecurityEvent({
              userId: user.id,
              type: willLock ? "BRUTE_FORCE_DETECTED" : "LOGIN_FAILED",
              severity: willLock ? "CRITICAL" : "WARNING",
              ipAddress: ip,
              userAgent: request.headers.get("user-agent"),
              detail: `${email} (invalid TOTP)`,
            });
            throw new TwoFactorInvalidSignin("That code didn't match. Please try again.");
          }
        }

        // A genuinely valid sign-in — clear any accumulated failure count/lock.
        if (user.failedLoginAttempts > 0 || user.lockedUntil) {
          await prisma.user.update({ where: { id: user.id }, data: { failedLoginAttempts: 0, lockedUntil: null } });
        }

        // Transparent bcrypt->Argon2 migration: only ever re-hash a password
        // this exact call just verified as correct, never speculatively.
        const rehashed = await rehashIfNeeded(password, user.password);
        if (rehashed) {
          await prisma.user.update({ where: { id: user.id }, data: { password: rehashed } });
        }

        // Determine "is this a genuinely new device" BEFORE recordDeviceSession
        // creates/updates the row below — same (userId, userAgent) match it
        // uses internally — so the alert only fires the first time this
        // browser/device signs in, never on every ordinary sign-in.
        //
        // The recent-sessions lookup for detectSuspiciousLogin's network
        // check is fetched here too, for the same reason: it must run BEFORE
        // recordDeviceSession's fire-and-forget write below, otherwise that
        // write can race ahead and insert THIS sign-in's own row first,
        // which would make its own IP trivially "known" and silently
        // suppress the very alert it's supposed to trigger.
        const userAgent = request.headers.get("user-agent");
        const [priorDevice, recentSessions] = userAgent
          ? await Promise.all([
              prisma.deviceSession.findFirst({ where: { userId: user.id, userAgent } }),
              prisma.deviceSession.findMany({
                where: {
                  userId: user.id,
                  ipAddress: { not: null },
                  createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
                },
                select: { ipAddress: true },
              }),
            ])
          : [null, []];

        // Best-effort: enrich the DeviceSession row with the real IP/UA now,
        // since authorize() is the only credentials-flow call site that has
        // the incoming Request. events.signIn (below) still runs afterwards
        // and will find/update this same row rather than duplicating it.
        void recordDeviceSession(user.id, request);

        if (!priorDevice && userAgent && user.email) {
          void sendNewDeviceAlert(user.email, ip, userAgent);
          void detectSuspiciousLogin(user.id, user.email, ip, userAgent, recentSessions);
        }

        return { id: user.id, name: user.name, email: user.email, image: user.image, remember };
      },
    }),
    ...oauthProviders,
    emailProvider,
  ],
  callbacks: {
    jwt: async ({ token, user }) => {
      // Only the Credentials flow ever sets `user.remember` — OAuth/magic-link
      // sign-ins have no such checkbox, so they fall back to the longer,
      // "remembered" default rather than surprising a user with a 1-day OAuth
      // session.
      if (user) {
        token.rememberMe = user.remember ?? true;
        token.signedInAt = Date.now();
      }

      // Real "Logout everywhere" for stateless JWT sessions: this callback
      // runs on every session check (see @auth/core's session action, which
      // re-signs the token on every request, not just at sign-in), so it's
      // the one place a JWT minted before a mass-logout can be caught and
      // rejected. Returning null here makes the session action drop the
      // session cookie and treat the request as signed out — see
      // node_modules/@auth/core/lib/actions/session.js's `if (token !== null)`
      // branch.
      if (token.sub) {
        const currentUser = await prisma.user.findUnique({
          where: { id: token.sub },
          select: { sessionInvalidatedAt: true },
        });
        if (
          currentUser?.sessionInvalidatedAt &&
          (!token.signedInAt || currentUser.sessionInvalidatedAt.getTime() > token.signedInAt)
        ) {
          return null;
        }
      }

      return token;
    },
    session: async ({ session, token }) => {
      if (session.user && token.sub) {
        session.user.id = token.sub;
      }
      return session;
    },
  },
  events: {
    // Best-effort DeviceSession bookkeeping. Auth.js's events.signIn message
    // only carries { user, account, profile, isNewUser } — no Request/IP/UA
    // is available here in ANY provider flow (credentials, OAuth, or email) —
    // so this records a "bare" row (no ipAddress/userAgent) just to
    // guarantee a DeviceSession always exists for every sign-in. Route
    // handlers/middleware that DO have the incoming Request should call
    // `recordDeviceSession(userId, request)` from "@/lib/device-session"
    // directly to enrich that same row with real ipAddress/userAgent — see
    // that file's top comment for the full rationale.
    signIn: async ({ user }) => {
      if (!user.id) return;
      try {
        await recordDeviceSession(user.id);
      } catch (error) {
        console.error("[auth] events.signIn device session bookkeeping failed:", error);
      }
    },
  },
});
