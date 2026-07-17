import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { Container } from "@/components/ui/container";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { prisma } from "@/lib/prisma";
import { requireActiveMembership } from "@/app/dashboard/_lib/require-membership";
import { AddCandidateForm } from "./_components/add-candidate-form";
import { CandidateCard } from "./_components/candidate-card";

interface SkillsExtracted {
  skills: Array<{ name: string; confidenceScore: number }>;
  summary: string;
}

export default async function JobOpeningDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { membership } = await requireActiveMembership(`/dashboard/hr/jobs/${id}`);

  const job = await prisma.jobOpening.findUnique({
    where: { id },
    include: { candidates: { orderBy: { createdAt: "desc" } } },
  });
  if (!job || job.organizationId !== membership.organizationId) notFound();

  return (
    <main className="py-8">
      <Container className="flex flex-col gap-6">
        <Link href="/dashboard/hr" className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground">
          <ArrowLeft className="size-4" /> Back to HR
        </Link>

        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">{job.title}</h1>
          <p className="text-sm text-muted-foreground">{job.department ?? "No department"}</p>
        </div>

        <Card glass>
          <CardHeader>
            <CardTitle className="text-base">Description</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-wrap text-sm text-foreground">{job.description}</p>
          </CardContent>
        </Card>

        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground">Candidates ({job.candidates.length})</h2>
          <AddCandidateForm jobOpeningId={job.id} />
        </div>

        {job.candidates.length === 0 ? (
          <p className="text-sm text-muted-foreground">No candidates yet.</p>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {job.candidates.map((candidate) => (
              <CandidateCard
                key={candidate.id}
                candidateId={candidate.id}
                name={candidate.name}
                email={candidate.email}
                stage={candidate.stage}
                matchScore={candidate.matchScore}
                skillsExtracted={candidate.skillsExtracted as unknown as SkillsExtracted | null}
              />
            ))}
          </div>
        )}
      </Container>
    </main>
  );
}
