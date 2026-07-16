// Sentry client-side (browser) initialization — Next.js's real
// instrumentation-client.ts convention (this file replaces the older
// sentry.client.config.ts approach in current @sentry/nextjs + Next.js
// versions; see node_modules/next/dist/docs/01-app/03-api-reference/
// 03-file-conventions/instrumentation-client.md).
//
// Browser code can only read NEXT_PUBLIC_-prefixed env vars (Next.js only
// inlines those into the client bundle) — so this is gated on
// NEXT_PUBLIC_SENTRY_DSN specifically, a separate var from the server/edge
// configs' plain SENTRY_DSN (set both to the same real DSN value; see
// .env.example). Without it, this is a genuine no-op.
import * as Sentry from "@sentry/nextjs";

if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    tracesSampleRate: 0.1,
    debug: false,
  });
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
