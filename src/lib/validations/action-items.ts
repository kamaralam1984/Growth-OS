import { z } from "zod";

export const actionItemStatusSchema = z.enum(["OPEN", "IN_PROGRESS", "DONE", "CANCELLED"]);

export const actionItemPrioritySchema = z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]);

export const createActionItemSchema = z.object({
  title: z.string().trim().min(1, "Give the action item a title.").max(300, "Keep the title under 300 characters."),
  description: z.string().trim().max(5000, "Keep the description under 5000 characters.").optional(),
  meetingId: z.string().trim().min(1).optional(),
  decisionId: z.string().trim().min(1).optional(),
  projectId: z.string().trim().min(1).optional(),
  assignedToUserId: z.string().trim().min(1).optional(),
  assignedToAgentId: z.string().trim().min(1).optional(),
  dueDate: z.coerce.date().optional(),
  priority: actionItemPrioritySchema.default("NORMAL"),
  kpi: z.string().trim().max(300, "Keep the KPI under 300 characters.").optional(),
  expectedImpact: z.string().trim().max(500, "Keep expected impact under 500 characters.").optional(),
});

export type CreateActionItemInput = z.infer<typeof createActionItemSchema>;

export const trackNarrativeActionItemSchema = z.object({
  narrativeText: z.string().trim().min(1, "Nothing to track.").max(10_000, "That action item is too long to track."),
  assignedToUserId: z.string().trim().min(1).optional(),
});

/**
 * generateMeetingSummary's actionItems[] are free-text sentences with no
 * length cap. Trackable ActionItem.title stays short and scannable for list
 * views; anything trimmed off is preserved verbatim in description rather
 * than lost. Exported so both convertMeetingActionItemToTracked and the War
 * Room's "already tracked" detection derive the exact same title.
 */
export const ACTION_ITEM_TITLE_MAX_LENGTH = 200;

export function deriveTrackedActionItemFields(narrativeText: string): { title: string; description: string | null } {
  const trimmed = narrativeText.trim();
  if (trimmed.length <= ACTION_ITEM_TITLE_MAX_LENGTH) {
    return { title: trimmed, description: null };
  }
  return {
    title: `${trimmed.slice(0, ACTION_ITEM_TITLE_MAX_LENGTH - 1).trimEnd()}…`,
    description: trimmed,
  };
}
