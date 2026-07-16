# KVL GrowthOS — Platform Operator Admin Manual

> Covers the cross-tenant, platform-operator-only tools under `src/app/admin/`. All of these are gated by `requirePlatformOwner()` (`src/lib/billing/platform-admin.ts`) — a completely different auth boundary from the per-organization `requireActiveMembership()` used everywhere else in `/dashboard/*`. `src/app/admin/incidents` landed partway through this documentation pass (from the parallel security task) and is included below with real, verified detail.

## 1. Granting platform-operator access

`User.isPlatformOwner` (`prisma/schema.prisma` line 55) is a boolean flag with **no self-service UI by design** — it is deliberately never settable through any organization-scoped action, only ever flipped directly in the database by whoever operates this deployment. This is a real architectural decision, not a missing feature: `src/lib/billing/platform-admin.ts`'s own doc comment states the flag "is never settable through any organization-scoped UI/action, only ever flipped directly in the database."

Real SQL to grant it:

```sql
UPDATE "User" SET "isPlatformOwner" = true WHERE email = 'operator@yourcompany.com';
```

To revoke it:

```sql
UPDATE "User" SET "isPlatformOwner" = false WHERE email = 'operator@yourcompany.com';
```

Verify who currently holds it:

```sql
SELECT id, email, "isPlatformOwner" FROM "User" WHERE "isPlatformOwner" = true;
```

Any of these can be run via `psql` directly against `DATABASE_URL`, or through `npx prisma studio` by editing the `User` row's `isPlatformOwner` checkbox. There is also a read helper in code, `isPlatformOwner(userId)` (`src/lib/billing/platform-admin.ts`), for any script that needs to check this programmatically.

## 2. Admin Billing Dashboard — `/admin/billing`

Real, live, cross-tenant billing metrics (`src/app/admin/billing/page.tsx`), computed directly from Prisma aggregates — nothing here is precomputed/cached or fabricated:

- **MRR/ARR** — summed from every `ACTIVE` `BillingAccount`'s current `Plan` price, monthly-normalized (`YEARLY` price ÷ 12, `QUARTERLY` ÷ 3; `LIFETIME` plans excluded as one-time, not recurring, revenue). The page's own comment flags a real, documented limitation: this assumes a single-currency catalog (no FX conversion), since `Plan.currency` defaults to `"USD"` and the dashboard doesn't convert.
- **Total revenue** — real `PlatformPayment` aggregate (`amountCents` minus `refundedAmountCents`) across every successful/partially-refunded/refunded payment.
- **Churn** — ratio of accounts that were `ACTIVE` before a rolling 30-day window and were `CANCELED` during it, versus those still active from before that window.
- **Trial conversion** — accounts that started a trial in the last 90 days versus how many of those are now `ACTIVE`.
- **Failed payments** and **overdue invoices** — the 25 most recent `PlatformPayment` rows with `status: "FAILED"`, and up to 50 `PlatformInvoice` rows that are `OPEN` and past their `dueDate`, each joined to the owning `Organization` so an operator can act on them directly.
- **Revenue trend** — a 6-month rolling chart (`_components/revenue-trend-chart.tsx`) built from real monthly `PlatformPayment` aggregates.

## 3. Partner (Reseller) Approvals — `/admin/partners`

`src/app/admin/partners/page.tsx` lists every `Partner` application platform-wide, with counts of each partner's `referredOrganizations`, `commissions`, and `payouts`. Its own doc comment explains why it exists: *"Optional per the Phase 18 brief, built because there's otherwise no way to move a Partner from PENDING to ACTIVE short of a direct DB edit."* The `PartnerStatusSelect` component lets an operator move a partner between `PENDING`/`ACTIVE`/`SUSPENDED` — approving a `PENDING` partner is what activates their referral link's ability to generate real commissions.

## 4. Partner Payouts — `/admin/payouts`

`src/app/admin/payouts/page.tsx` lists every `Payout` record platform-wide (joined to the requesting `Partner` and their `commissions`), each with a status of `PENDING` or `PAID`. This is the manual counterpart to a partner's own `requestPayoutAction` (`src/app/dashboard/partner/actions.ts`): a partner requests a payout (creating a real, trackable `PENDING` row); an operator here confirms the funds were actually sent out-of-band and flips it to `PAID` via the `MarkPaidButton` component. Same rationale as the Partners page — this exists because there's otherwise no way to do it short of a direct DB edit.

## 5. Incident Management — `/admin/incidents`

This is real and landed from the parallel security-hardening task during this documentation pass. `src/app/admin/incidents/page.tsx` lists every `Incident` platform-wide (not organization-scoped), ordered by status then most-recent-first, with each incident's update count. A detail page exists at `/admin/incidents/[id]`.

How incidents get created:
- **Automatically** — every `CRITICAL`-severity `SecurityEvent` (e.g. `BRUTE_FORCE_DETECTED`) calls `ensureIncidentForCriticalEvent()` (`src/lib/security/incidents.ts`), which either appends an update to an already-open incident with the same derived title (deduplicating repeated occurrences of the same critical event into one incident) or opens a new one with severity `CRITICAL` and status `OPEN`.
- **Manually** — via the `CreateIncidentForm` component on this page, calling `createIncidentAction` (`src/app/admin/incidents/actions.ts`), which validates title/description/severity (`LOW|MEDIUM|HIGH|CRITICAL`) with a Zod schema and writes an `admin.incident_created` `AuditLog` entry.

Once opened, an operator can:
- **Add a timeline update** (`addIncidentUpdateAction`) — a new `IncidentUpdate` row and a status transition (`OPEN|INVESTIGATING|MONITORING|RESOLVED`), logged as `admin.incident_update_added`.
- **Resolve it** (`resolveIncidentAction`) — sets `status: "RESOLVED"`, stamps `resolvedAt`, and records an optional postmortem, logged as `admin.incident_resolved`.

`IncidentUpdate` rows are append-only (never edited once created), matching this app's existing `AuditLog`/`SecurityEvent` "immutable log" discipline — the full real history of an incident is preserved exactly as it happened.

## 6. Compliance tooling — not yet confirmed

`ComplianceReport` exists in `prisma/schema.prisma` (`framework`, `status`, `findings` (JSON), `generatedAt`), part of the same parallel security task's scope. As of this writing, **no admin UI for `ComplianceReport` had landed** (no `src/app/admin/compliance` or similar directory found). Check for it directly before telling an operator where to find compliance reports — if it hasn't landed, the only way to inspect `ComplianceReport` rows today is `npx prisma studio` or a direct query:

```ts
await prisma.complianceReport.findMany({ orderBy: { generatedAt: "desc" } });
```

## 7. Summary table

| Tool | Path | Gate | What it's for |
|---|---|---|---|
| Admin Billing Dashboard | `/admin/billing` | `requirePlatformOwner` | Cross-tenant MRR/ARR/churn/trial-conversion/failed-payments/overdue-invoices |
| Partner Approvals | `/admin/partners` | `requirePlatformOwner` | Move a reseller Partner from PENDING to ACTIVE (or SUSPENDED) |
| Partner Payouts | `/admin/payouts` | `requirePlatformOwner` | Confirm a partner payout was actually sent, mark PENDING → PAID |
| Incident Management | `/admin/incidents` | `requirePlatformOwner` | View/create/update/resolve platform-wide Incidents; auto-opened from CRITICAL SecurityEvents |
| Compliance reports | *(not yet built as of this writing)* | — | `ComplianceReport` model exists; check for an admin surface before assuming one exists |

Granting `isPlatformOwner` (§1) is the only prerequisite for all of the above — there is no finer-grained platform-admin permission model today; any platform owner can reach every tool in this manual.
