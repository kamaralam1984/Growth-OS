/**
 * Real, self-hosted open/click tracking — no third-party pixel service, same
 * "free and genuinely measured" philosophy as the geocoding/map phase.
 * Opens/clicks recorded here are real HTTP hits on our own routes, never an
 * estimate.
 */

/** Best-effort app base URL for building tracking/redirect links — no dedicated env var exists yet in this app, so this falls back to the documented local dev port. */
export function getAppBaseUrl(): string {
  return process.env.AUTH_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3040";
}

/** Rewrites <a href> links through the click-tracking redirect and appends a 1x1 open-tracking pixel. */
export function injectTracking(html: string, trackingToken: string, baseUrl: string): string {
  const withTrackedLinks = html.replace(/href="(https?:\/\/[^"]+)"/g, (_match, url: string) => {
    const wrapped = `${baseUrl}/api/outreach/track/click/${trackingToken}?url=${encodeURIComponent(url)}`;
    return `href="${wrapped}"`;
  });

  const pixel = `<img src="${baseUrl}/api/outreach/track/open/${trackingToken}" width="1" height="1" alt="" style="display:none" />`;
  return `${withTrackedLinks}${pixel}`;
}
