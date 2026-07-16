import { z } from "zod";

import { API_KEY_SCOPES } from "@/lib/auth/api-key-scopes";

export const createApiKeySchema = z.object({
  name: z.string().trim().min(1, "Name is required.").max(100, "Name must be 100 characters or fewer."),
  scopes: z.array(z.enum(API_KEY_SCOPES)).default([]),
  rateLimitPerHour: z.coerce.number().int().min(1, "Must be at least 1.").max(100_000, "Must be 100,000 or fewer.").default(1000),
});

export type CreateApiKeyInput = z.infer<typeof createApiKeySchema>;
