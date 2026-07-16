import { z } from "zod";

export const startScanSchema = z.object({
  url: z.string().trim().min(1, "Enter a website URL.").url("Enter a valid URL, e.g. https://example.com"),
  websiteName: z.string().trim().max(200).optional().or(z.literal("")),
  companyNameInput: z.string().trim().max(200).optional().or(z.literal("")),
  industryInput: z.string().trim().max(120).optional().or(z.literal("")),
  websiteType: z.string().trim().max(60).optional().or(z.literal("")),
});

export type StartScanInput = z.infer<typeof startScanSchema>;
