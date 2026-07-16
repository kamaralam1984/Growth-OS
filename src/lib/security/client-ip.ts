/**
 * The one trustworthy client-IP source in this stack: nginx
 * (nginx/nginx.conf) sets `X-Real-IP: $remote_addr` on every proxied
 * request, and `proxy_set_header` always overwrites that header before
 * forwarding upstream — so the value this app sees is nginx's own view of
 * the TCP peer, never something the client can inject.
 *
 * `X-Forwarded-For` is NOT safe to trust for its first entry: nginx's
 * `$proxy_add_x_forwarded_for` only *appends* the real IP to whatever the
 * client already sent, so a client can freely prepend an arbitrary value
 * (`X-Forwarded-For: 1.2.3.4`) and get a fresh identity on every request —
 * defeating any IP-keyed rate limit or lockout that reads XFF's first hop.
 * Only fall back to XFF (its last entry, closest to us) when X-Real-IP is
 * entirely absent — e.g. local dev without nginx in front, where this is
 * best-effort only, not a real trust boundary.
 */
export function clientIpFromHeaders(headers: Headers): string {
  const realIp = headers.get("x-real-ip");
  if (realIp?.trim()) return realIp.trim();

  const forwardedFor = headers.get("x-forwarded-for");
  if (forwardedFor) {
    const hops = forwardedFor
      .split(",")
      .map((hop) => hop.trim())
      .filter(Boolean);
    const closest = hops.at(-1);
    if (closest) return closest;
  }

  return "unknown";
}
