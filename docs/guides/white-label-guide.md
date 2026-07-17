# KVL GrowthOS — White Label Guide

> A real inventory of white-label branding — which surfaces apply it, sourced from `src/lib/white-label/`.

## 1. Single source of truth — `getEffectiveBranding()`

`src/lib/white-label/resolve-brand.ts` is the one function every surface below calls. It resolves real `WhiteLabelSettings` values only when **both**:

1. the org's real, current `Plan.whiteLabelAccess` is true (re-checked live, not just at the settings-page gate — a downgraded org silently stops receiving white-labeled output the moment its plan no longer includes the feature), and
2. `WhiteLabelSettings.enabled` is true.

Otherwise it returns the honest platform default (`isWhiteLabeled: false`, brand name `"KVL GrowthOS"`, no logo/colors). The full, real `EffectiveBranding` interface returned:

```ts
export interface EffectiveBranding {
  isWhiteLabeled: boolean;
  brandName: string;
  logoUrl: string | null;
  faviconUrl: string | null;
  primaryColor: string | null;
  secondaryColor: string | null;
  fontFamily: string | null;
  customLoginHeadline: string | null;
  emailFromName: string | null;
  emailFromAddress: string | null;
  pdfFooterText: string | null;
}
```

`isWhiteLabeled` is the one reliable signal every caller checks — never a string comparison against the default brand name. `logoUrl`/`faviconUrl` aren't stored URLs — they're computed on the fly as `/api/white-label/assets/${organizationId}/{logo|favicon}` whenever the corresponding storage key column is non-null. `getWhiteLabelEmailFrom(organizationId)` returns `null` unless **both** `emailFromName` and `emailFromAddress` are set.

`resolve-brand.ts` also exports `resolveBrandByHost(host)` — a host-only wrapper for the pre-login pages in §2, where no `organizationId` exists yet. It normalizes the request's `Host` header (strips a `:port` suffix, lowercases), looks up a `CustomDomain` row by that exact hostname, and — **only when that row's `status` is `VERIFIED`** — delegates to `getEffectiveBranding(customDomain.whiteLabelSettings.organizationId)`. A `PENDING`/`FAILED` row, or no matching row at all, returns the same honest default `getEffectiveBranding()` returns for any non-white-labeled org; a merely-added-but-unverified domain never leaks another org's branding, since the row's existence alone doesn't prove DNS control of that hostname (see §5).

`resolve-brand.ts`'s own top comment on `getEffectiveBranding()` matches this reality — it names every surface in §2 (dashboard chrome, client portal, PDF footers, transactional email, and — via `resolveBrandByHost()` — the public pre-login pages) as genuinely wired in, with only the dashboard-shell favicon called out as the one remaining gap (see §7).

## 2. Where it's actually applied

| Surface | File | Behavior |
|---|---|---|
| Dashboard chrome | `src/app/dashboard/layout.tsx` | Header logo/wordmark swaps to the org's real uploaded logo when white-labeled, falling back to a `LogoMark` + literal "KVL" when unbranded |
| Client Portal | `src/app/portal/layout.tsx` | The one surface a client actually sees this app's own branding on by default (no hardcoded "KVL GrowthOS" here even unbranded — the file's own comment notes this page never did) — shows the agency's real logo next to the client name when enabled; unauthenticated visitors skip the branding call entirely |
| Public pre-login pages | `src/app/login/page.tsx`, `src/app/register/page.tsx`, `src/app/forgot-password/page.tsx`, `src/app/reset-password/page.tsx`, `src/app/portal/login/page.tsx` | No session exists yet at this point, so each of these (Server Component) pages reads the real request `Host` header via `next/headers` and resolves branding through `resolveBrandByHost(host)` (see §1) instead of `getEffectiveBranding(organizationId)`. Renders the matched org's real logo + brand name (`PublicBrandHeader`, `src/components/brand/public-brand-header.tsx`) above the form, overrides the `--primary` CSS variable with the org's `primaryColor` (`brandThemeStyle()`, same file), and — on the login page and the portal login page only — swaps in `customLoginHeadline` for the welcome copy. Falls back to the exact pre-existing unbranded UI when the host doesn't match a *verified* `CustomDomain` row |
| PDF documents | `src/app/dashboard/proposal/_lib/document-resolver.ts` | Proposals, quotations, contracts, invoices, and business documents render the white-label brand name/logo/footer text instead of the plain `Organization.name`/logo — `WhiteLabelSettings.pdfFooterText` overrides the default (which falls back to the org name). Its internal `resolveBrand()` always preserves the org's real `gstNumber`/`registrationNumber`/`currency` regardless of white-label status — those are legal/tax identifiers, never overridden by branding |
| Transactional email | `src/lib/email.ts` (`emailOrganizationOwners()`), `src/app/onboarding/invite/actions.ts`, `src/lib/outreach/email-provider.ts` (Resend/SMTP paths) | `getWhiteLabelEmailFrom()` supplies a real `From: "Brand Name" <brand@domain>` header when both `emailFromName` and `emailFromAddress` are set; Gmail/Outlook-sent outreach email already uses the org's own real connected mailbox address, which needs no override |
| Marketplace | `src/lib/marketplace/installers/white-label-pack.ts` | Read-merge-write into `templateOverrides` — the one install path that writes into this model |
| Billing | Real per-currency `Plan` pricing (see the Marketplace/Billing sections of the Architecture Guide) — an org is charged in its own currency regardless of white-label status; white-labeling only ever changes display branding, never pricing/tax identifiers |

## 3. `WhiteLabelSettings` — the real model and where uploads live

`src/lib/white-label/settings.ts` (not just `resolve-brand.ts`) is where the settings CRUD and the real upload implementation live: `getWhiteLabelSettings()`, `upsertWhiteLabelSettings()`, and `uploadWhiteLabelLogo()`.

```prisma
model WhiteLabelSettings {
  id                  String  @id @default(cuid())
  organizationId      String  @unique
  brandName           String?
  logoStorageKey      String? @db.Text
  faviconStorageKey   String? @db.Text
  primaryColor        String?
  secondaryColor      String?
  fontFamily          String?
  customLoginHeadline String?
  emailFromName       String?
  emailFromAddress    String?
  pdfFooterText       String?
  templateOverrides   Json?
  enabled             Boolean @default(false)
  organization Organization   @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  domains      CustomDomain[]
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

`logoStorageKey`/`faviconStorageKey` hold a disk storage key, never a public URL directly — `resolve-brand.ts` is the only place that turns a key into the served asset route.

**Upload mechanics, end to end**: `uploadWhiteLabelLogo(organizationId, file, kind)` validates a non-empty file, a size cap (2 MB for logos, 512 KB for favicons), and a content-type allowlist of `png`/`jpeg`/`webp`/`gif`/`x-icon`/`vnd.microsoft.icon` — **deliberately no SVG**, documented as an XSS mitigation since the asset is served inline (no `Content-Disposition: attachment`). It deletes any previous file for that `kind` first, then saves via `saveWhiteLabelAsset()` → `src/lib/storage/white-label-assets.ts` → the shared `createFileStore("white-label-assets")` (`src/lib/storage/file-store.ts`), which writes to local disk under `storage/white-label-assets/<organizationId>/<kind>-<filename>` — **never** `public/** ` — optionally AES-256-GCM-encrypted at rest if `FILE_STORAGE_ENCRYPTION_KEY` is set (a `"KVLENC1"` magic prefix distinguishes encrypted from legacy plaintext files, so setting the key later never corrupts older uploads). The returned `storageKey` is persisted onto `logoStorageKey`/`faviconStorageKey` via upsert.

Assets are served back only via `GET /api/white-label/assets/[organizationId]/[kind]/route.ts` — it requires an authenticated session with an `ACTIVE` membership in that exact organization (404s otherwise, deliberately not 403, so the route never confirms whether an org id exists), infers `Content-Type` from the storage key's file extension, and sets `Cache-Control: private, max-age=60`.

**Honest gap, verified by a repo-wide grep**: `secondaryColor` and `fontFamily` are captured by the settings form and returned by `getEffectiveBranding()`, but no caller outside `resolve-brand.ts`/the form itself/the generated Prisma types actually reads them — they are stored and round-tripped, but not yet rendered anywhere in the app. `primaryColor` and `customLoginHeadline` are no longer in that category: the public pre-login pages in §2 read `primaryColor` (as a `--primary` CSS variable override) and `customLoginHeadline` (as the login page's/portal login page's welcome copy) directly.

## 4. Settings UI — `/dashboard/settings/white-label`

`page.tsx` gates on `getWhiteLabelPlanAccess()`: without `whiteLabelAccess` it shows an upgrade card ("Available on the Business plan and above") linking to `/dashboard/billing/subscriptions`; with it but without `customDomainAccess`, the custom-domains panel is replaced with its own upsell card.

`_components/brand-settings-form.tsx` is a single multipart form, disabled entirely for non-OWNER/ADMIN roles (Save is hidden outright for them). Real fields: Brand name (text, max 120 chars), Logo upload (`accept="image/png,image/jpeg,image/webp,image/gif"`, live client-side preview), Favicon upload (`accept="image/png,image/x-icon,image/vnd.microsoft.icon"`), Primary/Secondary color (`<input type="color">`, defaults `#3b82f6`/`#8b5cf6`), Font family (`<select>` restricted to a fixed `WHITE_LABEL_FONT_FAMILIES` list), Custom login headline (text, max 200), Email from name (text, max 120), Email from address (`type="email"`, max 200), PDF footer text (text, max 500), and an Enable checkbox.

`actions.ts` exposes 4 Server Actions, each gated by `requirePrivileged()` (OWNER/ADMIN) **and** a redundant plan-access re-check (defense in depth against a form-bypass POST), each writing its own `logAudit()` entry: `updateBrandSettingsAction` (`white_label.settings_updated`), `addCustomDomainAction` (`white_label.domain_added`), `verifyCustomDomainAction` (`white_label.domain_verify_attempted`, logs the real `verified`/`detail` result), `removeCustomDomainAction` (`white_label.domain_removed`).

## 5. Custom domains — `src/lib/white-label/domains.ts`

Real TXT-record DNS verification for a `CustomDomain` row, using Node's built-in `node:dns/promises` `resolveTxt()` — no external DNS library. The expected record: `_kvlgrowthos-verify.<domain>` (the `VERIFICATION_SUBDOMAIN_PREFIX`) set to a 32-character hex `verificationToken` (`randomBytes(16).toString("hex")`). `verifyCustomDomain()` returns `{verified, detail}` and never sets `status: "FAILED"` on a DNS miss — a lookup error (NXDOMAIN, timeout, etc.) is reported honestly in `detail` while status stays `PENDING`; only a genuine matching TXT record flips it to `VERIFIED`.

```prisma
model CustomDomain {
  id                   String                   @id @default(cuid())
  whiteLabelSettingsId String
  domain               String                   @unique
  verificationToken    String
  status               DomainVerificationStatus @default(PENDING)
  verifiedAt           DateTime?
  sslIssuedAt          DateTime?
  whiteLabelSettings WhiteLabelSettings @relation(fields: [whiteLabelSettingsId], references: [id], onDelete: Cascade)
  createdAt DateTime @default(now())
  @@index([whiteLabelSettingsId])
}
```

`DomainVerificationStatus`: `PENDING`, `VERIFIED`, `FAILED`. Hostname validation (`addCustomDomainSchema`, `src/lib/validations/white-label.ts`) requires at least one dot, rejects a protocol prefix (`http://`), rejects IPv4-shaped input, and rejects `localhost`/`*.localhost`. `addCustomDomain()` catches a unique-constraint collision (Prisma `P2002`) on the `domain` column and throws a friendly "already registered to an organization on this platform" error rather than leaking which org owns it. `removeCustomDomain()` silently no-ops if the domain doesn't belong to the calling org, for the same reason.

**SSL issuance is a deliberate, documented stub** — `src/lib/white-label/ssl-provider.ts` always throws:

```ts
throw new Error(
  `SSL certificate issuance for "${domain}" is not implemented — wire in your hosting platform's domain API ` +
    `(e.g. Vercel Domains API, Cloudflare for SaaS) or a running ACME/Let's Encrypt client with control over ` +
    `the TLS termination layer in front of this deployment.`,
);
```

`CustomDomain.sslIssuedAt` stays null until a real hosting-platform/ACME integration is wired in — the file's own comment states nothing in this codebase should ever fabricate an "issued" state. The settings UI echoes this to the user directly once a domain is verified. A custom domain without that integration can be DNS-verified but cannot yet serve real HTTPS from this codebase alone; front it with a reverse proxy (nginx + certbot, Cloudflare, or your hosting platform's own TLS termination) in the meantime — see the Deployment Guide. No ACME/Let's Encrypt/Vercel Domains/Cloudflare-for-SaaS env var exists anywhere in `.env.example`, consistent with this being a real, unimplemented stub rather than a hidden integration.

## 6. Plan gating — `src/lib/white-label/plan-access.ts`

A direct `BillingAccount.currentPlan.{whiteLabelAccess,customDomainAccess}` read (not the generic feature-flag cascade) — precise and always reflects the org's real, current plan. Both columns are independent: a plan can grant branding without a custom domain, or vice versa. The real, seeded values per `PlanTier` (`src/lib/billing/plan-catalog.ts`):

| Tier | `whiteLabelAccess` | `customDomainAccess` |
|---|---|---|
| FREE | false | false |
| STARTER | false | false |
| PROFESSIONAL | false | false |
| BUSINESS | true | true |
| ENTERPRISE | true | true |
| CUSTOM | true | true |

`CUSTOM` is the manually-negotiated, never-self-service tier a platform operator assigns directly — its seed entry grants every feature and unlimited limits by default, which is why it also carries both white-label flags. `ensurePlansSeeded()` seeds one `Plan` row per tier × billing interval (`MONTHLY` always; `YEARLY` for STARTER/PROFESSIONAL/BUSINESS/ENTERPRISE at exactly 10× the monthly price) × each of the 10 supported currencies (`USD, EUR, GBP, INR, AED, SAR, CAD, AUD, SGD, JPY`).

## 7. What's honestly not covered yet

Per-organization favicon on the *authenticated* dashboard shell (`src/app/dashboard/layout.tsx` never emits a per-request `<link rel="icon">` from `branding.faviconUrl`, unlike the pre-login pages' host-based resolution) remains platform-default — wiring it in would mean generating per-request `<link>` tags from `generateMetadata` using the same session-based `getEffectiveBranding()` call the layout already makes; a real, bounded scope limit, not attempted here.

Separately, as noted in §3, `secondaryColor`/`fontFamily` are captured and persisted by the settings form but not yet consumed by any rendering surface — a real gap between "the settings exist" and "the settings visibly do anything," distinct from the SSL stub above (which is a documented incompleteness) and from the stale "not wired in" comment on `resolve-brand.ts` (which understates what actually *is* wired in for logo/favicon/PDF/email/pre-login-page branding).
