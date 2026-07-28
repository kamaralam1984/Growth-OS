import { z } from "zod";

export const MARKETING_EVENT_TYPES = [
  "CTA_CLICK",
  "VIDEO_MODAL_OPEN",
  "SCROLL_DEPTH",
  "FORM_SUBMIT",
  "PAGE_VIEW",
] as const;

export const marketingEventSchema = z.object({
  eventType: z.enum(MARKETING_EVENT_TYPES),
  page: z.string().trim().min(1).max(500),
  label: z.string().trim().max(200).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  sessionId: z.string().trim().min(1).max(200),
});

export type MarketingEventInput = z.infer<typeof marketingEventSchema>;
