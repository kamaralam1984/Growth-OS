"use client";

import { useMemo, useState } from "react";
import { Quote, Sparkles } from "lucide-react";
import { motion } from "framer-motion";

import { Container } from "@/components/ui/container";
import { SectionHeading } from "@/components/ui/section-heading";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { fadeInUp, staggerContainer } from "@/animations";
import { CASE_STUDIES } from "@/lib/trust-content";

const ALL_INDUSTRIES = "__all__";

/**
 * Case-study cards with industry filtering. CASE_STUDIES is deliberately
 * empty until a real engagement has actually completed — see
 * src/lib/trust-content.ts's header comment. Renders an honest "coming
 * soon" card instead of silently disappearing, so this section's presence
 * in the architecture is visible during manual QA / integration tests.
 * Populate CASE_STUDIES (and only that array) once real case studies
 * exist; this component needs no changes to start rendering the filterable
 * grid below.
 *
 * The industry filter tabs are derived from the actual CASE_STUDIES data
 * (never a hardcoded industry list) — a fixed list would falsely imply
 * case studies exist for industries that have none yet.
 */
function CaseStudies() {
  // Hooks must run unconditionally (rules-of-hooks) even though the
  // populated branch below is unreachable until CASE_STUDIES has entries.
  const industries = useMemo(
    () => Array.from(new Set(CASE_STUDIES.map((study) => study.industry))),
    [],
  );
  const [activeIndustry, setActiveIndustry] = useState<string>(ALL_INDUSTRIES);

  if (CASE_STUDIES.length === 0) {
    return (
      <section className="relative py-24 sm:py-32">
        <Container className="flex flex-col items-center gap-14">
          <SectionHeading
            eyebrow="Case studies"
            title="Real engagements, real outcomes"
            description="In-depth case studies will appear here as real client engagements are completed."
          />

          <Card glass className="w-full max-w-xl">
            <CardHeader>
              <div className="flex items-center gap-2">
                <CardTitle>Case study library</CardTitle>
                <Badge variant="accent">Coming soon</Badge>
              </div>
              <CardDescription>No case studies have been published yet.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border py-12 text-center">
                <Sparkles className="size-6 text-muted-foreground" />
                <p className="max-w-sm text-sm text-muted-foreground">
                  This isn&apos;t built yet — check back as real engagements complete and case studies
                  are written up.
                </p>
              </div>
            </CardContent>
          </Card>
        </Container>
      </section>
    );
  }

  const filteredStudies =
    activeIndustry === ALL_INDUSTRIES
      ? CASE_STUDIES
      : CASE_STUDIES.filter((study) => study.industry === activeIndustry);

  return (
    <section className="relative py-24 sm:py-32">
      <Container className="flex flex-col items-center gap-14">
        <SectionHeading
          eyebrow="Case studies"
          title="Real engagements, real outcomes"
          description="Filter by industry to see how GrowthOS has been used to solve real business problems."
        />

        {/* Only worth showing a filter once there's more than one distinct
            industry to filter between. */}
        {industries.length > 1 && (
          <Tabs value={activeIndustry} onValueChange={setActiveIndustry}>
            <TabsList>
              {/* hasPanel={false}: these tabs filter the always-visible grid
                  below rather than swapping in a distinct <TabsContent>
                  panel per tab — same pattern as the pricing page's
                  monthly/yearly switch (see TabsTrigger's doc comment). */}
              <TabsTrigger value={ALL_INDUSTRIES} hasPanel={false}>
                All
              </TabsTrigger>
              {industries.map((industry) => (
                <TabsTrigger key={industry} value={industry} hasPanel={false}>
                  {industry}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        )}

        <motion.div
          key={activeIndustry}
          variants={staggerContainer}
          initial="hidden"
          animate="visible"
          className="grid w-full grid-cols-1 gap-6 lg:grid-cols-2"
        >
          {filteredStudies.map((study) => (
            <motion.div key={study.projectName} variants={fadeInUp}>
              <Card glass className="flex h-full flex-col gap-4 p-6">
                <div className="flex flex-wrap items-center gap-2">
                  <CardTitle className="text-base">{study.projectName}</CardTitle>
                  <Badge variant="outline">{study.industry}</Badge>
                </div>

                <div className="flex flex-col gap-3 text-sm">
                  <div>
                    <p className="font-semibold text-foreground">Business problem</p>
                    <p className="text-muted-foreground">{study.businessProblem}</p>
                  </div>
                  <div>
                    <p className="font-semibold text-foreground">Solution</p>
                    <p className="text-muted-foreground">{study.solution}</p>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {study.techStack.map((tech) => (
                      <Badge key={tech} variant="secondary">
                        {tech}
                      </Badge>
                    ))}
                  </div>
                  <div>
                    <p className="font-semibold text-foreground">Timeline</p>
                    <p className="text-muted-foreground">{study.timeline}</p>
                  </div>
                  <div>
                    <p className="font-semibold text-foreground">Business results</p>
                    <p className="text-muted-foreground">{study.businessResults}</p>
                  </div>
                </div>

                <blockquote className="flex gap-2 rounded-xl border border-border bg-muted/40 p-4 text-sm italic text-foreground">
                  <Quote className="size-4 shrink-0 text-primary" strokeWidth={2.5} />
                  <span>{study.clientQuote}</span>
                </blockquote>

                {/* TODO: link to a real /case-studies/[slug] route once real
                    case studies exist and that route is built — out of scope
                    for this architecture-only pass. */}
                {/* eslint-disable-next-line jsx-a11y/anchor-is-valid -- placeholder href pending the real /case-studies/[slug] route (see TODO above); no real destination exists yet */}
                <a href="#" className="text-sm font-medium text-primary hover:underline">
                  View Full Case Study →
                </a>
              </Card>
            </motion.div>
          ))}
        </motion.div>
      </Container>
    </section>
  );
}

export default CaseStudies;
export { CaseStudies };
