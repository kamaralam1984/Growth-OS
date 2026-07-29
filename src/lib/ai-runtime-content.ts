/**
 * Single source of truth for the AI Runtime & Reliability page
 * (src/components/sections/ai-runtime/*.tsx, src/app/ai-runtime/page.tsx).
 *
 * Every claim was independently verified against this codebase (3 research
 * passes, 2026-07-29) before being written. Confirmed FALSE and deliberately
 * never claimed anywhere: any AI response/prompt/embedding caching, granular
 * per-provider real-time latency/success-rate dashboards, a formal
 * closed/open/half-open circuit breaker (the real mechanism is a much
 * simpler 60-second cooldown), live distributed tracing (OpenTelemetry
 * scaffolding exists but is inert until an exporter is configured),
 * multi-process/horizontal worker scaling in the current deployment (k8s
 * HPA / PM2 cluster configs exist in the repo but are not what's actually
 * running), a queryable per-call AI request log, published SDKs, an API
 * playground, or "Local Models"/"Custom API" providers (only Anthropic,
 * Groq, Gemini, and OpenRouter are real).
 */

export interface RuntimeProvider {
  name: string;
  role: string;
}

export interface LifecycleStage {
  stage: string;
  description: string;
}

export interface ReliabilityMechanism {
  title: string;
  description: string;
  detail: string;
}

export interface QueueSummary {
  name: string;
  purpose: string;
  retryPolicy: string;
}

export interface AISecurityItem {
  title: string;
  description: string;
}

export interface DeveloperApiItem {
  name: string;
  status: "Available" | "Coming Soon";
  description: string;
}

export interface RoadmapItem {
  title: string;
  description: string;
}

export interface ComingSoonResource {
  title: string;
  description: string;
}

// ---------- Multi-Provider Architecture ----------
// Real fallback order: paid primary, then three free tiers, tried in this
// exact sequence — src/lib/ai/fallback.ts. No "Local Models"/"Custom APIs".

export const RUNTIME_PROVIDERS: RuntimeProvider[] = [
  { name: "Anthropic Claude", role: "Primary provider" },
  { name: "Groq", role: "Free-tier fallback" },
  { name: "Google Gemini", role: "Free-tier fallback" },
  { name: "OpenRouter", role: "Free-tier fallback" },
];

// ---------- AI Request Lifecycle ----------
// The real sequence — no caching stage (none exists), and "logging" is
// honestly scoped to what's real (console + aggregate cost tracking, not a
// queryable per-call log).

export const LIFECYCLE_STAGES: LifecycleStage[] = [
  { stage: "Authentication", description: "The request is authenticated before anything else runs." },
  { stage: "Validation", description: "Inputs are validated before being sent to any provider." },
  { stage: "Routing", description: "The fallback engine selects the next eligible provider in priority order." },
  { stage: "Execution", description: "The request runs against the selected provider." },
  { stage: "Response Validation", description: "Structured responses are checked against an expected schema, with one automatic repair attempt on a malformed response." },
  { stage: "Cost Tracking", description: "Real token usage from the provider's own response is recorded against the organization's AI credit balance." },
  { stage: "Client Response", description: "The result is returned to the caller." },
];

// ---------- Intelligent Failover ----------

export const FAILOVER_MECHANISM = {
  title: "Automatic fallback, not idealized health-monitoring",
  description:
    "If a provider fails, the next provider in priority order is tried immediately — synchronously, within the same request, not via a separate background health-check process.",
  detail:
    "A provider that fails is skipped for 60 seconds afterward, so a request doesn't repeatedly retry a provider that's currently down — it becomes eligible again automatically once the cooldown passes. This is a real, working mechanism — a simple cooldown, not a formal multi-state circuit breaker.",
};

// ---------- Circuit Breaker (honestly scoped — not a 3-state machine) ----------

export const CIRCUIT_BREAKER_REALITY = {
  title: "A real cooldown mechanism — simpler than a formal circuit breaker",
  description:
    "Each AI provider that fails is temporarily skipped for 60 seconds before being retried again. This prevents wasted time repeatedly calling a provider that just failed.",
  detail:
    "We're not going to claim a textbook closed/open/half-open state machine we haven't built. What's real: a per-provider cooldown timer, checked before every attempt. We're honest about the difference because we'd rather you trust what we say elsewhere on this page.",
};

// ---------- Queue Management / Retry Engine ----------
// 7 real BullMQ queues, real exponential backoff per queue.

export const RUNTIME_QUEUES: QueueSummary[] = [
  { name: "Workflow Execution", purpose: "Runs Automation Builder workflows.", retryPolicy: "Configurable per workflow" },
  { name: "Scheduler", purpose: "Recurring and scheduled jobs.", retryPolicy: "Configurable per job" },
  { name: "Webhook Delivery", purpose: "Delivers outbound webhooks.", retryPolicy: "Exponential backoff" },
  { name: "RAG Embedding", purpose: "Generates embeddings for the knowledge base.", retryPolicy: "3 attempts, exponential backoff" },
  { name: "AI Fallback Retry", purpose: "Durable retry when every AI provider fails on a request.", retryPolicy: "5 attempts, exponential backoff" },
  { name: "Company Discovery", purpose: "Background company research jobs.", retryPolicy: "2 attempts, exponential backoff" },
  { name: "Billing Recurring", purpose: "Subscription renewals, dunning, trial reminders.", retryPolicy: "3 attempts, exponential backoff" },
];

export const QUEUE_REALITY_NOTE =
  "All 7 queues run as real BullMQ workers today, in the same process as the application. Failed-job review and manual retry is available for the Scheduler queue; the others report aggregate health (active/waiting/failed counts) but don't yet have a dedicated retry UI of their own.";

// ---------- Rate Limits ----------

export const RATE_LIMIT_REALITY = {
  title: "Real rate limiting on sensitive endpoints; provider quotas are respected, not internally dashboarded",
  description:
    "Authentication and abuse-prone endpoints are protected by a real, Redis-backed distributed rate limiter. Free-tier AI providers each enforce their own request/token quotas — when one is hit, the fallback chain moves to the next provider automatically.",
  detail:
    "We don't yet expose a live 'quota remaining per provider' dashboard internally — that's on our roadmap, not built yet.",
};

// ---------- AI Cost Tracking ----------

export const COST_TRACKING_REALITY = {
  title: "Real, per-request token and cost tracking",
  description:
    "Every AI call records real token usage from the provider's own response — not an estimate — against your organization's AI credit balance.",
  detail: "See your own usage in Billing → AI Credits once you're signed in.",
};

// ---------- Worker Infrastructure ----------

export const WORKER_INFRASTRUCTURE = {
  title: "7 real background workers, running today",
  description: "Seven independent BullMQ workers process jobs concurrently, each with its own concurrency limit.",
  detail:
    "Today these run in-process alongside the application on a single instance. Kubernetes autoscaling manifests (2–10 replicas) and a PM2 cluster-mode config both exist in this codebase for a future multi-instance deployment — real files, but not what's actively running in production yet. We're not going to claim horizontal scaling that isn't live.",
};

// ---------- AI Security ----------
// Reuses the same real facts as the Security & Compliance Trust Center,
// framed for AI specifically.

export const AI_SECURITY_ITEMS: AISecurityItem[] = [
  { title: "Encrypted Secrets", description: "Connected integration credentials and platform secrets are encrypted at rest with AES-256-GCM." },
  { title: "Request Validation", description: "Every AI request's input is schema-validated before it's sent to a provider." },
  { title: "Hash-Chained Audit Logs", description: "Sensitive actions are recorded in a tamper-evident audit trail." },
  { title: "Role-Based Access", description: "AI features respect the same tenant-isolated, role-based permission model as the rest of the platform." },
  { title: "Rate Limiting", description: "Sensitive endpoints are protected by a real, Redis-backed distributed rate limiter." },
  { title: "Tenant Data Isolation", description: "Every AI operation is scoped to its own organization — no cross-tenant data access." },
];

// ---------- Developer Runtime APIs ----------

export const DEVELOPER_API_ITEMS: DeveloperApiItem[] = [
  { name: "REST API", status: "Available", description: "A real, authenticated API for programmatic access." },
  { name: "API Keys", status: "Available", description: "Create and revoke bearer API keys from your account settings." },
  { name: "Webhooks", status: "Available", description: "Real outbound webhook delivery with automatic retry." },
  { name: "Streaming API", status: "Coming Soon", description: "Token-by-token streaming responses." },
  { name: "SDKs", status: "Coming Soon", description: "Official client libraries." },
  { name: "API Playground", status: "Coming Soon", description: "Interactive in-browser API explorer." },
  { name: "OpenAPI Specification", status: "Coming Soon", description: "A machine-readable API spec." },
];

// ---------- Future AI Roadmap ----------
// Explicitly framed as future/not-yet-built — honest by design.

export const AI_ROADMAP: RoadmapItem[] = [
  { title: "Per-Provider Health Dashboard", description: "Real-time latency and success-rate tracking, broken down by provider." },
  { title: "AI Response Caching", description: "A caching layer for repeated prompts and embeddings, to cut cost and latency." },
  { title: "Distributed Tracing", description: "Turning on the OpenTelemetry scaffolding already in the codebase for full request tracing." },
  { title: "Multi-Instance Worker Scaling", description: "Activating the Kubernetes/PM2 configs already in the codebase for horizontal scaling." },
  { title: "Full Dead-Letter-Queue Management", description: "Extending failed-job review and retry to all 7 background queues, not just one." },
];

// ---------- Architecture-only: no real content yet ----------

export const AI_RUNTIME_COMING_SOON: ComingSoonResource[] = [
  { title: "AI Health Dashboard", description: "A live, per-provider latency and success-rate view is on our roadmap." },
  { title: "Live Observability & Tracing", description: "Distributed tracing infrastructure exists in code but isn't turned on yet." },
  { title: "AI Response Caching", description: "No response, prompt, or embedding cache exists yet — every request currently reaches a real provider." },
];
