import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { readKnowledgeAttachment } from "@/lib/storage/knowledge-attachments";
import { canViewArticle, isPrivilegedRole } from "@/app/dashboard/knowledge-base/_lib/access";

/**
 * Auth-gated Knowledge Base attachment download — modeled exactly on
 * src/app/api/documents/[id]/route.ts. The file lives under
 * storage/knowledge-attachments/ (never public/); this is the only way to
 * read it. Org-scoped via an ACTIVE membership in the attachment's
 * article's organization, and additionally respects the article's
 * `visibility` field: a PRIVATE article's attachments are only downloadable
 * by its author or an OWNER/ADMIN, same as the article detail page itself.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const attachment = await prisma.knowledgeAttachment.findUnique({
    where: { id },
    include: { article: { include: { knowledgeBase: { include: { workspace: true } } } } },
  });
  if (!attachment) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const organizationId = attachment.article.knowledgeBase.workspace.organizationId;

  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const membership = await prisma.membership.findUnique({
    where: { userId_organizationId: { userId, organizationId } },
  });
  if (!membership || membership.status !== "ACTIVE") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const privileged = isPrivilegedRole(membership.role);
  if (!canViewArticle(attachment.article, userId, privileged)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const buffer = await readKnowledgeAttachment(attachment.storageKey);
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": attachment.mimeType,
        "Content-Disposition": `attachment; filename="${attachment.filename.replace(/"/g, "")}"`,
        "Content-Length": String(attachment.sizeBytes),
      },
    });
  } catch (error) {
    console.error("[api/knowledge-attachments] failed to read file:", error);
    return NextResponse.json({ error: "File unavailable" }, { status: 404 });
  }
}
