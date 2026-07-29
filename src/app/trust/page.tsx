import type { Metadata } from "next";

import { Navbar } from "@/components/sections/navbar";
import { Footer } from "@/components/sections/footer";
import { CTA } from "@/components/sections/cta";
import { Certifications } from "@/components/sections/trust/certifications";
import { SecurityHero } from "@/components/sections/security-trust/security-hero";
import { SecurityArchitecture } from "@/components/sections/security-trust/security-architecture";
import { SecurityPrinciples } from "@/components/sections/security-trust/security-principles";
import { ComplianceCenter } from "@/components/sections/security-trust/compliance-center";
import { EncryptionDetails } from "@/components/sections/security-trust/encryption-details";
import { DataPrivacyCenter } from "@/components/sections/security-trust/data-privacy-center";
import { GdprDpa } from "@/components/sections/security-trust/gdpr-dpa";
import { DataResidency } from "@/components/sections/security-trust/data-residency";
import { SecurityResources } from "@/components/sections/security-trust/security-resources";
import { InfrastructureSecurity } from "@/components/sections/security-trust/infrastructure-security";
import { AccessControl } from "@/components/sections/security-trust/access-control";
import { MonitoringIncidentResponse } from "@/components/sections/security-trust/monitoring-incident-response";
import { SecurityDocuments } from "@/components/sections/security-trust/security-documents";
import { SecurityTrustBar } from "@/components/sections/security-trust/security-trust-bar";

export const metadata: Metadata = {
  title: "Trust Center — KVL GrowthOS",
  description:
    "Security, compliance readiness, access control, and infrastructure — in detail, with no fabricated claims.",
  alternates: { canonical: "/trust" },
};

/**
 * Enterprise Security & Compliance Trust Center. Every section here is
 * grounded in src/lib/security-content.ts, which was written only after
 * independently verifying each claim against this codebase — nothing here
 * claims SSO, passkeys, third-party certifications, a real penetration
 * test, or multi-region hosting, since none of those are real yet.
 */
export default function TrustCenterPage() {
  return (
    <div className="theme-luxury">
      <Navbar />
      <main className="pt-16 sm:pt-24">
        <SecurityHero />
        <SecurityTrustBar />
        <SecurityArchitecture />
        <SecurityPrinciples />
        <ComplianceCenter />
        <Certifications />
        <EncryptionDetails />
        <AccessControl />
        <InfrastructureSecurity />
        <MonitoringIncidentResponse />
        <DataPrivacyCenter />
        <GdprDpa />
        <DataResidency />
        <SecurityResources />
        <SecurityDocuments />
        <CTA />
      </main>
      <Footer />
    </div>
  );
}
