# Passkey / Enterprise SSO — architecture readiness

Documentation only. No WebAuthn/passkey implementation code was added in
this pass — building a real, tested WebAuthn ceremony (registration +
authentication, attestation handling, cross-device/roaming authenticator
support) is a genuinely large feature, out of scope here. This document is
honest about what exists **now**, what is **architecturally ready** for a
future addition, and what still needs **new work**.

## What exists NOW (real, working today)

`src/auth.ts` configures NextAuth v5 (`next-auth`) with:

- **Credentials** (email + Argon2id/bcrypt password, optional TOTP 2FA).
- **Google** OAuth (`next-auth/providers/google`), registered only when
  `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` are set.
- **Microsoft Entra ID** OAuth (`next-auth/providers/microsoft-entra-id`),
  registered only when `MICROSOFT_ENTRA_ID_CLIENT_ID`/`_CLIENT_SECRET` are
  set, with an optional single-tenant issuer override via
  `MICROSOFT_ENTRA_ID_TENANT_ID`.
- **GitHub** OAuth (`next-auth/providers/github`).
- **Nodemailer** magic-link email sign-in.

**This IS a real form of SSO today**: any organization whose users have
Google Workspace or Microsoft 365/Entra ID accounts can sign in via that
provider instead of a local password — no separate account required. What
is is **not** yet: a per-organization-configurable SAML/OIDC custom identity
provider, and there is no passkey/WebAuthn provider.

The Prisma schema already contains an `Authenticator` model
(`prisma/schema.prisma`):

```prisma
model Authenticator {
  credentialID         String  @unique
  userId               String
  providerAccountId    String
  credentialPublicKey  String
  counter              Int
  credentialDeviceType String
  credentialBackedUp   Boolean
  transports           String?

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@id([userId, credentialID])
}
```

This model exists because `@auth/prisma-adapter` (already in use — see
`PrismaAdapter(prisma)` in `src/auth.ts`) ships this exact shape for
WebAuthn support out of the box. **It is currently unused** — no code reads
or writes it, and `User.authenticators` is not exercised anywhere. Its
presence means the data-layer half of passkey support is already in place;
none of the runtime/ceremony half is.

## What a FUTURE passkey/WebAuthn provider would require (new work)

1. **A WebAuthn provider for next-auth.** Auth.js v5 does not ship a
   first-party Passkey provider as of this writing the way it ships
   Credentials/OAuth — this would mean either using a community WebAuthn
   provider package, or hand-rolling ceremony endpoints with a library like
   `@simplewebauthn/server` (registration options → client
   `navigator.credentials.create()` → verify + persist to the existing
   `Authenticator` table; authentication options → client
   `navigator.credentials.get()` → verify against the stored public key).
2. **New route handlers** under `src/app/api/auth/passkey/` (or similar)
   for the two ceremonies above — these need to run as real route handlers
   (not Server Actions), since WebAuthn's `rpId`/`origin` checks need direct
   control over the request/response and because the browser-side
   `navigator.credentials` API needs a plain JSON challenge/response
   round-trip.
3. **UI**: a "Sign in with a passkey" button on `src/app/login/page.tsx`
   alongside the existing Credentials/OAuth buttons, and a passkey
   management section in `src/app/profile/_components/security-section.tsx`
   (list registered authenticators, allow adding/removing one) — mirroring
   the existing `device-sessions-list.tsx` UI pattern already in that
   directory.
4. **`proxy.ts` CSRF exemption review**: the new ceremony endpoints are
   same-origin browser calls (not third-party webhook calls), so they
   should stay covered by the existing CSRF check in `src/proxy.ts` — no
   change needed there, just confirmed during implementation.
5. **SecurityEvent wiring**: a passkey registration/removal is exactly the
   kind of event `logSecurityEvent` (`src/lib/security/security-events.ts`)
   already exists to record — a real future call site, not a new logging
   system.

None of the above exists today. Claiming passkey support without doing this
work would be dishonest.

## What a FUTURE enterprise SAML/OIDC custom-IdP-per-organization SSO would require (new work)

Today, OAuth sign-in (Google/Microsoft/GitHub) is configured **once,
globally, for the whole deployment** via env vars — every organization on
this platform shares the same three OAuth apps. Real "enterprise SSO" in
the B2B sense (a customer's own Okta/Azure AD/OneLogin/PingFederate acting
as IdP, configured per-organization) is architecturally different and would
require:

1. **A per-organization IdP configuration model** — nothing like this
   exists in `prisma/schema.prisma` today. It would need at minimum:
   `organizationId`, protocol (`SAML` | `OIDC`), issuer/entity ID, SSO URL,
   IdP's signing certificate (SAML) or client id/secret + discovery URL
   (OIDC), and which `MembershipRole` new just-in-time-provisioned users
   should default to.
2. **Dynamic provider registration.** `next-auth`'s `providers` array in
   `src/auth.ts` is currently built once, statically, at module load (see
   the `oauthProviders` array, gated only by env vars present at boot) —
   there is no per-request "look up this organization's IdP config and
   build a provider for it" path today. Auth.js v5 does support building a
   provider list dynamically per-request in the route handler (rather than
   the static config passed to `NextAuth(...)`), but this app does not do
   that today — it would be new plumbing, not a config tweak.
3. **A discovery step**: the login page needs to know WHICH organization's
   IdP to redirect to before OAuth/SAML even starts — typically an
   "enter your work email" step that looks up the domain (or an org
   slug/subdomain) against the new per-org IdP config table, then redirects
   into that specific IdP's SAML/OIDC flow.
4. **An Assertion Consumer Service (ACS) endpoint** for SAML specifically —
   a route handler that accepts the IdP's POSTed SAML response, verifies
   its signature against that organization's stored IdP certificate, and
   maps the assertion's attributes to a `User`/`Membership`. This is a new
   route, new signature-verification code, and a new mapping layer — none
   of which exists today. (OIDC-based enterprise IdPs are closer to the
   existing OAuth path — mostly "one more dynamically-configured OAuth
   client" — but SAML is a materially new protocol surface.)
5. **Just-in-time provisioning rules**: what `MembershipRole` a new user
   gets when they first arrive via their org's IdP, and how that intersects
   with the existing `Membership`/`MembershipStatus` model — a real product
   decision, not just a technical one.

## Summary table

| Capability | Status |
|---|---|
| OAuth-based SSO (Google / Microsoft Entra ID / GitHub) | **Exists now**, real, working |
| Magic-link email sign-in | **Exists now**, real, working |
| `Authenticator` (WebAuthn/passkey) data model | **Exists in schema**, unused — architecturally ready, zero runtime code |
| Passkey/WebAuthn sign-in ceremony | **Does not exist** — needs a provider/library, new routes, new UI |
| Per-organization SAML/OIDC custom IdP | **Does not exist** — needs a new config model, dynamic provider registration, ACS endpoint (SAML), and a discovery step |

This document should be revisited (and this table updated) the moment any
of the "does not exist" rows gets real implementation work.
