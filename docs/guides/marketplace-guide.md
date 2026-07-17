# KVL GrowthOS — Marketplace Guide

> A real inventory of the AI Agent Marketplace / App Store, sourced from `src/lib/marketplace/`, `src/app/dashboard/marketplace/`, and `src/app/admin/marketplace/`.

## 1. The polymorphic manifest — `src/lib/marketplace/manifest-schema.ts`

Every installable listing is described by one Zod discriminated union keyed by the manifest's own `kind`, validated both at publisher-submit time and again at install time (defense in depth). `MarketplaceListing.category` is the real 14-value enum: `INTEGRATION`, `TEMPLATE`, `AGENT_PACK`, `WORKFLOW`, `CRM_TEMPLATE`, `PROPOSAL_TEMPLATE`, `AUTOMATION_TEMPLATE`, `INDUSTRY_PACK`, `DASHBOARD_PACK`, `ANALYTICS_PACK`, `INTEGRATION_CONNECTOR`, `WHITE_LABEL_PACK`, `PROMPT_PACK`, `KNOWLEDGE_PACK`. `CATEGORY_TO_MANIFEST_KIND` maps each category to its manifest `kind` (`INTEGRATION` and `TEMPLATE` map to `null` — legacy, not installable through this engine); `validateManifest(category, rawManifest)` throws `InvalidManifestError` on any mismatch.

Real manifest field shapes, one per installable `kind`:

| Kind | Real fields |
|---|---|
| `AGENT_PACK` | `agentType` — one of the 20 `ExecutiveAgentType` values (see the AI Agent Guide) |
| `WORKFLOW` | `automationTemplateName: string` |
| `DOCUMENT_TEMPLATE` (serves `CRM_TEMPLATE`/`PROPOSAL_TEMPLATE`) | `documentTemplate: { name, docKind, category?, businessDocKind?, contractType?, content }` |
| `DASHBOARD_PACK` (serves `DASHBOARD_PACK`/`ANALYTICS_PACK`) | `templateName, widgets: [{type, position:{x,y,w,h}}]` (min 1) |
| `KNOWLEDGE_PACK` | `articles: [{title, content, tags:[]}]` (min 1) |
| `PROMPT_PACK` | `prompts: [{title, promptText, variables:[], category?, agentType?}]` (min 1) |
| `INTEGRATION_CONNECTOR` | `provider` — validated against the real `IntegrationProviderKey` enum at install time (see the Integration Guide) |
| `WHITE_LABEL_PACK` | `templateOverrides: Record<string, unknown>` — genuinely free-form |
| `INDUSTRY_PACK` | Composite — all sub-arrays optional: `documentTemplates?`, `dashboards?`, `automationTemplateNames?`, `knowledgeArticles?`, `dealStageRenames?: [{fromDefaultName, toName}]` |

One schema, one install dispatcher — never N parallel per-category install systems.

## 2. Install engine — `src/lib/marketplace/install-engine.ts`

`installListing()` resolves the target `MarketplaceVersion`, checks `MarketplaceDependency` rows (blocking on an unmet required dependency — including before a paid checkout is even allowed to start), validates the manifest again, then dispatches to exactly one installer under `src/lib/marketplace/installers/*.ts`. Those installer functions are **unexported from the package root** — reachable only through this dispatcher, so the dependency check can never be bypassed by a direct call. Each installer wraps an already-existing, unmodified create path:

| Category | Installer | Wraps |
|---|---|---|
| `AGENT_PACK` | `agent-pack.ts` | Real `AIAgentInstance` upsert on `@@unique([organizationId, type])` |
| `WORKFLOW` / `AUTOMATION_TEMPLATE` | `workflow-pack.ts` | Looks up `AutomationTemplate` by name, calls the existing `installTemplate()`; uninstall archives the `Workflow` (`status: ARCHIVED`), never deletes — preserves run history |
| `CRM_TEMPLATE` / `PROPOSAL_TEMPLATE` | `document-template-pack.ts` | Real `DocumentTemplate` create/delete |
| `DASHBOARD_PACK` / `ANALYTICS_PACK` | `dashboard-pack.ts` | Real `DashboardTemplate` create/delete |
| `KNOWLEDGE_PACK` | `knowledge-pack.ts` | Real `KnowledgeArticle` create with `status: "DRAFT"`, `visibility: "ORG"` — never auto-published |
| `PROMPT_PACK` | `prompt-pack.ts` | The existing `createPromptTemplate()` from `@/lib/prompt-library`, tagging `sourceListingId` |
| `INTEGRATION_CONNECTOR` | `integration-connector.ts` | Deep-links to `/dashboard/settings/integrations?provider=X` — never fabricates a connection; `reconcileIntegrationInstall()` polls for a real `CONNECTED` row afterward |
| `WHITE_LABEL_PACK` | `white-label-pack.ts` | Read-merge-write into `WhiteLabelSettings.templateOverrides` |
| `INDUSTRY_PACK` | `industry-pack.ts` | Composite — calls the document-template/dashboard/workflow/knowledge-pack installers per the manifest's sub-arrays, plus `DealStage` renames that only touch stages still matching their default name (skips human-customized stages) |

`uninstallListing()` reads the real `MarketplaceInstall.createdRowsLog` and deactivates each created row via its own existing update function (agents flip `active: false`, workflows archive, etc.) — it never re-derives from the manifest and never hard-deletes history. `rollbackInstall()` is explicitly "never a diff/undo": it uninstalls the current version's created rows via the stored `createdRowsLog`, then calls `installListing()` fresh against a prior `MarketplaceVersion`, logging a `ROLLED_BACK` `MarketplaceInstallEvent`. `MarketplaceVersion` rows are immutable once `PUBLISHED`.

The legacy `src/lib/marketplace.ts` (outside the `marketplace/` folder) still exists separately: `ensureMarketplaceCatalog()` seeds the original 8 stub rows (Slack/Teams `AVAILABLE`, 6 others `COMING_SOON`) only if the table is empty — most of these get upgraded in place to real slugged listings by `seed.ts` (§6).

## 3. Paid listings — `src/lib/marketplace/checkout.ts`

Real charging, wired into the existing platform billing stack — a marketplace purchase is just another `PlatformInvoice` under the buyer org's existing `BillingAccount`, not a parallel payment model.

```ts
startMarketplaceCheckout(params: StartCheckoutParams): Promise<StartCheckoutResult>
fulfillMarketplaceOrder(orderId, opts?: { gatewayPaymentId?; provider? }): Promise<void>
markManualMarketplaceOrderPaid(orderId, markedByUserId): Promise<{ ok: boolean; error?: string }>
refundMarketplaceOrder(orderId, requestedByUserId): Promise<{ ok: boolean; error?: string }>
handleMarketplaceOrderWebhookEvent(provider, event: NormalizedWebhookEvent): Promise<void>
```

`startMarketplaceCheckout()` creates a `PENDING` `MarketplaceOrder` and calls the real `PlatformGateway.createCheckoutSession()` (`src/lib/billing/gateway/{stripe,razorpay,paddle,manual}.ts`, resolved via `getGateway(provider)`; LemonSqueezy is excluded from one-time checkout since it "has no dynamic-pricing API"), falling back to the Manual gateway when no card gateway is configured. Gateway selection: for `SUBSCRIPTION` pricing, candidates are the keys present in `listing.gatewayPriceIds` plus `MANUAL`; for `ONE_TIME`, the fixed priority `["STRIPE", "RAZORPAY", "PADDLE", "MANUAL"]`.

**Commission math** (in `fulfillMarketplaceOrder`):

```ts
const platformFeePercent = order.listing.platformFeePercent ?? 20; // per-listing, null = platform default 20%
const publisherShareCents = Math.round(order.amountCents * (1 - platformFeePercent / 100));
```

`platformFeePercent` is a nullable `Float` field on `MarketplaceListing` itself — a per-listing rate, not a per-plan one — defaulting to a 20% platform cut / 80% publisher share when unset.

`fulfillMarketplaceOrder()` (the webhook-dispatched, already-signature-verified path — see the Integration Guide's webhook table) is idempotent (returns early if already `PAID`); inside one `prisma.$transaction` it creates a real `PlatformInvoice` (`generatePlatformInvoice()`, kind `RECURRING` for subscriptions / `RECEIPT` for one-time) and a `PlatformPayment` (`status: SUCCEEDED`); then calls `installListing()` — if install fails, the order stays `PAID` with no install rather than silently dropping the payment, logged for an admin to retry via `retryInstallAction`; then `generateLicenseKey(organizationId, "API")`, linked to both `MarketplaceInstall.licenseId` and `License.marketplaceListingId`; then creates the real `Commission` (`sourceType: "MARKETPLACE_SALE"`, `status: "PENDING"`, only if the publisher has a linked `partnerId`); finally updates the order to `PAID`. Logs `marketplace.order.fulfilled` via `logAudit`.

`refundMarketplaceOrder()`: for the `MANUAL` gateway it directly flips the latest `PlatformPayment` to `REFUNDED` and calls `issueCreditNote()`; for real gateways it calls the existing `refundPlatformPayment()` unmodified. Either way it voids the `Commission` (`status: VOID`), calls `uninstallListing()` (best-effort — errors logged, not thrown), and sets the order `status: REFUNDED`.

## 4. Recommendations — `src/lib/marketplace/recommendations.ts`

A real deterministic pre-filter runs before any AI call — a Prisma query over published/available listings not already installed by the org, ordered by `installCount desc, ratingAverage desc`, capped at 40 candidates, then scored in-memory (`industryMatch(100) + installCount + ratingAverage*5`) and cut to the top 15. The AI call (`generateStructured()` via the standard fallback chain) is grounded strictly in that candidate list — its system prompt states the model may only recommend a `listingId` that appears in the given list — and the response schema caps at 5 recommendations, each with a 1–300 character `reason`. Every returned `listingId` is post-validated against the real candidate set; a hallucinated id is silently dropped, never surfaced. Degrades to an honest empty state when no AI provider is connected — never a fake recommendation.

## 5. Publisher Portal & Admin Curation

- `/dashboard/marketplace/publisher` — `ApplyPublisherForm` creates a `MarketplacePublisher` row (`status: PENDING`) and auto-creates/links a `Partner` row (a unique referral code) so payouts flow through the existing `Commission`/`Payout` system.
- `/dashboard/marketplace/[slug]` — listing detail: description, dependency list (with an "Optional" badge for non-required `MarketplaceDependency` rows), version history, and reviews (`ReviewForm` shown only when the org's `MarketplaceInstall.status === "ACTIVE"` and it hasn't reviewed yet).
- `/dashboard/marketplace/installed` — every `MarketplaceInstall` for the org across all statuses (`ACTIVE`/`UNINSTALLED`/`FAILED`/`ROLLED_BACK`).
- `/admin/marketplace/{listings,publishers,reviews,orders}` — all gated by `requirePlatformOwner()` (platform-owner only, distinct from org OWNER/ADMIN):
  - `listings` — `approveListingVersionAction()` flips a `DRAFT` `MarketplaceVersion` to `PUBLISHED` and the listing to `PUBLISHED`/`isVerified: true`; `rejectListingAction()`/`suspendListingAction()` set `REJECTED`/`SUSPENDED`.
  - `publishers` — `updatePublisherStatusAction()` moves a publisher through `PENDING → APPROVED/SUSPENDED/REJECTED`; approving also flips the linked `Partner.status` to `ACTIVE` so payouts can flow.
  - `reviews` — `respondToReviewAction()` sets a real publisher response; `removeReviewAction()` deletes a review and recomputes `ratingAverage`/`ratingCount` (documented for "spam/abuse, never for suppressing a genuine negative review").
  - `orders` — `refundMarketplaceOrderAction()` calls `refundMarketplaceOrder()` above, only actionable on `PAID` orders, with a confirm dialog warning it "reverses the real payment, voids the publisher commission, and uninstalls the listing."
  - The dashboard itself shows real, live-computed stat cards — total listings/`IN_REVIEW` count, total/pending publishers, total reviews, and total order revenue via `prisma.marketplaceOrder.aggregate({where:{status:"PAID"}})` — never a curated fake number.

## 6. Catalog seeding — `src/lib/marketplace/seed.ts`

`ensureAllPhase19MarketplaceListings()` short-circuits once `prisma.marketplaceListing.count({where:{slug:{not:null}}})` reaches `EXPECTED_MIN_SEEDED_LISTINGS = 85`; otherwise it runs 6 seed functions:

1. `ensureWorkflowMarketplaceListings` — one `WORKFLOW` listing per row already in `automationTemplate` (seeding those first if needed), plus upgrading the legacy "Legal Agent Pack" stub in place to a real `AGENT_PACK`/`LEGAL` listing.
2. `ensureDocumentTemplateMarketplaceListings` — 2 listings ("SaaS Implementation Proposal", "Client Onboarding Scope of Work") with real markdown template content baked into the manifest.
3. `ensureDashboardMarketplaceListings` — 2 listings ("Sales Pipeline Dashboard", "Executive Analytics Pack").
4. `ensureIndustryPackMarketplaceListings` — 2 listings: "Software Agency Growth Pack" (the one real **paid** listing, `$49` one-time) and "Real Estate Agency Pack" (free).
5. `ensureKnowledgeAndPromptMarketplaceListings` — 2 listings ("Sales Knowledge Pack" with 3 articles, "Sales Prompt Pack" with 3 prompts).
6. `ensureIntegrationConnectorMarketplaceListings` — one `INTEGRATION_CONNECTOR` listing per `IntegrationProviderKey`, grouped into the same 12 categories as the Integration Guide, ~60 real slugged rows; 19 have bespoke curated copy (Slack, HubSpot, Salesforce, Zoho CRM, QuickBooks, Stripe, Razorpay, Xero, GitHub, GitLab, Google Drive, Microsoft Outlook, Calendly, Zoom, Twilio, Telegram, Dropbox, DocuSign, plus more).
7. `ensureWhiteLabelMarketplaceListings` — 1 listing ("Agency White Label Pack").
8. `ensureAgentMarketplaceListings` — the 7 marketplace-only `AGENT_PACK` listings (`HR, SUPPORT, RECRUITMENT, SEO, BUSINESS_ANALYST, RESEARCH, CUSTOMER_SUCCESS`).

Called lazily on marketplace page load; cheap-short-circuits once the expected count is already seeded.

## 7. Reviews, licensing, and version mechanics

**Reviews**: `submitReviewAction` (`src/app/dashboard/marketplace/[slug]/_lib/review-actions.ts`) is server-side gated on a real `ACTIVE` install for that listing, and rejects a second review from the same org (`@@unique([listingId, organizationId])`). The review's `installId` FK **is** the "verified install" signal — not a client-settable flag. Every submit/removal recomputes `ratingAverage`/`ratingCount` via `prisma.marketplaceReview.aggregate()`.

**Licensing**: `generateLicenseKey(organizationId, type, seats?, expiresAt?)` (`src/lib/billing/licenses.ts`) formats keys as `GOS-XXXX-XXXX-XXXX-XXXX` from an alphabet that excludes visually ambiguous characters (`0/O/1/I/L`), retried up to 10× for uniqueness. Called from `fulfillMarketplaceOrder()` with `type: "API"` on every successful paid purchase. Real runtime validation functions exist (`activateLicense(key)`, `verifyLicense(key)` — status checks, lazy `EXPIRED` flip, `lastVerifiedAt` stamping) but a repo-wide search shows they aren't called by any internal route or job today — they're built for an external API consumer, referenced only in a code comment on `/dashboard/settings/licenses`. `revokeLicense(licenseId, organizationId)` is the only mutation path currently exercised, org-scoped via an `updateMany` guard.

## 8. Tenant isolation

Every `MarketplaceInstall`, `MarketplaceReview`, and order row is `organizationId`-scoped. Listing/version/dependency data is legitimately global (the catalog), never leaked per-tenant data.
