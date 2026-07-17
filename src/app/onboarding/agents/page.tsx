"use client";

import * as React from "react";
import { use, useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  Crown,
  Handshake,
  Megaphone,
  FileText,
  Send,
  Database,
  BarChart3,
  DollarSign,
  Scale,
  ClipboardList,
  Bug,
  Server,
  PackageCheck,
  Loader2,
  Users,
  LifeBuoy,
  UserSearch,
  SearchCheck,
  PieChart,
  Microscope,
  HeartHandshake,
  type LucideIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Container } from "@/components/ui/container";
import { SectionHeading } from "@/components/ui/section-heading";
import { DURATIONS, EASES, staggerContainer, textReveal } from "@/animations";
import { AgentType } from "@/generated/prisma/client";
import {
  completeOnboarding,
  getUserOrganizationId,
  type AgentIntro,
} from "@/app/onboarding/agents-actions";

// FINANCE/LEGAL/PROJECT_MANAGER/QA_DIRECTOR/DEVOPS_DIRECTOR/DELIVERY_DIRECTOR
// are never provisioned by this onboarding flow (only ensureReviewBoardAgentsProvisioned
// / ensureProjectManagerAgentProvisioned / ensureDeliveryBoardAgentsProvisioned
// create them lazily), but AgentType is exhaustive here so the map must cover them.
const AGENT_ICONS: Record<AgentType, LucideIcon> = {
  CEO: Crown,
  SALES: Handshake,
  MARKETING: Megaphone,
  PROPOSAL: FileText,
  OUTREACH: Send,
  CRM: Database,
  ANALYTICS: BarChart3,
  FINANCE: DollarSign,
  LEGAL: Scale,
  PROJECT_MANAGER: ClipboardList,
  QA_DIRECTOR: Bug,
  DEVOPS_DIRECTOR: Server,
  DELIVERY_DIRECTOR: PackageCheck,
  // Marketplace-installable (Phase 19) — never provisioned by this
  // onboarding flow, but AgentType is exhaustive here so the map must cover them.
  HR: Users,
  SUPPORT: LifeBuoy,
  RECRUITMENT: UserSearch,
  SEO: SearchCheck,
  BUSINESS_ANALYST: PieChart,
  RESEARCH: Microscope,
  CUSTOMER_SUCCESS: HeartHandshake,
};

const cardVariants = {
  hidden: { opacity: 0, y: 24, scale: 0.98 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: DURATIONS.slow, ease: EASES.outExpo },
  },
};

type Status = "loading" | "ready" | "error";

export default function AgentsOnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ organizationId?: string | string[] }>;
}) {
  const params = use(searchParams);
  const paramOrgId = Array.isArray(params.organizationId)
    ? params.organizationId[0]
    : params.organizationId;

  const [status, setStatus] = useState<Status>("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [agents, setAgents] = useState<AgentIntro[]>([]);
  const [organizationId, setOrganizationId] = useState<string | null>(paramOrgId ?? null);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      try {
        const orgId = paramOrgId ?? (await getUserOrganizationId());
        if (!orgId) {
          if (!cancelled) {
            setStatus("error");
            setErrorMessage(
              "We couldn't find an organization for your account yet. Finish setting up your company profile first, then come back here.",
            );
          }
          return;
        }

        const result = await completeOnboarding(orgId);
        if (cancelled) return;
        setOrganizationId(orgId);
        setAgents(result);
        setStatus("ready");
      } catch (error) {
        if (cancelled) return;
        setStatus("error");
        setErrorMessage(error instanceof Error ? error.message : "Something went wrong setting up your workspace.");
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [paramOrgId]);

  return (
    <main className="min-h-svh bg-background py-20 sm:py-28">
      <Container className="flex flex-col items-center gap-14">
        <SectionHeading
          eyebrow="Workspace ready"
          title="Meet your AI workforce"
          description="Seven agents are now provisioned for your organization. Here's what each one does from day one."
        />

        {status === "loading" && (
          <div className="flex flex-col items-center gap-3 py-16 text-muted-foreground">
            <Loader2 className="size-6 animate-spin" />
            <p className="text-sm">Setting up your workspace...</p>
          </div>
        )}

        {status === "error" && (
          <Card glass className="w-full max-w-lg">
            <CardHeader>
              <CardTitle>We hit a snag</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">{errorMessage}</p>
            </CardContent>
          </Card>
        )}

        {status === "ready" && (
          <>
            <motion.div
              variants={staggerContainer}
              initial="hidden"
              animate="visible"
              className="grid w-full grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3"
            >
              {agents.map((agent) => {
                const Icon = AGENT_ICONS[agent.type];
                return (
                  <motion.div key={agent.type} variants={cardVariants}>
                    <Card glass className="h-full">
                      <CardHeader>
                        <div className="flex items-center gap-3">
                          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                            <Icon className="size-5" />
                          </span>
                          <CardTitle className="text-base">{agent.name}</CardTitle>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <motion.p
                          variants={staggerContainer}
                          initial="hidden"
                          animate="visible"
                          className="text-sm leading-relaxed text-muted-foreground"
                        >
                          {agent.introMessage.split(" ").map((word, i) => (
                            <motion.span key={i} variants={textReveal} className="inline-block">
                              {word}&nbsp;
                            </motion.span>
                          ))}
                        </motion.p>
                      </CardContent>
                    </Card>
                  </motion.div>
                );
              })}
            </motion.div>

            <div className="flex flex-col items-center gap-4 sm:flex-row">
              <Button asChild size="lg">
                <Link href="/dashboard">Go to dashboard</Link>
              </Button>
              <Button asChild variant="outline" size="lg">
                <Link
                  href={
                    organizationId
                      ? `/onboarding/invite?organizationId=${encodeURIComponent(organizationId)}`
                      : "/onboarding/invite"
                  }
                >
                  Invite your team
                </Link>
              </Button>
            </div>
          </>
        )}
      </Container>
    </main>
  );
}
