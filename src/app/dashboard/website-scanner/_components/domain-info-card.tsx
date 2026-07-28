import type { DomainInfo } from "@/generated/prisma/client";

/** Real RDAP domain-registration facts (src/lib/scanner/domain-info.ts) — honestly reports when the lookup didn't succeed, never a guessed date. */
export function DomainInfoCard({ domainInfo }: { domainInfo: DomainInfo | null }) {
  if (!domainInfo || !domainInfo.lookupSucceeded) {
    return (
      <p className="text-sm text-muted-foreground">
        {domainInfo?.lookupError ?? "Domain registration lookup was not available for this scan."}
      </p>
    );
  }

  const stats = [
    { label: "Domain", value: domainInfo.domain },
    { label: "Registrar", value: domainInfo.registrar ?? "Unknown" },
    { label: "Registered on", value: domainInfo.registeredAt ? new Date(domainInfo.registeredAt).toLocaleDateString() : "Unknown" },
    { label: "Domain age", value: domainInfo.domainAgeDays !== null ? `${Math.floor(domainInfo.domainAgeDays / 365)}y ${domainInfo.domainAgeDays % 365}d (${domainInfo.domainAgeDays} days)` : "Unknown" },
    { label: "Expires", value: domainInfo.expiresAt ? new Date(domainInfo.expiresAt).toLocaleDateString() : "Unknown" },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {stats.map((s) => (
        <div key={s.label}>
          <p className="text-xs text-muted-foreground">{s.label}</p>
          <p className="text-sm font-medium text-foreground">{s.value}</p>
        </div>
      ))}
    </div>
  );
}
