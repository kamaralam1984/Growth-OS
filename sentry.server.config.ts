// Sentry server-side (Node.js runtime) initialization — imported from
// src/instrumentation.ts's register() function per @sentry/nextjs's current
// manual-setup convention (sentry.server.config.ts / sentry.edge.config.ts,
// with sentry.client.config.ts replaced by instrumentation-client.ts in
// newer Next.js versions — see that file's own comment).
//
// NEVER initialized with a placeholder DSN: Sentry.init only runs when a
// real SENTRY_DSN is present in the environment. Without it, this file is a
// genuine no-op — no Sentry SDK network calls happen, no inert/placeholder
// project is contacted. See .env.example: "Not Configured" until a real DSN
// is supplied.
import * as Sentry from "@sentry/nextjs";

if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV,
    tracesSampleRate: 0.1,
    // Debug logging only in development, and only if explicitly opted into —
    // avoids noisy console output in the common case of DSN unset.
    debug: false,
  });
}
