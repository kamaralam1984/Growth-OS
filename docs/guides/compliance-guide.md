# KVL GrowthOS — Compliance Guide

> A real inventory of this app's compliance-readiness tooling, sourced from the actual files listed below — never a certification claim. See each section's own disclaimer.

## 1. Compliance Readiness Reports — `src/lib/security/compliance.ts`

`generateComplianceReport(framework)` runs a real, code-verifiable control check per framework (`SOC2`, `ISO27001`, `GDPR`, `CCPA`, `DPDP_INDIA`, `PCI_DSS`, `WCAG` — the `ComplianceFramework` enum) and persists a `ComplianceReport` row. Every control is either:

- `verificationMethod: "code"` — a real, live check: a DB round-trip, a live Argon2/TOTP/rate-limiter functional test, or a bounded source-file scan run at generation time.
- `verificationMethod: "manual"` — honestly documented as legal/organizational (a signed DPA, a third-party auditor's opinion) with `verified: false`, never used to inflate `status`.

`status` (`READY` / `PARTIAL` / `NOT_READY`) is computed **only** from `"code"` controls (`computeStatus()`): zero code controls or zero passing → `NOT_READY`; all passing → `READY`; otherwise `PARTIAL`. This report is a real architectural-readiness snapshot, not a SOC2/ISO27001 certification or a PCI DSS Attestation of Compliance; those require an accredited third-party auditor. Regenerate anytime from `/admin/compliance` (platform-owner only) — every call re-runs every control live, no caching. The Prisma schema's own comment on `ComplianceReport` puts it plainly: *"This app is not SOC2/ISO27001-CERTIFIED by generating this row — it records ARCHITECTURAL READINESS for that certification process."*

### The real control checks, by function

Each is independently `try`/`catch`ed so one failing check never crashes report generation.

| Function | Control | What it actually checks | Method |
|---|---|---|---|
| `checkEncryptionAtRest()` | Encryption at rest (5 AES-256-GCM key domains) | 5 env vars present and exactly 64 hex chars: `AGENT_MEMORY_ENCRYPTION_KEY`, `INTEGRATION_TOKEN_ENCRYPTION_KEY`, `SECRETS_MANAGER_ENCRYPTION_KEY`, `WEBHOOK_SECRET_ENCRYPTION_KEY`, `TWO_FACTOR_SECRET_ENCRYPTION_KEY` | code |
| `checkFileStorageEncryption()` | Uploaded file encryption at rest | `FILE_STORAGE_ENCRYPTION_KEY` present and 64 chars (gates `createFileStore()`) | code |
| `checkEncryptionInTransit()` | Encryption in transit (TLS/HSTS) | Always `verified: false` — TLS termination is infra-level; notes the app does send an HSTS header in production (`src/proxy.ts`) | manual |
| `checkPasswordHashing()` | Password hashing strength (Argon2id) | Live `hashPassword()` call, confirms the result starts with `$argon2id$`; notes bcrypt hashes transparently re-hash to Argon2id on next login | code |
| `checkAuditAndSecurityLogging()` | Immutable audit & security-event logging | Live `Promise.all([prisma.auditLog.count(), prisma.securityEvent.count()])` | code |
| `checkRbac()` | Role-based access control | Confirms `MembershipRole` contains OWNER/ADMIN/VIEWER | code |
| `checkAbacPolicyLayer()` | ABAC (tenant isolation + read-only roles) | Live functional test of `canAccessResource()`: cross-org write denied, VIEWER write denied, same-org OWNER write allowed | code |
| `checkTwoFactorAuth()` | Two-factor authentication (TOTP) | Live otplib generate/verify round-trip; enforced at sign-in via `twoFactorEnabled` in `src/auth.ts` | code |
| `checkAccountLockoutAndBruteForce()` | Account lockout & brute-force detection | Live `securityEvent.count({type:"BRUTE_FORCE_DETECTED"})` + a `user` lockout-field read | code |
| `checkRateLimiting()` | Rate limiting (in-memory + Redis-backed distributed) | Live functional test: two calls at `{limit:1, windowMs:5000}` against the same key — first allowed, second must block; notes it fails **open** if Redis is unreachable | code |
| `checkIncidentResponseProcess()` | Incident tracking & response | Live `Promise.all([prisma.incident.count(), prisma.incidentUpdate.count()])`; notes CRITICAL `SecurityEvent`s auto-open/append an `Incident` via `ensureIncidentForCriticalEvent()` | code |
| `checkDataRetentionPolicy()` | Automated data retention policy | Reads `src/lib/scheduler/registry.ts` source and checks for the string `"audit-log-retention-cleanup"` | code |
| `checkCookieConsent()` | Cookie consent banner | Reads the banner/lib source, regex-tests for consent-related language | code |
| `checkRightToErasure()` | Right to erasure / self-service deletion | Reads `dsr-actions.ts`/profile/company action files, regex-tests for delete/erase/anonymize/GDPR language | code |
| `checkNoRawCardholderData()` | No raw cardholder data stored (PCI scope reduction) | Live scan of `prisma/schema.prisma` for a card-data field-name regex (`cardNumber`, `pan`, `cvv2`, `track1/2`, etc.) — none found; notes payment gateways handle card capture directly, keeping this app typically SAQ A / SAQ A-EP scope | code |
| `checkAccessibilityLinting()` | Static accessibility linting (jsx-a11y) | Reads `eslint.config.mjs`, checks for `"core-web-vitals"` (bundles jsx-a11y rules) | code |
| `checkAccessibilityAudit()` | WCAG conformance audit | Reads `storage/a11y-reports/latest.json` (written by `scripts/a11y-audit.ts`, a real `@axe-core/playwright` scan via `npm run a11y:audit`); verified iff `totalCriticalViolations === 0` | code (manual if the report file is missing) |
| `checkThirdPartyAuditRequirement(label)` | "`{label}` — third-party certification/attestation" | Always `verified: false` — pure disclaimer stub, reused for SOC2 Type II / ISO 27001 / PCI DSS AoC | manual |
| `checkVendorRegister()` | Vendor / sub-processor register & DPAs | Live query of active `VendorRecord` rows; verified iff at least one exists and all have `dpaSigned: true` | code |
| `checkPolicyCenter()` | Information security policy center | Live `SecurityPolicy` count where `status: "PUBLISHED"` | code |
| `checkAssetInventory()` | Asset inventory | Live `AssetRecord` count > 0 | code |
| `checkStatementOfApplicability()` | Statement of Applicability | Live `StatementOfApplicabilityEntry` count > 0 | code |
| `checkChangeManagement()` | Change management process | Live `ChangeRequest` count > 0 | code |
| `checkRiskRegister()` | Security risk register | Live `SecurityRisk` count > 0 | code |
| `checkBreachNotificationProcess()` | Breach notification process | Always `verified: false` — requires a rehearsed runbook (e.g. the GDPR 72-hour window); notes the Incident/IncidentUpdate infra exists to run one, but who/when/what isn't code-verifiable | manual |

### Exact control set per framework (`controlsForFramework`)

- **SOC2** (17): encryptionAtRest, fileStorageEncryption, encryptionInTransit, passwordHashing, auditAndSecurityLogging, rbac, abacPolicyLayer, accountLockoutAndBruteForce, twoFactorAuth, incidentResponseProcess, rateLimiting, dataRetentionPolicy, riskRegister, policyCenter, vendorRegister, changeManagement, thirdPartyAuditRequirement("SOC2 Type II")
- **ISO27001** (18): the same as SOC2 minus vendorRegister/changeManagement, plus assetInventory, statementOfApplicability, breachNotificationProcess, thirdPartyAuditRequirement("ISO/IEC 27001")
- **GDPR** (12): encryptionAtRest, fileStorageEncryption, encryptionInTransit, auditAndSecurityLogging, rbac, passwordHashing, twoFactorAuth, rightToErasure, cookieConsent, dataRetentionPolicy, vendorRegister, breachNotificationProcess
- **CCPA** (7): encryptionAtRest, auditAndSecurityLogging, rbac, rightToErasure, cookieConsent, dataRetentionPolicy, vendorRegister
- **DPDP_INDIA** (10): encryptionAtRest, encryptionInTransit, auditAndSecurityLogging, rbac, passwordHashing, rightToErasure, cookieConsent, dataRetentionPolicy, breachNotificationProcess, vendorRegister
- **PCI_DSS** (9): noRawCardholderData, encryptionAtRest, encryptionInTransit, rbac, auditAndSecurityLogging, rateLimiting, accountLockoutAndBruteForce, passwordHashing, thirdPartyAuditRequirement("PCI DSS Attestation of Compliance")
- **WCAG** (2): accessibilityLinting, accessibilityAudit

## 2. Security Risk Register — `src/lib/security/risk-register.ts`

A real, platform-wide `SecurityRisk` register (SOC2 CC3.2 / ISO 27001 Clause 6.1.2) — the platform's own vendor/security posture, distinct from the pre-existing business-risk concepts (`ChurnRiskAssessment`, `RiskLevel`). `likelihood`/`impact` are clamped to integers 1–5 (`clampScale()`); `riskScore = likelihood × impact`, never AI-guessed. `computeRiskBand()` maps `riskScore` to a band: `≤5 → LOW`, `≤11 → MEDIUM`, `≤19 → HIGH`, `≤25 → CRITICAL` (and CRITICAL as the fallback above that). Manage entries at `/admin/compliance/risks`. `getRiskRegisterSummary()` returns total/open/critical-open counts plus a by-band breakdown (open = `OPEN` or `MITIGATING` status). `generateComplianceReport()`'s SOC2/ISO27001 `riskRegister` control is `verified: true` only once at least one real risk row exists.

## 3. Access Reviews — `src/lib/security/access-review.ts`

Periodic RBAC certification (SOC2 CC6.1 / ISO 27001 A.9) for one organization's own membership roster — this is a per-organization page at `/dashboard/crm/team/access-review`, not a platform-wide one. `initiateAccessReview()` snapshots every `ACTIVE` `Membership` into an `AccessReview.findings` Json array (`{membershipId, userId, userName, email, role, decision:null, decidedAt:null}`); an OWNER/ADMIN then confirms or revokes each real entry.

The **last active OWNER can never be revoked** — the exact guard: on a `REVOKED` decision where the target membership's role is `OWNER`, `decideAccessReviewEntry()` counts `prisma.membership.count({organizationId, role:"OWNER", status:"ACTIVE"})`; if that count is `≤ 1` it throws `"An organization needs at least one active owner — cannot revoke the last one."` before any write happens. Otherwise a `REVOKED` decision genuinely flips `Membership.status` to `SUSPENDED` via `prisma.membership.updateMany()` — not a cosmetic annotation, it actually blocks that member's access everywhere `resolveActiveMembership()` gates a page. `completeAccessReview()` sets `status: "COMPLETED"`.

## 4. Admin Audit Log Viewer — `src/lib/security/audit-log-query.ts`

The real, hash-chained `AuditLog` table (`src/lib/audit.ts`, `src/lib/audit-chain-verify.ts`) is queryable cross-org at `/admin/audit-log` (platform-owner only, a distinct route from `/admin/compliance`), filterable by action (substring, case-insensitive), organization, user, and a date range, `queryAuditLog()` capping results at 100 rows (`orderBy: createdAt desc`) with a "narrow your filters" prompt when the cap is hit. `listDistinctAuditActions()` (`distinct: ["action"]`) drives the Action filter dropdown honestly from real logged actions rather than a hardcoded list. Previously only self-scoped from `/profile`.

**How the hash chain actually works** (`src/lib/audit-chain-verify.ts`): the chain is scoped per `organizationId` (a `null`-org chain is its own shared scope). `canonicalize(content)` sorts object keys and nullish-coalesces to `null` before `JSON.stringify`. `computeHash(previousHash, content) = sha256(previousHash + "|" + canonicalize(content))`. `nextAuditLogHash()` finds the most recent row in scope (`orderBy: [{createdAt:"desc"},{id:"desc"}]`), uses its `hash` as `previousHash` (or the literal `"genesis"` if none exists), and hashes over `{userId, organizationId, action, ipAddress, userAgent, metadata, createdAt}` — so `previousHash`/`hash` make a row edited outside `logAudit()` detectable by re-walking the chain (`SecurityEvent` has the identical mechanism via `nextSecurityEventHash()`). `verifyAuditLogChain()`/`verifySecurityEventChain()` walk oldest→newest recomputing and comparing, returning the first broken row if any; rows with a `null` hash (pre-migration data) are skipped and reset the expected chain rather than breaking verification. `logAudit()` itself swallows any write failure (`console.error` only) so audit logging never breaks the calling request — an honestly-documented tradeoff.

**Explicit, honest limitation** (the file's own top comment): this is tamper-**evidence**, not a database-enforced append-only guarantee — a sufficiently privileged DB user can rewrite a row and every hash after it so the chain still re-verifies. It also doesn't defend against two concurrent writes to the same scope forking the chain; no advisory lock/serialization exists for that race.

## 5. GDPR / Privacy

- **Data export & erasure** — `src/app/profile/dsr-actions.ts` / `src/lib/dsr/export-user-data.ts`. `exportMyDataAction()` returns a real JSON export (`collectUserDataExport()`, filename `growthos-data-export-${userId}-${date}.json`, downloaded client-side since Server Actions can't set `Content-Disposition`) covering 24 parallel query categories: profile, memberships, CRM (owned deals/contacts/companies), tasks (assigned to/by), meetings (created/participated), notifications, activities, security events, audit logs, device sessions, API keys (metadata only — prefix/scopes/rate limit, never the hash), uploaded documents (metadata only), comments, time entries, reminders, bookmarks, search history, commercial documents created (quotations/contracts/invoices), and the user's own `ConsentRecord` history. Its own top comment is explicit this is a bounded, honest scope — not a walk of all 100+ schema models — and that secrets (password hashes, 2FA secrets, API key hashes, OAuth tokens) are never included even though those rows belong to the user.
  `anonymizeMyAccountAction()` is the real Art. 17 "right to erasure" path — requires typing the exact confirmation phrase `"DELETE MY ACCOUNT"` plus a current-password re-check. In one transaction: `User` PII is wiped/replaced (name→`"Deleted user"`, email→`deleted-user-${userId}@deleted.growthos.invalid` since the column is unique-not-null, password/2FA cleared), `sessionInvalidatedAt` is stamped (invalidating every session/device via the `jwt()` callback in `src/auth.ts`), `DeviceSession`/`Session`/`Account` rows are deleted outright, `ApiKey` rows are revoked (not deleted), and `Membership` rows are suspended. What is **deliberately not deleted**: deals/projects/contacts/invoices this user owned or authored — most of those foreign keys are required (`NOT NULL`, Postgres default `Restrict`), so a hard `user.delete()` would throw the moment the user owns anything, and even nullable (`SetNull`) FKs would silently strip "who did this" attribution the org still relies on. Those rows keep referencing the now-anonymized user id.
- **Cookie consent** — `src/components/cookie-consent-banner.tsx` + `src/lib/cookie-consent.ts`: a real first-party cookie (`growthos_cookie_consent`, 1-year max-age, `SameSite=Lax`, `Secure` over HTTPS, non-HttpOnly) holding `{version, decidedAt, preferences}` across three categories — `essential` (always true, not actually toggleable), `analytics`, `marketing`. Rendered from the root layout on every page; "Accept all" / "Reject non-essential" / "Customize" (per-category checkboxes). Honestly documented: as of writing the app loads **zero** non-essential cookies or trackers of its own (no analytics/ads pixel, no client-side Sentry) — the banner is real, working infrastructure "ready for the day a non-essential cookie is actually added," not currently gating anything live.
- **Server-side consent persistence** — `src/lib/gdpr/consent.ts` / `ConsentRecord` model: once signed in, a user's cookie-banner decision is *additionally* written as two durable rows per decision (`consentType: "COOKIES_ANALYTICS"` and `"COOKIES_MARKETING"`, each with a real `granted` boolean and captured IP) via `src/app/actions/consent-actions.ts`'s `persistConsentDecisionAction()`, independent of the client-side cookie. The `ConsentType` enum also defines `MARKETING_EMAILS`/`DATA_PROCESSING`, though neither is currently written by this flow. Anonymous/pre-auth visitors remain fully covered by the cookie alone (the server action silently no-ops without an active membership).
- **Data retention** — the `"audit-log-retention-cleanup"` scheduled job (`src/lib/scheduler/registry.ts`) runs every Sunday at 2am (`cronExpression: "0 2 * * 0"`, priority 5 — lowest, "weekly bulk deletion housekeeping") and prunes `AuditLog` rows older than **400 days** (`AUDIT_LOG_RETENTION_DAYS = 400`). No other data category has an automated retention job yet — an honest gap, not a silent one (`generateComplianceReport()`'s data-retention control reports this exactly).

## 6. The five other real compliance registers (`/admin/compliance/*`, all platform-owner-only)

Beyond the readiness dashboard itself, the same `/admin/compliance` area hosts five substantial real CRUD surfaces, each backing one or more of the code controls in §1:

- **`/admin/compliance/risks`** — the Security Risk Register (§2).
- **`/admin/compliance/policies`** — Information Security Policy Center (`src/lib/security/policy-center.ts`): `listPolicies()`/`getPolicyCenterSummary()`, tracking total/published/draft/overdue-for-review counts; editing published content automatically bumps a real `v{n}` version.
- **`/admin/compliance/vendors`** — Vendor / Sub-processor Register (`src/lib/security/vendor-register.ts`), doubling as the GDPR Art. 28 Data Processing Register: category, data processed, risk level, and a real DPA-signed toggle per vendor.
- **`/admin/compliance/assets`** — Asset Inventory (`src/lib/security/asset-inventory.ts`): asset type, data classification (`PUBLIC`/`INTERNAL`/`CONFIDENTIAL`/`RESTRICTED`), location, status.
- **`/admin/compliance/soa`** — Statement of Applicability, the ISO 27001 Annex A scoping document (`src/lib/security/statement-of-applicability.ts`): an admin manually enters each `controlId`/`controlTitle` — the app never pre-seeds official Annex A text — tracked by theme, applicability, and implementation status.
- **`/admin/compliance/changes`** — Change Management (SOC2 CC8.1, `src/lib/security/change-management.ts`): change type, risk level, and status (`PROPOSED` → `APPROVED`/`REJECTED` → `DEPLOYED`/`ROLLED_BACK`), optionally linked to a real `Deployment` row.

None of these registers is ever pre-seeded with fabricated examples or fake official standard text — every row is real, admin-entered data, and each register's own list/summary function is what the corresponding `compliance.ts` control actually queries.

## 7. Compliance Dashboard

`/admin/compliance` — the real, platform-owner-only readiness dashboard. Shows the latest `ComplianceReport` per framework with every control's verified/not-verified state, its code/manual badge, and its detail text, plus links out to all six registers above. Every framework's disclaimer is rendered inline, not just documented here.

## 8. What this is NOT

No file in this codebase can issue a SOC2 Type II report, an ISO/IEC 27001 certificate, a PCI DSS Attestation of Compliance, or a legal determination of GDPR/CCPA/DPDP-India/WCAG conformance. Those require a real accredited auditor or legal counsel engagement. This tooling exists to make that engagement faster and cheaper — a real, current inventory of what's already built, not a substitute for it.
