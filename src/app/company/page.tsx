import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Container } from "@/components/ui/container";
import { Badge } from "@/components/ui/badge";
import {
  officeLocationsSchema,
  workingHoursSchema,
  certificatesSchema,
  awardsSchema,
  caseStudiesSchema,
  portfolioItemsSchema,
  WEEKDAYS,
  type OfficeLocationInput,
  type WorkingHoursInput,
  type CertificateInput,
  type AwardInput,
  type CaseStudyInput,
  type PortfolioItemInput,
} from "@/lib/validations/company";

import { CompanyBasicsSection } from "./_components/company-basics-section";
import { CompanyServicesSection } from "./_components/company-services-section";
import { OfficeLocationsSection } from "./_components/office-locations-section";
import { WorkingHoursSection } from "./_components/working-hours-section";
import { CertificatesSection } from "./_components/certificates-section";
import { AwardsSection } from "./_components/awards-section";
import { CaseStudiesSection } from "./_components/case-studies-section";
import { PortfolioSection } from "./_components/portfolio-section";
import { ApprovalPolicySection } from "./_components/approval-policy-section";

function parseOfficeLocations(raw: unknown): OfficeLocationInput[] {
  const parsed = officeLocationsSchema.safeParse(raw);
  return parsed.success ? parsed.data : [];
}

function defaultWorkingHours(): WorkingHoursInput {
  const entries = WEEKDAYS.map((day) => [day, { closed: day === "saturday" || day === "sunday", open: "", close: "" }] as const);
  return Object.fromEntries(entries) as WorkingHoursInput;
}

function parseWorkingHours(raw: unknown): WorkingHoursInput {
  const parsed = workingHoursSchema.safeParse(raw);
  if (!parsed.success) return defaultWorkingHours();
  const defaults = defaultWorkingHours();
  return { ...defaults, ...parsed.data };
}

function parseCertificates(raw: unknown): CertificateInput[] {
  const parsed = certificatesSchema.safeParse(raw);
  return parsed.success ? parsed.data : [];
}

function parseAwards(raw: unknown): AwardInput[] {
  const parsed = awardsSchema.safeParse(raw);
  return parsed.success ? parsed.data : [];
}

function parseCaseStudies(raw: unknown): CaseStudyInput[] {
  const parsed = caseStudiesSchema.safeParse(raw);
  return parsed.success ? parsed.data : [];
}

function parsePortfolio(raw: unknown): PortfolioItemInput[] {
  const parsed = portfolioItemsSchema.safeParse(raw);
  return parsed.success ? parsed.data : [];
}

export default async function CompanyPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login?callbackUrl=%2Fcompany");
  }
  const userId = session.user.id;

  const membership = await prisma.membership.findFirst({
    where: { userId, status: "ACTIVE" },
    orderBy: { createdAt: "asc" },
    include: { organization: true },
  });

  if (!membership) {
    redirect("/onboarding");
  }

  const canEdit = membership.role === "OWNER" || membership.role === "ADMIN";
  const org = membership.organization;

  const approvalPolicy = await prisma.organizationApprovalPolicy.findUnique({ where: { organizationId: org.id } });

  return (
    <main className="min-h-svh bg-background py-12">
      <Container className="flex flex-col gap-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
              Company profile
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              How {org.name} appears to your team and to your AI workforce.
            </p>
          </div>
          {!canEdit && <Badge variant="outline">Read-only — ask an owner or admin to make changes</Badge>}
        </div>

        <CompanyBasicsSection
          orgId={org.id}
          canEdit={canEdit}
          initial={{
            logo: org.logo ?? "",
            banner: org.banner ?? "",
            description: org.description ?? "",
            mission: org.mission ?? "",
            vision: org.vision ?? "",
            values: org.values,
            linkedin: org.linkedin ?? "",
            facebook: org.facebook ?? "",
            twitter: org.twitter ?? "",
          }}
        />

        <CompanyServicesSection
          orgId={org.id}
          canEdit={canEdit}
          initial={{ services: org.services, clientTypes: org.clientTypes }}
        />

        <OfficeLocationsSection
          orgId={org.id}
          canEdit={canEdit}
          initial={parseOfficeLocations(org.officeLocations)}
        />

        <WorkingHoursSection orgId={org.id} canEdit={canEdit} initial={parseWorkingHours(org.workingHours)} />

        <ApprovalPolicySection
          orgId={org.id}
          canEdit={canEdit}
          initial={{
            mode: approvalPolicy?.mode ?? "ADVISORY",
            appliesToDocKinds: (approvalPolicy?.appliesToDocKinds ?? ["PROPOSAL", "QUOTATION", "CONTRACT", "INVOICE"]) as Array<
              "PROPOSAL" | "QUOTATION" | "CONTRACT" | "INVOICE"
            >,
            allowOwnerOverride: approvalPolicy?.allowOwnerOverride ?? true,
          }}
        />

        <CertificatesSection orgId={org.id} canEdit={canEdit} initial={parseCertificates(org.certificates)} />

        <AwardsSection orgId={org.id} canEdit={canEdit} initial={parseAwards(org.awards)} />

        <CaseStudiesSection orgId={org.id} canEdit={canEdit} initial={parseCaseStudies(org.caseStudies)} />

        <PortfolioSection orgId={org.id} canEdit={canEdit} initial={parsePortfolio(org.portfolio)} />
      </Container>
    </main>
  );
}
