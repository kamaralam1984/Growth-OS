"use client";

import * as React from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Check } from "lucide-react";

import { fadeInUp, staggerContainer } from "@/animations";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Container } from "@/components/ui/container";
import { SectionHeading } from "@/components/ui/section-heading";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

type BillingPeriod = "monthly" | "yearly";

interface Tier {
  name: string;
  description: string;
  monthlyPrice: number | null;
  cta: string;
  /** Omitted for tiers with no defined destination yet (e.g. Enterprise's "Talk to sales" — no contact route/email exists in this codebase yet); the button renders unwired rather than linking somewhere guessed. */
  ctaHref?: string;
  ctaVariant: "default" | "outline" | "glass";
  featured?: boolean;
  features: string[];
}

const TIERS: Tier[] = [
  {
    name: "Starter",
    description: "For small teams testing AI-assisted outreach.",
    monthlyPrice: 149,
    cta: "Start free trial",
    ctaHref: "/register",
    ctaVariant: "outline",
    features: [
      "Outreach AI agent (email + LinkedIn sequencing)",
      "Up to 500 leads / month",
      "Standard deliverability & warm-up tools",
      "One-way CRM sync",
      "Single sender identity",
      "Shared email support",
    ],
  },
  {
    name: "Growth",
    description: "The full AI workforce for teams scaling pipeline.",
    monthlyPrice: 399,
    cta: "Start free trial",
    ctaHref: "/register",
    ctaVariant: "default",
    featured: true,
    features: [
      "Full 5-agent workforce (CEO, Sales, Marketing, Proposal, Outreach)",
      "Up to 5,000 leads / month",
      "Two-way CRM sync (HubSpot, Salesforce, Pipedrive)",
      "Automated proposal & quote generation",
      "Multi-sender rotation & inbox warm-up",
      "Priority support with dedicated Slack channel",
    ],
  },
  {
    name: "Enterprise",
    description: "Custom workflows for complex sales motions.",
    monthlyPrice: null,
    cta: "Talk to sales",
    ctaVariant: "outline",
    features: [
      "Custom agent workflows built for your sales motion",
      "Unlimited lead volume",
      "SSO / SAML and custom roles",
      "Dedicated implementation & success manager",
      "Custom data retention & residency controls",
      "Uptime SLA & priority incident response",
    ],
  },
];

function formatPrice(monthlyPrice: number | null, period: BillingPeriod) {
  if (monthlyPrice === null) return "Custom";
  if (period === "monthly") return `$${monthlyPrice.toLocaleString()}`;
  const yearlyMonthlyEquivalent = Math.round((monthlyPrice * 10) / 12);
  return `$${yearlyMonthlyEquivalent.toLocaleString()}`;
}

function Pricing() {
  const [period, setPeriod] = React.useState<BillingPeriod>("monthly");

  return (
    <section className="relative py-24 sm:py-32">
      <Container className="flex flex-col items-center gap-14">
        <SectionHeading
          eyebrow="Pricing"
          title="Simple, transparent pricing"
          description="Every plan includes the core AI workforce infrastructure. Scale up as your lead volume grows."
        />

        <Tabs
          value={period}
          onValueChange={(value) => setPeriod(value as BillingPeriod)}
        >
          <TabsList>
            <TabsTrigger value="monthly" hasPanel={false}>
              Monthly
            </TabsTrigger>
            <TabsTrigger value="yearly" className="gap-2" hasPanel={false}>
              Yearly
              <Badge
                variant="accent"
                className={cn(
                  "text-[10px]",
                  period === "yearly" &&
                    "border-transparent bg-primary-foreground/20 text-primary-foreground",
                )}
              >
                2 months free
              </Badge>
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <motion.div
          variants={staggerContainer}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-80px" }}
          className="grid w-full grid-cols-1 gap-6 lg:grid-cols-3"
        >
          {TIERS.map((tier) => (
            <motion.div key={tier.name} variants={fadeInUp} className="h-full">
              <Card
                glass
                className={cn(
                  "flex h-full flex-col gap-6 p-8",
                  tier.featured &&
                    "relative border-primary/40 shadow-elevated shadow-glow-primary lg:-translate-y-3",
                )}
              >
                {tier.featured ? (
                  <Badge
                    variant="accent"
                    className="absolute -top-3 left-1/2 -translate-x-1/2"
                  >
                    Most popular
                  </Badge>
                ) : null}

                <div className="flex flex-col gap-2">
                  <h3 className="text-lg font-semibold tracking-tight text-foreground">
                    {tier.name}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    {tier.description}
                  </p>
                </div>

                <div className="flex items-end gap-1.5">
                  <span className="text-4xl font-semibold tracking-tight text-foreground">
                    {formatPrice(tier.monthlyPrice, period)}
                  </span>
                  {tier.monthlyPrice !== null ? (
                    <span className="pb-1 text-sm text-muted-foreground">
                      /mo{period === "yearly" ? ", billed yearly" : ""}
                    </span>
                  ) : null}
                </div>

                <ul className="flex flex-1 flex-col gap-3">
                  {tier.features.map((feature) => (
                    <li
                      key={feature}
                      className="flex items-start gap-2.5 text-sm text-muted-foreground"
                    >
                      <Check
                        className="mt-0.5 size-4 shrink-0 text-primary"
                        strokeWidth={2.5}
                      />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>

                {tier.ctaHref ? (
                  <Button variant={tier.ctaVariant} size="lg" className="w-full" asChild>
                    <Link href={tier.ctaHref}>{tier.cta}</Link>
                  </Button>
                ) : (
                  <Button variant={tier.ctaVariant} size="lg" className="w-full">
                    {tier.cta}
                  </Button>
                )}
              </Card>
            </motion.div>
          ))}
        </motion.div>
      </Container>
    </section>
  );
}

export default Pricing;
export { Pricing };
