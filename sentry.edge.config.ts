// Sentry Edge runtime initialization — imported from src/instrumentation.ts's
// register() function when NEXT_RUNTIME === "edge". Same real-DSN gate as
// sentry.server.config.ts: Sentry.init only runs when SENTRY_DSN is set.
import * as Sentry from "@sentry/nextjs";

if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV,
    tracesSampleRate: 0.1,
    debug: false,
  });
}
