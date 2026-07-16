import Link from "next/link";
import { Users, Mail, Globe } from "lucide-react";

import { Container } from "@/components/ui/container";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { prisma } from "@/lib/prisma";
import { requireActiveMembership } from "../../_lib/require-membership";
import { LeadScoreBadge } from "@/app/dashboard/_components/lead-score-badge";
import { OpportunityBandBadge } from "@/app/dashboard/website-scanner/_components/opportunity-band-badge";
import { ContactForm } from "./_components/contact-form";

const STATUS_LABEL: Record<string, string> = {
  NEW: "New",
  CONTACTED: "Contacted",
  REPLIED: "Replied",
  INTERESTED: "Interested",
  NOT_INTERESTED: "Not interested",
  MEETING_BOOKED: "Meeting booked",
  UNSUBSCRIBED: "Unsubscribed",
};

const STATUS_VARIANT: Record<string, "outline" | "accent" | "default" | "secondary"> = {
  NEW: "outline",
  CONTACTED: "secondary",
  REPLIED: "accent",
  INTERESTED: "default",
  NOT_INTERESTED: "outline",
  MEETING_BOOKED: "default",
  UNSUBSCRIBED: "outline",
};

export default async function OutreachContactsPage() {
  const { membership } = await requireActiveMembership("/dashboard/outreach/contacts");

  const contacts = await prisma.contact.findMany({
    where: { organizationId: membership.organizationId },
    orderBy: { createdAt: "desc" },
    include: {
      company: {
        include: {
          leadScore: true,
          websiteScans: { orderBy: { createdAt: "desc" }, take: 1, include: { opportunity: true } },
        },
      },
    },
  });

  return (
    <main className="py-8">
      <Container className="flex flex-col gap-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight text-foreground">
              <Users className="size-6 text-primary" /> Contacts
            </h1>
            <p className="text-sm text-muted-foreground">
              Real people at real companies — Lead Score and Opportunity Score are read live from Company
              Intelligence and Website Scanner, never duplicated.
            </p>
          </div>
          <Link href="/dashboard/outreach" className="text-sm text-primary hover:underline">
            Back to Outreach
          </Link>
        </div>

        <ContactForm />

        {contacts.length === 0 ? (
          <Card glass>
            <CardContent className="flex flex-col items-center gap-3 p-12 text-center">
              <Users className="size-8 text-muted-foreground" strokeWidth={1.5} />
              <p className="text-sm text-muted-foreground">No contacts yet. Add one above, or create one from a Company Profile.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {contacts.map((contact) => {
              const opportunity = contact.company?.websiteScans[0]?.opportunity;
              return (
                <Link key={contact.id} href={`/dashboard/outreach/contacts/${contact.id}`}>
                  <Card glass className="h-full transition-transform duration-150 hover:-translate-y-0.5">
                    <CardContent className="flex flex-col gap-3 p-5">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate font-medium text-foreground">
                            {contact.firstName} {contact.lastName ?? ""}
                          </p>
                          <p className="truncate text-xs text-muted-foreground">{contact.jobTitle || contact.company?.name || "—"}</p>
                        </div>
                        <Badge variant={STATUS_VARIANT[contact.status]}>{STATUS_LABEL[contact.status]}</Badge>
                      </div>

                      <div className="flex flex-col gap-1 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1.5 truncate">
                          <Mail className="size-3.5 shrink-0" /> {contact.email}
                        </span>
                        {contact.company?.website && (
                          <span className="flex items-center gap-1.5 truncate">
                            <Globe className="size-3.5 shrink-0" /> {contact.company.website}
                          </span>
                        )}
                        {(contact.company?.industry || contact.company?.headquartersCountry || contact.country) && (
                          <span>
                            {[contact.company?.industry, contact.company?.headquartersCountry ?? contact.country].filter(Boolean).join(" · ")}
                          </span>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5">
                        {contact.company?.leadScore && <LeadScoreBadge band={contact.company.leadScore.band} score={contact.company.leadScore.overallScore} />}
                        {opportunity && <OpportunityBandBadge band={opportunity.band} score={opportunity.overallOpportunityScore} />}
                      </div>

                      {contact.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {contact.tags.slice(0, 4).map((tag) => (
                            <Badge key={tag} variant="outline" className="text-[10px]">
                              {tag}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>
        )}
      </Container>
    </main>
  );
}
