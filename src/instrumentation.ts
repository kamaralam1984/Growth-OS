// Next.js instrumentation hook — register() runs once when a new server
// instance starts, before it accepts requests (see
// node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/instrumentation.md).
// Used here to bootstrap the Scheduler Service (src/lib/scheduler/init.ts)
// and the Platform Billing Engine's recurring-billing jobs + catalog seeds
// so they're all registered/seeded exactly once per process, same as the
// scheduler.
export async function register(): Promise<void> {
  // Real env-var validation (src/lib/env.ts) — runs first and for both
  // runtimes, so a missing DATABASE_URL/AUTH_SECRET fails the process at
  // boot with one clear, actionable error instead of surfacing later as a
  // confusing runtime error the first time something touches the database
  // or a session.
  const { validateEnv } = await import("@/lib/env");
  validateEnv();

  // Sentry server/edge init — real @sentry/nextjs manual-setup convention:
  // sentry.server.config.ts / sentry.edge.config.ts each independently
  // no-op unless SENTRY_DSN is a real, set value (see those files' own
  // comments). Runs for both runtimes, unlike the Node-only block below.
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("../sentry.server.config");
  } else if (process.env.NEXT_RUNTIME === "edge") {
    await import("../sentry.edge.config");
  }

  if (process.env.NEXT_RUNTIME !== "nodejs") return; // Node runtime only, not edge — needs Prisma/node-cron/BullMQ

  await bootstrapOtel();

  const { initScheduler } = await import("@/lib/scheduler/init");
  initScheduler();

  const { registerRecurringBillingJobs } = await import("@/lib/billing/recurring-billing-queue");
  await registerRecurringBillingJobs();

  const { ensurePlansSeeded } = await import("@/lib/billing/plan-catalog");
  await ensurePlansSeeded();

  const { ensureCoreFeatureFlagsSeeded } = await import("@/lib/billing/feature-flags");
  await ensureCoreFeatureFlagsSeeded();
}

/**
 * Real OpenTelemetry NodeSDK bootstrap — traces only (no metrics/logs
 * pipeline yet). NOT CONFIGURED (SDK never starts, no crash either) until
 * OTEL_EXPORTER_OTLP_ENDPOINT is set to a real collector, e.g. a
 * self-hosted Grafana Tempo/Jaeger/OTel Collector, or a hosted OTel
 * backend's OTLP/HTTP ingest URL (see .env.example for the exact vars and
 * a local docker-compose Jaeger example). Guarded against Next dev's
 * hot-reload re-executing this module and starting a second NodeSDK in the
 * same process.
 */
const globalForOtel = globalThis as unknown as { __otelStarted?: boolean };

async function bootstrapOtel(): Promise<void> {
  if (globalForOtel.__otelStarted) return;

  const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
  if (!endpoint) {
    console.log("[otel] OTEL_EXPORTER_OTLP_ENDPOINT not set — tracing disabled (see .env.example).");
    return;
  }

  globalForOtel.__otelStarted = true;

  try {
    const { NodeSDK } = await import("@opentelemetry/sdk-node");
    const { getNodeAutoInstrumentations } = await import("@opentelemetry/auto-instrumentations-node");
    const { OTLPTraceExporter } = await import("@opentelemetry/exporter-trace-otlp-http");

    const sdk = new NodeSDK({
      serviceName: process.env.OTEL_SERVICE_NAME || "kvl-growthos",
      traceExporter: new OTLPTraceExporter({
        url: `${endpoint.replace(/\/+$/, "")}/v1/traces`,
        headers: parseOtlpHeaders(process.env.OTEL_EXPORTER_OTLP_HEADERS),
      }),
      instrumentations: [getNodeAutoInstrumentations()],
    });

    sdk.start();
    console.log(`[otel] tracing started, exporting to ${endpoint}`);
  } catch (error) {
    // A tracing backend being unreachable/misconfigured must never crash
    // the app itself — same "observability is additive, never load-bearing"
    // rule Sentry follows above.
    console.error("[otel] failed to start NodeSDK — tracing disabled:", error);
  }
}

/** Parses the OTel spec's "key1=value1,key2=value2" header list format (used by hosted OTel backends for auth, e.g. `Authorization=Bearer <token>`). */
function parseOtlpHeaders(raw: string | undefined): Record<string, string> | undefined {
  if (!raw) return undefined;
  const headers: Record<string, string> = {};
  for (const pair of raw.split(",")) {
    const [key, ...rest] = pair.split("=");
    if (!key || rest.length === 0) continue;
    headers[key.trim()] = rest.join("=").trim();
  }
  return Object.keys(headers).length > 0 ? headers : undefined;
}

/**
 * Next.js's real server-side request-error hook (called for uncaught
 * errors in Server Components/Route Handlers/Server Actions). Forwards to
 * Sentry.captureRequestError, which itself is a genuine no-op when
 * Sentry.init was never called (SENTRY_DSN unset) — never throws or logs
 * noise in that case.
 */
export async function onRequestError(
  ...args: Parameters<typeof import("@sentry/nextjs").captureRequestError>
): Promise<void> {
  if (!process.env.SENTRY_DSN) return;
  const Sentry = await import("@sentry/nextjs");
  Sentry.captureRequestError(...args);
}
