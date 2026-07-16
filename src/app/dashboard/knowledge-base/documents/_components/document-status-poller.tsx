"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { IN_FLIGHT_DOCUMENT_STATUSES } from "./document-status-badge";
import type { IngestedDocumentStatus } from "@/generated/prisma/client";

const POLL_MS = 3_000;

/**
 * Mirrors src/app/dashboard/automation/workflows/[id]/_components/run-status-poller.tsx's
 * exact pattern (a plain setInterval(router.refresh, ms) client component) —
 * since ingestion runs asynchronously via BullMQ
 * (src/lib/rag/embedding-queue.ts), this refreshes the detail page's real
 * status/chunks every 3s only while status is still PENDING/PARSING/
 * CHUNKING/EMBEDDING, and stops the moment it reaches READY or FAILED.
 */
export function DocumentStatusPoller({ status }: { status: IngestedDocumentStatus }) {
  const router = useRouter();
  const inFlight = IN_FLIGHT_DOCUMENT_STATUSES.has(status);

  useEffect(() => {
    if (!inFlight) return;
    const interval = setInterval(() => router.refresh(), POLL_MS);
    return () => clearInterval(interval);
  }, [inFlight, router]);

  return null;
}
