/**
 * Single source of truth for the Developer Platform (Phase 6).
 *
 * REAL, VERIFIED API SURFACE (2026-07-29 research) — this is the ONLY real
 * public API. Every SDK/CLI/OpenAPI-spec/code-sample built from this must
 * use exactly these 4 endpoints — never invent additional resources.
 *
 * Auth: `Authorization: Bearer <raw_api_key>` header (src/lib/auth/api-key.ts).
 * Error shape: `{ "error": "message" }`. Status codes: 401 (invalid/missing
 * key), 403 (missing scope), 429 (rate limit), 2xx on success.
 * Rate limit: per-key, default 1000 requests/hour (configurable per key at
 * creation), enforced via a real Redis-backed sliding window
 * (src/lib/security/rate-limit-distributed.ts).
 * Real per-call usage logging: every call (including auth failures) is
 * recorded to the real `APIUsage` model (src/lib/api-usage.ts,
 * `recordAPIUsage`/`getUsageSummary` — totalCalls/errorRate/
 * avgResponseTimeMs/byEndpoint are real, computed from real rows).
 * Real outbound webhook signing: HMAC-SHA256 over the raw request body,
 * timing-safe verification (src/lib/workflows/webhook-signature.ts).
 *
 * Endpoints (exactly these 4 — do not invent more):
 * 1. POST /api/v1/workflows/{workflowId}/trigger
 *    scope: "workflows:trigger" — triggers a workflow run, returns 202 { "runId": string }
 * 2. GET /api/export/companies?format=csv|crm|excel|pdf
 *    scope: "export:companies:read" — exports the org's companies
 * 3. GET /api/export/deals?format=csv|crm|excel|pdf
 *    scope: "export:deals:read" — exports the org's deals
 * 4. GET /api/export/contacts?format=csv|crm|excel|pdf
 *    scope: "export:contacts:read" — exports the org's contacts
 *
 * API keys are managed at /dashboard/settings/api-manager (requires login).
 *
 * Confirmed FALSE — never claim: GraphQL (being newly built this pass, see
 * src/app/api/graphql — minimal, real, but NOT the full spec's ambitious
 * scope), a catalog of typed webhook events (webhook delivery is generic/
 * workflow-triggered, not a fixed `deal.created`-style event list),
 * pagination/filtering/sorting on the export endpoints (they return the
 * full dataset), a public GitHub repository, Discord/Slack/forum community
 * channels (none exist — routed to a real interest-capture form instead of
 * a fake invite link), SDKs for languages beyond JS/TS and Python (those
 * two are real, hand-written, working — the rest are honestly not built).
 */

export interface DeveloperEndpoint {
  method: string;
  path: string;
  scope: string;
  description: string;
  curl: string;
}

export interface AuthMethod {
  name: string;
  status: "Available" | "Not Available";
  description: string;
}

export interface RateLimitFact {
  label: string;
  value: string;
}

export interface SdkEntry {
  language: string;
  status: "Available" | "Coming Soon";
  install: string;
  description: string;
}

export const API_BASE_URL_NOTE = "https://growthos.kvlbusinesssolutions.com";

export const DEVELOPER_ENDPOINTS: DeveloperEndpoint[] = [
  {
    method: "POST",
    path: "/api/v1/workflows/{workflowId}/trigger",
    scope: "workflows:trigger",
    description: "Triggers a workflow run.",
    curl: `curl -X POST "${API_BASE_URL_NOTE}/api/v1/workflows/{workflowId}/trigger" \\\n  -H "Authorization: Bearer YOUR_API_KEY"`,
  },
  {
    method: "GET",
    path: "/api/export/companies",
    scope: "export:companies:read",
    description: "Exports your organization's companies (format=csv|crm|excel|pdf).",
    curl: `curl "${API_BASE_URL_NOTE}/api/export/companies?format=csv" \\\n  -H "Authorization: Bearer YOUR_API_KEY"`,
  },
  {
    method: "GET",
    path: "/api/export/deals",
    scope: "export:deals:read",
    description: "Exports your organization's deals (format=csv|crm|excel|pdf).",
    curl: `curl "${API_BASE_URL_NOTE}/api/export/deals?format=csv" \\\n  -H "Authorization: Bearer YOUR_API_KEY"`,
  },
  {
    method: "GET",
    path: "/api/export/contacts",
    scope: "export:contacts:read",
    description: "Exports your organization's contacts (format=csv|crm|excel|pdf).",
    curl: `curl "${API_BASE_URL_NOTE}/api/export/contacts?format=csv" \\\n  -H "Authorization: Bearer YOUR_API_KEY"`,
  },
];

export const AUTH_METHODS: AuthMethod[] = [
  { name: "API Keys (Bearer)", status: "Available", description: "Bcrypt-hashed, scoped, per-key rate limit — the real authentication method for the public API." },
  { name: "OAuth 2.0 (Sign-in)", status: "Available", description: "Google, Microsoft, GitHub, and LinkedIn — for signing into the product, not for public API access." },
  { name: "Webhook Signing", status: "Available", description: "HMAC-SHA256 signatures on every outbound webhook, so you can verify authenticity." },
  { name: "Enterprise SSO / SAML", status: "Not Available", description: "Not built yet — see our Trust Center for the current honest status." },
];

export const RATE_LIMIT_FACTS: RateLimitFact[] = [
  { label: "Default limit", value: "1,000 requests / hour, per API key" },
  { label: "Window", value: "Rolling 1-hour window" },
  { label: "Configurable", value: "Per-key limit can be set at creation" },
  { label: "Exceeded response", value: "429 { \"error\": \"Rate limit exceeded.\" }" },
];

export const SDK_ENTRIES: SdkEntry[] = [
  { language: "JavaScript / TypeScript", status: "Available", install: "Copy the client from our docs — not yet published to npm", description: "A real, working client covering all 4 endpoints, usable in Node.js or the browser." },
  { language: "Python", status: "Available", install: "Copy the client from our docs — not yet published to PyPI", description: "A real, working client covering all 4 endpoints." },
  { language: "PHP", status: "Coming Soon", install: "", description: "" },
  { language: "Java", status: "Coming Soon", install: "", description: "" },
  { language: "Go", status: "Coming Soon", install: "", description: "" },
  { language: "C#", status: "Coming Soon", install: "", description: "" },
  { language: "Ruby", status: "Coming Soon", install: "", description: "" },
];
