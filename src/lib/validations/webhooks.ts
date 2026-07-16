import { z } from "zod";

// Mirrors enum WebhookDirection in prisma/schema.prisma.
export const webhookDirectionSchema = z.enum(["INCOMING", "OUTGOING"]);
export type WebhookDirectionInput = z.infer<typeof webhookDirectionSchema>;

/**
 * OUTGOING webhooks require a real targetUrl to POST to; INCOMING webhooks
 * never take one (the receivable URL is server-generated from the row's
 * slug instead) — the refine below enforces that split at the validation
 * layer so a malformed request never reaches src/lib/workflows/webhooks.ts.
 */
export const createWebhookSchema = z
  .object({
    direction: webhookDirectionSchema,
    workflowId: z.string().trim().min(1).optional(),
    targetUrl: z.string().trim().url("Enter a valid https:// URL.").max(2000).optional(),
  })
  .refine((data) => data.direction !== "OUTGOING" || Boolean(data.targetUrl), {
    message: "A target URL is required for outgoing webhooks.",
    path: ["targetUrl"],
  });
export type CreateWebhookInput = z.infer<typeof createWebhookSchema>;
