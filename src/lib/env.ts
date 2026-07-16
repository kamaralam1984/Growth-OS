import { z } from "zod";

/**
 * Centralized boot-time environment validation. This does NOT replace every
 * existing `process.env.X` call site across the app (that would be a much
 * larger, separate refactor) — it's the one real Zod schema that
 * instrumentation.ts's register() calls once per process, so a missing
 * required var (DATABASE_URL, AUTH_SECRET — the only two this app cannot
 * run without, per .env.example) fails loudly at boot with an actionable
 * message instead of surfacing later as a confusing runtime error the
 * first time something touches the database or a session.
 *
 * Every other var in .env.example gates one specific optional
 * feature/integration (OAuth provider, payment gateway, e-signature
 * adapter, ...) and that feature already degrades honestly when its var is
 * unset (see each var's own comment in .env.example) — so all of them are
 * `.optional()` here, purely to give the rest of the app a single typed,
 * validated `env` object to read from as it's adopted over time, without
 * making any of them newly mandatory.
 */
const EnvSchema = z.object({
  // ---- Required — the app cannot boot without these ----
  DATABASE_URL: z.string().min(1),
  AUTH_SECRET: z.string().min(1),

  // ---- Redis (defaults to redis://localhost:6379 if unset) ----
  REDIS_URL: z.string().optional(),

  // ---- OAuth sign-in providers ----
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  MICROSOFT_ENTRA_ID_CLIENT_ID: z.string().optional(),
  MICROSOFT_ENTRA_ID_CLIENT_SECRET: z.string().optional(),
  MICROSOFT_ENTRA_ID_TENANT_ID: z.string().optional(),
  GITHUB_CLIENT_ID: z.string().optional(),
  GITHUB_CLIENT_SECRET: z.string().optional(),

  // ---- Magic-link (email) sign-in ----
  EMAIL_SERVER: z.string().optional(),
  EMAIL_FROM: z.string().optional(),

  // ---- Outreach Assistant email sending ----
  RESEND_API_KEY: z.string().optional(),
  RESEND_WEBHOOK_SECRET: z.string().optional(),

  // ---- Weather widget ----
  WEATHER_API_KEY: z.string().optional(),

  // ---- Integration Layer (account-linked OAuth) ----
  ADOBE_SIGN_CLIENT_ID: z.string().optional(),
  ADOBE_SIGN_CLIENT_SECRET: z.string().optional(),
  ADOBE_SIGN_SHARD: z.string().optional(),
  DOCUSIGN_INTEGRATION_KEY: z.string().optional(),
  DOCUSIGN_CLIENT_SECRET: z.string().optional(),
  DOCUSIGN_ENVIRONMENT: z.string().optional(),
  DROPBOX_SIGN_CLIENT_ID: z.string().optional(),
  DROPBOX_SIGN_CLIENT_SECRET: z.string().optional(),
  GOOGLE_INTEGRATION_CLIENT_ID: z.string().optional(),
  GOOGLE_INTEGRATION_CLIENT_SECRET: z.string().optional(),
  MICROSOFT_INTEGRATION_CLIENT_ID: z.string().optional(),
  MICROSOFT_INTEGRATION_CLIENT_SECRET: z.string().optional(),
  MICROSOFT_INTEGRATION_TENANT_ID: z.string().optional(),
  DOCUSIGN_WEBHOOK_HMAC_SECRET: z.string().optional(),

  // ---- Integration Hub (Phase 16) OAuth apps ----
  SLACK_CLIENT_ID: z.string().optional(),
  SLACK_CLIENT_SECRET: z.string().optional(),
  HUBSPOT_CLIENT_ID: z.string().optional(),
  HUBSPOT_CLIENT_SECRET: z.string().optional(),
  SALESFORCE_CLIENT_ID: z.string().optional(),
  SALESFORCE_CLIENT_SECRET: z.string().optional(),
  ZOHO_CLIENT_ID: z.string().optional(),
  ZOHO_CLIENT_SECRET: z.string().optional(),
  PIPEDRIVE_CLIENT_ID: z.string().optional(),
  PIPEDRIVE_CLIENT_SECRET: z.string().optional(),
  DROPBOX_CLIENT_ID: z.string().optional(),
  DROPBOX_CLIENT_SECRET: z.string().optional(),
  CALENDLY_CLIENT_ID: z.string().optional(),
  CALENDLY_CLIENT_SECRET: z.string().optional(),
  ZOOM_CLIENT_ID: z.string().optional(),
  ZOOM_CLIENT_SECRET: z.string().optional(),
  QUICKBOOKS_CLIENT_ID: z.string().optional(),
  QUICKBOOKS_CLIENT_SECRET: z.string().optional(),
  QUICKBOOKS_ENVIRONMENT: z.string().optional(),
  XERO_CLIENT_ID: z.string().optional(),
  XERO_CLIENT_SECRET: z.string().optional(),
  GITHUB_INTEGRATION_CLIENT_ID: z.string().optional(),
  GITHUB_INTEGRATION_CLIENT_SECRET: z.string().optional(),
  GITLAB_CLIENT_ID: z.string().optional(),
  GITLAB_CLIENT_SECRET: z.string().optional(),
  BITBUCKET_CLIENT_ID: z.string().optional(),
  BITBUCKET_CLIENT_SECRET: z.string().optional(),

  // ---- Encryption keys ----
  INTEGRATION_TOKEN_ENCRYPTION_KEY: z.string().optional(),
  SECRETS_MANAGER_ENCRYPTION_KEY: z.string().optional(),

  // ---- Platform Billing Engine gateways ----
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  RAZORPAY_KEY_ID: z.string().optional(),
  RAZORPAY_KEY_SECRET: z.string().optional(),
  RAZORPAY_WEBHOOK_SECRET: z.string().optional(),
  PADDLE_API_KEY: z.string().optional(),
  PADDLE_WEBHOOK_SECRET: z.string().optional(),
  PADDLE_ENVIRONMENT: z.string().optional(),
  LEMONSQUEEZY_API_KEY: z.string().optional(),
  LEMONSQUEEZY_STORE_ID: z.string().optional(),
  LEMONSQUEEZY_WEBHOOK_SECRET: z.string().optional(),

  // ---- Production Dashboard / Monitoring / Alerting / Backups ----
  SENTRY_DSN: z.string().optional(),
  NEXT_PUBLIC_SENTRY_DSN: z.string().optional(),
  SENTRY_ORG: z.string().optional(),
  SENTRY_PROJECT: z.string().optional(),
  SENTRY_AUTH_TOKEN: z.string().optional(),
  PLATFORM_ALERTS_SLACK_WEBHOOK_URL: z.string().optional(),
  PLATFORM_ALERTS_TEAMS_WEBHOOK_URL: z.string().optional(),
  BACKUP_DIR: z.string().optional(),

  // ---- Metrics endpoint (src/app/api/metrics/route.ts) ----
  METRICS_TOKEN: z.string().optional(),

  // ---- OpenTelemetry (instrumentation.ts) ----
  OTEL_EXPORTER_OTLP_ENDPOINT: z.string().optional(),
  OTEL_EXPORTER_OTLP_HEADERS: z.string().optional(),
  OTEL_SERVICE_NAME: z.string().optional(),
});

export type Env = z.infer<typeof EnvSchema>;

let cached: Env | undefined;

/**
 * Validates `process.env` against EnvSchema and throws a single, actionable
 * error listing every missing/invalid required var if validation fails.
 * Safe to call more than once per process (memoized) — instrumentation.ts
 * calls this once from register(), but nothing prevents another call site
 * from calling it too.
 */
export function validateEnv(): Env {
  if (cached) return cached;

  const result = EnvSchema.safeParse(process.env);
  if (!result.success) {
    const missing = result.error.issues.map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`).join("\n");
    throw new Error(
      `Invalid/missing environment variables — see .env.example for how to set each one:\n${missing}`,
    );
  }

  cached = result.data;
  return cached;
}

/**
 * The validated, typed env object. Only safe to import from server-side
 * code (route handlers, server actions, instrumentation.ts) — reading this
 * module triggers validation of `process.env` on first access, which
 * throws if a required var is missing.
 */
export const env: Env = new Proxy({} as Env, {
  get(_target, prop: string) {
    return validateEnv()[prop as keyof Env];
  },
});
