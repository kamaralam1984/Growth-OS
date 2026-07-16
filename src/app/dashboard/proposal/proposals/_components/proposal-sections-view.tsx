import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ProposalSections } from "@/lib/ai/document-engine";

function Bullets({ items }: { items: string[] }) {
  return (
    <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}

/** Read-only structured display of the AI Proposal Engine's output — the same content the PDF/DOCX exports render, shown here for quick review before sending. */
export function ProposalSectionsView({ sections }: { sections: ProposalSections }) {
  return (
    <Card glass>
      <CardHeader>
        <CardTitle className="text-base">AI-Generated Proposal Sections</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <section>
          <h3 className="mb-1 text-sm font-semibold text-foreground">Executive Summary</h3>
          <p className="text-sm text-muted-foreground">{sections.executiveSummary}</p>
        </section>

        {sections.businessChallenges.length > 0 && (
          <section>
            <h3 className="mb-1 text-sm font-semibold text-foreground">Business Challenges</h3>
            <Bullets items={sections.businessChallenges} />
          </section>
        )}

        {sections.currentProblems.length > 0 && (
          <section>
            <h3 className="mb-1 text-sm font-semibold text-foreground">Current Problems</h3>
            <Bullets items={sections.currentProblems} />
          </section>
        )}

        <section>
          <h3 className="mb-1 text-sm font-semibold text-foreground">Recommended Solution</h3>
          <p className="text-sm text-muted-foreground">{sections.recommendedSolution}</p>
        </section>

        {sections.techStack.length > 0 && (
          <section>
            <h3 className="mb-1 text-sm font-semibold text-foreground">Technology Stack</h3>
            <div className="flex flex-wrap gap-1.5">
              {sections.techStack.map((t) => (
                <span key={t} className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                  {t}
                </span>
              ))}
            </div>
          </section>
        )}

        {sections.architecture && (
          <section>
            <h3 className="mb-1 text-sm font-semibold text-foreground">Architecture</h3>
            <p className="text-sm text-muted-foreground">{sections.architecture}</p>
          </section>
        )}

        {sections.features.length > 0 && (
          <section>
            <h3 className="mb-1 text-sm font-semibold text-foreground">Features</h3>
            <Bullets items={sections.features} />
          </section>
        )}

        {sections.modules.length > 0 && (
          <section>
            <h3 className="mb-1 text-sm font-semibold text-foreground">Modules</h3>
            <Bullets items={sections.modules} />
          </section>
        )}

        {sections.timeline.length > 0 && (
          <section>
            <h3 className="mb-1 text-sm font-semibold text-foreground">Timeline</h3>
            <div className="flex flex-col gap-1.5">
              {sections.timeline.map((t) => (
                <div key={t.phase} className="flex items-center justify-between rounded-lg border border-border p-2 text-sm">
                  <span className="font-medium text-foreground">{t.phase}</span>
                  <span className="text-xs text-muted-foreground">{t.duration}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {sections.deliverables.length > 0 && (
          <section>
            <h3 className="mb-1 text-sm font-semibold text-foreground">Deliverables</h3>
            <Bullets items={sections.deliverables} />
          </section>
        )}

        {(sections.estimation.resources.length > 0 || sections.estimation.milestones.length > 0) && (
          <section>
            <h3 className="mb-1 text-sm font-semibold text-foreground">Project Estimation</h3>
            {sections.estimation.totalHours != null && <p className="mb-1 text-xs text-muted-foreground">Estimated total effort: {sections.estimation.totalHours} hours</p>}
            {sections.estimation.resources.length > 0 && (
              <div className="mb-2 flex flex-wrap gap-1.5">
                {sections.estimation.resources.map((r) => (
                  <span key={r.role} className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                    {r.role} × {r.count}
                  </span>
                ))}
              </div>
            )}
            {sections.estimation.milestones.length > 0 && (
              <div className="flex flex-col gap-1.5">
                {sections.estimation.milestones.map((m) => (
                  <div key={m.name} className="flex items-center justify-between rounded-lg border border-border p-2 text-sm">
                    <span className="font-medium text-foreground">{m.name}</span>
                    <span className="text-xs text-muted-foreground">Day {m.dueOffsetDays}</span>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {(sections.support || sections.warranty || sections.terms) && (
          <section>
            <h3 className="mb-1 text-sm font-semibold text-foreground">Support, Warranty &amp; Terms</h3>
            {sections.support && <p className="text-sm text-muted-foreground">Support: {sections.support}</p>}
            {sections.warranty && <p className="text-sm text-muted-foreground">Warranty: {sections.warranty}</p>}
            {sections.terms && <p className="text-sm text-muted-foreground">Terms: {sections.terms}</p>}
          </section>
        )}

        <section>
          <h3 className="mb-1 text-sm font-semibold text-foreground">Call to Action</h3>
          <p className="text-sm text-muted-foreground">{sections.callToAction}</p>
        </section>
      </CardContent>
    </Card>
  );
}
