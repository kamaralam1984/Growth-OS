/**
 * Real TLS certificate issuance for a verified custom domain is genuinely
 * infrastructure-level work this Next.js application code cannot perform by
 * itself. It requires one of:
 *   - A hosting platform's domain API that provisions and terminates TLS
 *     for you (Vercel's Domains API, Cloudflare for SaaS's Custom Hostnames
 *     API), or
 *   - A running ACME client (Let's Encrypt) with actual control over the
 *     reverse proxy / load balancer that terminates TLS in front of this
 *     app.
 * Neither exists in this repo's scope, so this file is a thin, honestly-
 * labeled adapter seam only — not a working implementation. Whoever
 * operates this deployment wires a real integration in here once they've
 * picked a hosting platform. Until then, CustomDomain.sslIssuedAt MUST stay
 * null; nothing in this codebase should ever fabricate an "issued" state.
 */
export interface SslProvider {
  requestCertificate(domain: string): Promise<never>;
}

export const sslProvider: SslProvider = {
  async requestCertificate(domain: string): Promise<never> {
    throw new Error(
      `SSL certificate issuance for "${domain}" is not implemented — wire in your hosting platform's domain API ` +
        `(e.g. Vercel Domains API, Cloudflare for SaaS) or a running ACME/Let's Encrypt client with control over ` +
        `the TLS termination layer in front of this deployment.`,
    );
  },
};
