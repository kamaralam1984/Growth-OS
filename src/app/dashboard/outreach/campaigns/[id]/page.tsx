import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Megaphone, Users, Mail, MousePointerClick, MessageSquare, TrendingDown, Download } from "lucide-react";

import { Container } from "@/components/ui/container";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { prisma } from "@/lib/prisma";
import { requireActiveMembership } from "@/app/dashboard/_lib/require-membership";
import { ensureTodayCampaignSnapshot, getCampaignAnalytics } from "@/lib/outreach/campaign-analytics";
import { DraftCard } from "../../_components/draft-card";
import { SequenceBuilder } from "../../_components/sequence-builder";
import { AbTestPanel } from "../../_components/ab-test-panel";
import { getAbTestResults } from "../../_lib/ab-test-actions";
import { CampaignPlanPanel } from "./_components/campaign-plan-panel";
import { AddContactsForm } from "./_components/add-contacts-form";
import { CampaignStatusSelect } from "./_components/campaign-status-select";

export default async function CampaignDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { membership } = await requireActiveMembership(`/dashboard/outreach/campaigns/${id}`);

  const campaign = await prisma.campaign.findUnique({
    where: { id },
    include: {
      sequences: true,
      contacts: { include: { contact: true } },
      emailDrafts: { orderBy: { createdAt: "desc" }, include: { approvals: { orderBy: { createdAt: "desc" } } } },
    },
  });

  if (!campaign || campaign.organizationId !== membership.organizationId) {
    notFound();
  }

  await ensureTodayCampaignSnapshot(campaign.id);
  const analytics = await getCampaignAnalytics(campaign.id);

  const abGroupIds = Array.from(new Set(campaign.emailDrafts.map((d) => d.abTestGroupId).filter((v): v is string => v !== null)));
  const abResults = abGroupIds.length > 0 ? await getAbTestResults(abGroupIds[0]) : [];

  const allContacts = await prisma.contact.findMany({ where: { organizationId: membership.organizationId }, select: { id: true, firstName: true, lastName: true, email: true } });
  const canApprove = membership.role === "OWNER" || membership.role === "ADMIN";

  return (
    <main className="py-8">
      <Container className="flex flex-col gap-6">
        <Link href="/dashboard/outreach" className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground">
          <ArrowLeft className="size-4" /> Back to Outreach
        </Link>

        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight text-foreground">
              <Megaphone className="size-6 text-primary" /> {campaign.name}
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <CampaignStatusSelect campaignId={campaign.id} status={campaign.status} />
              <Badge variant="outline">{campaign.type.replace(/_/g, " ")}</Badge>
              <Badge variant="outline">{campaign.approvalMode.replace(/_/g, " ")}</Badge>
            </div>
          </div>
          <a href={`/api/export/campaigns/${campaign.id}`} className="flex items-center gap-1.5 text-sm text-primary hover:underline">
            <Download className="size-4" /> Download report (PDF)
          </a>
        </div>

        <Tabs defaultValue="overview">
          <TabsList className="flex-wrap">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="sequence">Sequence</TabsTrigger>
            <TabsTrigger value="contacts">Contacts ({campaign.contacts.length})</TabsTrigger>
            <TabsTrigger value="drafts">Drafts ({campaign.emailDrafts.length})</TabsTrigger>
            <TabsTrigger value="analytics">Analytics</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="flex flex-col gap-4">
            <CampaignPlanPanel campaignId={campaign.id} aiPlanNotes={campaign.aiPlanNotes} estimatedSuccessPotential={campaign.estimatedSuccessPotential} />
            <AbTestPanel campaignId={campaign.id} results={abResults} />
          </TabsContent>

          <TabsContent value="sequence">
            <SequenceBuilder campaignId={campaign.id} />
          </TabsContent>

          <TabsContent value="contacts" className="flex flex-col gap-4">
            <AddContactsForm
              campaignId={campaign.id}
              contactOptions={allContacts.map((c) => ({ id: c.id, label: `${c.firstName} ${c.lastName ?? ""} (${c.email})` }))}
            />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {campaign.contacts.map(({ contact }) => (
                <Link key={contact.id} href={`/dashboard/outreach/contacts/${contact.id}`}>
                  <Card glass className="transition-transform duration-150 hover:-translate-y-0.5">
                    <CardContent className="flex items-center gap-2 p-3">
                      <Users className="size-4 text-muted-foreground" />
                      <div>
                        <p className="text-sm font-medium text-foreground">
                          {contact.firstName} {contact.lastName ?? ""}
                        </p>
                        <p className="text-xs text-muted-foreground">{contact.email}</p>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="drafts" className="flex flex-col gap-3">
            {campaign.emailDrafts.length === 0 ? (
              <p className="text-sm text-muted-foreground">No drafts yet — enroll contacts in a sequence or generate drafts from a contact profile.</p>
            ) : (
              campaign.emailDrafts.map((draft) => <DraftCard key={draft.id} draft={draft} canApprove={canApprove} />)
            )}
          </TabsContent>

          <TabsContent value="analytics">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              <StatTile icon={Mail} label="Emails sent" value={analytics.emailsSent} />
              <StatTile icon={Mail} label="Open rate" value={`${analytics.openRate}%`} />
              <StatTile icon={MousePointerClick} label="Click rate" value={`${analytics.clickRate}%`} />
              <StatTile icon={MessageSquare} label="Reply rate" value={`${analytics.replyRate}%`} />
              <StatTile icon={Users} label="Meetings booked" value={analytics.meetingsBooked} />
              <StatTile icon={TrendingDown} label="Bounce rate" value={`${analytics.bounceRate}%`} />
            </div>
          </TabsContent>
        </Tabs>
      </Container>
    </main>
  );
}

function StatTile({ icon: Icon, label, value }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string | number }) {
  return (
    <Card glass>
      <CardContent className="flex flex-col gap-1.5 p-3.5">
        <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <Icon className="size-3.5" /> {label}
        </span>
        <span className="text-xl font-semibold tracking-tight text-foreground">{value}</span>
      </CardContent>
    </Card>
  );
}
