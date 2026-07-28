import { createFileStore } from "./file-store";

/**
 * Local-disk storage for candidate resume uploads (PDF/DOCX) — scoped by
 * organizationId (matching Candidate.organizationId), same pattern as every
 * other FileStore wrapper in this app. No compression (documents aren't
 * re-encoded, same reasoning as org-assets.ts's saveOrgDocument).
 */
const store = createFileStore("resumes");

const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

const ALLOWED_EXTENSION_BY_TYPE: Record<string, string> = {
  "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
};

export const RESUME_CONTENT_TYPE_BY_EXTENSION: Record<string, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

export interface ResumeUploadResult {
  storageKey: string;
  extension: string;
}

export async function saveCandidateResume(organizationId: string, candidateId: string, file: File): Promise<ResumeUploadResult> {
  if (file.size === 0) throw new Error("Choose a resume file to upload.");
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error(`Resume must be ${Math.round(MAX_UPLOAD_BYTES / (1024 * 1024))}MB or smaller.`);
  }
  const extension = ALLOWED_EXTENSION_BY_TYPE[file.type];
  if (!extension) {
    throw new Error(`Unsupported file type "${file.type || "unknown"}". Use PDF or DOCX.`);
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const storageKey = await store.save(organizationId, candidateId, `resume.${extension}`, buffer);
  return { storageKey, extension };
}

export async function readCandidateResume(storageKey: string): Promise<Buffer> {
  return store.read(storageKey);
}

export async function removeCandidateResume(storageKey: string): Promise<void> {
  return store.remove(storageKey);
}
