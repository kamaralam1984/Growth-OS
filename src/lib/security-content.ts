/**
 * Single source of truth for the Enterprise Security & Compliance Trust
 * Center (src/components/sections/security-trust/*.tsx, src/app/trust/page.tsx).
 *
 * Every claim below was independently verified against this codebase (3
 * research passes, 2026-07-29) before being written. Confirmed FALSE and
 * deliberately never claimed anywhere in this file: enterprise SSO/SAML
 * (only consumer OAuth exists), passkeys/WebAuthn, MFA beyond TOTP, API key
 * expiration/rotation, automated encryption-key rotation, firewall/WAF/DDoS
 * protection, OS-level server hardening, multi-region/customer-selectable
 * data residency, any third-party certification (SOC2/ISO27001/PCI DSS/
 * OWASP/NIST/etc.), any real penetration test, and any vulnerability-
 * disclosure program (security.txt/PGP/bug bounty). Hosting is described
 * generically (no provider/region named) per a deliberate business decision,
 * not because it's unknown.
 */

export interface SecurityPrinciple {
  title: string;
  description: string;
  detail: string;
}

export interface ComplianceFrameworkSummary {
  framework: string;
  status: "Architecture Ready" | "Partial" | "Available on Request";
  description: string;
}

export interface EncryptionDetail {
  label: string;
  description: string;
}

export interface InfrastructureSecurityItem {
  title: string;
  description: string;
  detail: string;
}

export interface AccessControlItem {
  title: string;
  description: string;
}

export interface MonitoringStage {
  stage: string;
  description: string;
}

export interface SecurityDocument {
  name: string;
  status: "Available" | "Available on Request";
  href?: string;
}

export interface SecurityTrustBadge {
  label: string;
}

export interface ComingSoonResource {
  title: string;
  description: string;
}

// ---------- Security Principles ----------
// Real engineering practices this codebase follows — deliberately omits
// "Zero Trust" and "Defense in Depth" as named architecture claims, since
// neither is literally implemented as a formal zero-trust network.

export const SECURITY_PRINCIPLES: SecurityPrinciple[] = [
  {
    title: "Least Privilege",
    description: "Every workspace member gets only the access their role requires.",
    detail:
      "Ten distinct membership roles (Owner, Admin, Manager, Sales, Marketing, Developer, Support, Finance, HR, Viewer) enforced through a real access-control layer, not just UI hiding — attempts to exceed a role's permissions are rejected server-side.",
  },
  {
    title: "Encryption for Sensitive Data",
    description: "Sensitive data is encrypted at rest across independent key domains.",
    detail:
      "Agent memory, integration tokens, the secrets vault, webhook secrets, and 2FA secrets are each encrypted with AES-256-GCM under their own independent key — a compromise of one key domain doesn't expose the others.",
  },
  {
    title: "Secure Development Lifecycle",
    description: "Every change goes through automated checks before it ships.",
    detail:
      "Lint, type-checking, automated tests, and static analysis (CodeQL) run in CI on every push and pull request against real Postgres and Redis service containers.",
  },
  {
    title: "Continuous Monitoring",
    description: "Real-time health checks across every critical dependency.",
    detail:
      "Database, cache, storage, and job-queue health are checked live and recorded over time, with automated alerting on failure — not a static status page.",
  },
  {
    title: "Business Continuity",
    description: "A documented, runnable recovery process, not just a policy statement.",
    detail:
      "A concrete disaster-recovery runbook with real backup/restore commands, honestly-stated recovery targets, and a documented gap list — reviewed and updated as the platform evolves.",
  },
];

// ---------- Compliance Center ----------
// Static-but-real summary of src/lib/security/compliance.ts's actual
// per-framework code-verifiable checks. Every entry restates the same
// disclaimer that file and docs/guides/compliance-guide.md already use.

const COMPLIANCE_DISCLAIMER =
  "A real architectural-readiness snapshot generated from this codebase's own infrastructure — not a certification, attestation, or legal determination. A genuine certification requires an accredited third-party auditor or legal counsel review.";

export const COMPLIANCE_FRAMEWORKS: ComplianceFrameworkSummary[] = [
  {
    framework: "SOC 2",
    status: "Architecture Ready",
    description: "Access control, encryption, audit logging, and monitoring controls code-verified. " + COMPLIANCE_DISCLAIMER,
  },
  {
    framework: "ISO 27001",
    status: "Architecture Ready",
    description: "Information-security control checks (access management, cryptography, logging) code-verified. " + COMPLIANCE_DISCLAIMER,
  },
  {
    framework: "GDPR",
    status: "Architecture Ready",
    description: "Real cookie consent, data export, and account deletion/anonymization flows in place. " + COMPLIANCE_DISCLAIMER,
  },
  {
    framework: "CCPA",
    status: "Architecture Ready",
    description: "Consumer data-access and deletion request handling code-verified. " + COMPLIANCE_DISCLAIMER,
  },
  {
    framework: "DPDP (India)",
    status: "Architecture Ready",
    description: "Consent-recording and data-principal rights handling code-verified. " + COMPLIANCE_DISCLAIMER,
  },
  {
    framework: "PCI DSS",
    status: "Partial",
    description: "Card data is never handled directly by this platform (processed by connected payment gateways); platform-side controls code-verified where applicable. " + COMPLIANCE_DISCLAIMER,
  },
  {
    framework: "WCAG (Accessibility)",
    status: "Architecture Ready",
    description: "Automated axe-core scans against real rendered pages, run on demand — not a certified conformance audit. " + COMPLIANCE_DISCLAIMER,
  },
];

// ---------- Encryption Details ----------

export const ENCRYPTION_DETAILS: EncryptionDetail[] = [
  { label: "AES-256-GCM Encryption", description: "Sensitive data — agent memory, integration tokens, secrets, webhook signing keys, 2FA secrets — encrypted at rest, each under its own independent key." },
  { label: "TLS / HTTPS", description: "Production traffic is served over HTTPS." },
  { label: "Password Hashing", description: "Passwords are hashed with bcrypt/Argon2 — never stored in plain text, never reversible." },
  { label: "Secrets Management", description: "A dedicated, encrypted secrets vault stores credentials — values are never selectable through the listing UI, only metadata." },
  { label: "Encrypted API Tokens", description: "Integration OAuth tokens and API credentials are encrypted before being stored." },
];

// ---------- Data Privacy Center / GDPR & DPA ----------

export const DPA_STATUS: SecurityDocument = { name: "Data Processing Agreement (DPA)", status: "Available on Request" };

// ---------- Data Residency ----------

export const DATA_RESIDENCY_STATEMENT = {
  current: "Single-region, cloud-hosted deployment today.",
  detail:
    "All application data is currently hosted in a single cloud region. Customer-selectable region and multi-region failover are on our roadmap but not available yet — we won't claim otherwise until they're real.",
};

// ---------- Infrastructure Security ----------
// Firewall / WAF / DDoS protection / server hardening are deliberately
// omitted — confirmed not implemented by this app or its deployment config.

export const INFRASTRUCTURE_SECURITY: InfrastructureSecurityItem[] = [
  {
    title: "Cloud-Hosted",
    description: "Runs on containerized cloud infrastructure.",
    detail: "The application, database, and cache each run in isolated containers, orchestrated with automated health checks and restarts.",
  },
  {
    title: "Network Isolation",
    description: "The database and cache are never exposed to the public internet.",
    detail: "Only the application itself is reachable externally; the database and cache are only reachable from within the internal network.",
  },
  {
    title: "Rate Limiting",
    description: "Redis-backed sliding-window rate limiting on sensitive endpoints.",
    detail: "Authentication, API, and other abuse-prone endpoints are protected by a real distributed rate limiter, with an in-memory fallback if the cache is unreachable — it never fails open.",
  },
  {
    title: "Container Hardening",
    description: "Application containers run as a non-root user with resource limits.",
    detail: "No component of the application runs with elevated privileges inside its container, and resource limits prevent any single component from starving the rest.",
  },
  {
    title: "Automated Backups",
    description: "Checksummed database backups run automatically every night.",
    detail: "A nightly job creates a verified (SHA-256 checksummed) database backup automatically — see our disaster-recovery practices for real recovery targets.",
  },
];

// ---------- Access Control ----------
// SSO, Passkeys, and API-key expiration/rotation are deliberately omitted —
// confirmed not implemented.

export const ACCESS_CONTROL_ITEMS: AccessControlItem[] = [
  { title: "Role-Based Access Control", description: "Ten distinct roles with server-enforced, tenant-isolated permissions." },
  { title: "Two-Factor Authentication (TOTP)", description: "Authenticator-app-based 2FA, with the secret encrypted at rest." },
  { title: "Session Security", description: "Sessions can be revoked server-side at any time — a real 'log out everywhere,' not just clearing a cookie." },
  { title: "Hash-Chained Audit Logs", description: "Sensitive actions are recorded in a tamper-evident, cryptographically chained audit trail." },
  { title: "API Authentication", description: "API access uses bearer tokens that are hashed before storage — the raw key is never stored or retrievable again after creation." },
  { title: "Secrets Vault", description: "Credentials are encrypted at rest in a dedicated vault, never exposed through the listing UI." },
];

// ---------- Monitoring & Incident Response ----------

export const MONITORING_STAGES: MonitoringStage[] = [
  { stage: "Continuous Health Checks", description: "Database, cache, storage, and queue health are checked automatically and recorded over time." },
  { stage: "Automated Alerting", description: "Critical alerts are dispatched automatically to our operations channel the moment they're detected." },
  { stage: "Incident Tracking", description: "Real incidents are logged, tracked to resolution, and reviewed — not handled ad hoc." },
  { stage: "Transparent Status", description: "Real historical uptime is publicly visible on our status page — not a marketing claim." },
];

// ---------- Enterprise Documents ----------

export const SECURITY_DOCUMENTS: SecurityDocument[] = [
  { name: "Privacy Policy", status: "Available", href: "/privacy" },
  { name: "Terms of Service", status: "Available", href: "/terms" },
  { name: "Cookie Policy", status: "Available", href: "/cookies" },
  { name: "Data Processing Agreement (DPA)", status: "Available on Request" },
  { name: "Security Whitepaper", status: "Available on Request" },
  { name: "Service Level Agreement (SLA)", status: "Available on Request" },
  { name: "Business Continuity & Disaster Recovery Summary", status: "Available on Request" },
  { name: "Access Request Form", status: "Available on Request" },
];

// ---------- Enterprise Trust Badges ----------
// "Zero Trust" and "Secure APIs" (unqualified) are deliberately omitted —
// reworded to what's actually true.

export const SECURITY_TRUST_BADGES: SecurityTrustBadge[] = [
  { label: "Encrypted Sensitive Data" },
  { label: "Role-Based Access Control" },
  { label: "Hash-Chained Audit Logs" },
  { label: "Automated Nightly Backups" },
  { label: "Cloud-Hosted" },
  { label: "GDPR Data Controls" },
  { label: "Enterprise Support" },
];

// ---------- Architecture-only: no real content yet ----------
// Combined into one honest "Coming Soon" resources card — never fabricated.

export const COMING_SOON_RESOURCES: ComingSoonResource[] = [
  { title: "Security Whitepaper", description: "A downloadable architecture and controls overview is in progress." },
  { title: "Penetration Testing", description: "No third-party penetration test has been conducted yet — real results will be published here once one has." },
  { title: "Responsible Disclosure Program", description: "A formal vulnerability-disclosure policy and security contact are in progress." },
];
