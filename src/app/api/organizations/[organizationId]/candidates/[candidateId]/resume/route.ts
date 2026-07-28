import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { readCandidateResume, RESUME_CONTENT_TYPE_BY_EXTENSION } from "@/lib/storage/resumes";

/** Real resume download — gated on ACTIVE membership in the candidate's own organization. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ organizationId: string; candidateId: string }> },
) {
  const { organizationId, candidateId } = await params;

  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const membership = await prisma.membership.findUnique({
    where: { userId_organizationId: { userId, organizationId } },
  });
  if (!membership || membership.status !== "ACTIVE") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const candidate = await prisma.candidate.findUnique({ where: { id: candidateId }, select: { organizationId: true, resumeStorageKey: true, name: true } });
  if (!candidate || candidate.organizationId !== organizationId || !candidate.resumeStorageKey) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const extension = candidate.resumeStorageKey.split(".").pop()?.toLowerCase() ?? "";
  const contentType = RESUME_CONTENT_TYPE_BY_EXTENSION[extension] ?? "application/octet-stream";

  try {
    const buffer = await readCandidateResume(candidate.resumeStorageKey);
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `inline; filename="${candidate.name.replace(/[^a-z0-9 _-]/gi, "")}-resume.${extension}"`,
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch (error) {
    console.error("[api/organizations/candidates/resume] failed to read file:", error);
    return NextResponse.json({ error: "File unavailable" }, { status: 404 });
  }
}
