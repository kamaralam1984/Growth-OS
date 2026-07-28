/**
 * Real RDAP (WHOIS's modern HTTP/JSON successor) domain-registration lookup —
 * no API key needed, no paid service. Uses rdap.org's public bootstrap
 * redirector to find and query the TLD's actual authoritative RDAP server —
 * a fixed, trusted host we call directly (same "only ever call a known
 * trusted endpoint" pattern as geocode.ts; this is not a user-supplied
 * arbitrary URL, so safe-fetch.ts's SSRF machinery doesn't apply here).
 * A real, honest lookup: any failure (unsupported TLD, rate limit, no RDAP
 * record) is reported as lookupSucceeded=false with a real error string —
 * never backfilled with a guessed registration date.
 */

const RDAP_TIMEOUT_MS = 8_000;

export interface DomainInfoResult {
  domain: string;
  registrar: string | null;
  registeredAt: Date | null;
  domainAgeDays: number | null;
  expiresAt: Date | null;
  rdapSource: string | null;
  lookupSucceeded: boolean;
  lookupError: string | null;
}

interface RdapEvent {
  eventAction: string;
  eventDate: string;
}

interface RdapEntity {
  roles?: string[];
  vcardArray?: [string, unknown[][]];
}

interface RdapResponse {
  events?: RdapEvent[];
  entities?: RdapEntity[];
}

function extractRegistrarName(entities: RdapEntity[] | undefined): string | null {
  const registrarEntity = entities?.find((e) => e.roles?.includes("registrar"));
  const fields = registrarEntity?.vcardArray?.[1];
  if (!fields) return null;
  const fnField = fields.find((f) => Array.isArray(f) && f[0] === "fn");
  return typeof fnField?.[3] === "string" ? fnField[3] : null;
}

function extractEventDate(events: RdapEvent[] | undefined, action: string): Date | null {
  const eventDate = events?.find((e) => e.eventAction === action)?.eventDate;
  if (!eventDate) return null;
  const date = new Date(eventDate);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Registrable domain (e.g. "example.com"), not a subdomain — RDAP is a registry-level query. */
function toRegistrableDomain(hostname: string): string {
  const parts = hostname.toLowerCase().split(".");
  return parts.length > 2 ? parts.slice(-2).join(".") : hostname.toLowerCase();
}

export async function lookupDomainInfo(hostname: string): Promise<DomainInfoResult> {
  const domain = toRegistrableDomain(hostname);
  const fail = (error: string): DomainInfoResult => ({
    domain,
    registrar: null,
    registeredAt: null,
    domainAgeDays: null,
    expiresAt: null,
    rdapSource: null,
    lookupSucceeded: false,
    lookupError: error,
  });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), RDAP_TIMEOUT_MS);
  try {
    const response = await fetch(`https://rdap.org/domain/${encodeURIComponent(domain)}`, {
      signal: controller.signal,
      headers: { Accept: "application/rdap+json, application/json" },
    });
    if (!response.ok) {
      return fail(`RDAP lookup returned HTTP ${response.status} for "${domain}" — this TLD's registry may not support RDAP, or the domain isn't registered.`);
    }

    const data = (await response.json()) as RdapResponse;
    const registeredAt = extractEventDate(data.events, "registration");
    const expiresAt = extractEventDate(data.events, "expiration");
    const registrar = extractRegistrarName(data.entities);

    if (!registeredAt) {
      return { ...fail("RDAP response for this domain did not include a registration date."), registrar, expiresAt };
    }

    return {
      domain,
      registrar,
      registeredAt,
      domainAgeDays: Math.floor((Date.now() - registeredAt.getTime()) / (1000 * 60 * 60 * 24)),
      expiresAt,
      rdapSource: response.url || "https://rdap.org",
      lookupSucceeded: true,
      lookupError: null,
    };
  } catch (error) {
    return fail(error instanceof Error && error.name === "AbortError" ? "RDAP lookup timed out." : "Could not complete RDAP lookup.");
  } finally {
    clearTimeout(timeout);
  }
}
