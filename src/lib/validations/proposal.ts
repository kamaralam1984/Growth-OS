import { z } from "zod";

export const proposalStatusSchema = z.enum(["DRAFT", "SENT", "ACCEPTED", "REJECTED"]);
export type ProposalStatusInput = z.infer<typeof proposalStatusSchema>;

export const documentIndustrySchema = z.enum([
  "SOFTWARE_DEVELOPMENT",
  "ERP",
  "CRM",
  "SAAS",
  "MOBILE_APPS",
  "AI_SOLUTIONS",
  "AUTOMATION",
  "CLOUD",
  "DEVOPS",
  "CONSULTING",
  "DIGITAL_TRANSFORMATION",
]);
export type DocumentIndustryInput = z.infer<typeof documentIndustrySchema>;

export const pricingModelSchema = z.enum(["FIXED", "HOURLY", "MONTHLY", "RETAINER", "AMC", "ENTERPRISE", "CUSTOM"]);
export type PricingModelInput = z.infer<typeof pricingModelSchema>;

export const generateProposalSchema = z.object({
  title: z.string().trim().min(1, "Give the proposal a title."),
  companyId: z.string().trim().optional().or(z.literal("")),
  leadId: z.string().trim().optional().or(z.literal("")),
  dealId: z.string().trim().optional().or(z.literal("")),
  projectId: z.string().trim().optional().or(z.literal("")),
  brief: z.string().trim().min(10, "Give the Proposal Agent a bit more to work with."),
  value: z.coerce.number().nonnegative().optional(),
  industry: documentIndustrySchema.optional(),
  pricingModel: pricingModelSchema.optional(),
});

export type GenerateProposalInput = z.infer<typeof generateProposalSchema>;

export const updateProposalContentSchema = z.object({
  title: z.string().trim().min(1, "Give the proposal a title."),
  content: z.string().trim().min(1, "The proposal can't be empty."),
  value: z.coerce.number().nonnegative().optional(),
});

export type UpdateProposalContentInput = z.infer<typeof updateProposalContentSchema>;
