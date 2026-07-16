import { z } from "zod";

import { pricingModelSchema, documentIndustrySchema } from "./proposal";

export { pricingModelSchema, documentIndustrySchema };

// ===== Quotation =====

export const quotationStatusSchema = z.enum(["DRAFT", "SENT", "ACCEPTED", "REJECTED", "EXPIRED"]);
export type QuotationStatusInput = z.infer<typeof quotationStatusSchema>;

export const quotationLineItemSchema = z.object({
  description: z.string().trim().min(1, "Give the line item a description."),
  quantity: z.coerce.number().positive("Quantity must be greater than 0."),
  rate: z.coerce.number().nonnegative("Rate can't be negative."),
  discountPercent: z.coerce.number().min(0).max(100).optional(),
});
export type QuotationLineItemInput = z.infer<typeof quotationLineItemSchema>;

export const generateQuotationSchema = z.object({
  title: z.string().trim().min(1, "Give the quotation a title."),
  companyId: z.string().trim().optional().or(z.literal("")),
  contactId: z.string().trim().optional().or(z.literal("")),
  dealId: z.string().trim().optional().or(z.literal("")),
  pricingModel: pricingModelSchema.optional(),
  currency: z.string().trim().max(10).optional().or(z.literal("")),
  discountPercent: z.coerce.number().min(0).max(100).optional(),
  taxPercent: z.coerce.number().min(0).max(100).optional(),
  validUntil: z.coerce.date().optional(),
  notes: z.string().trim().max(4000).optional().or(z.literal("")),
  terms: z.string().trim().max(4000).optional().or(z.literal("")),
  lineItems: z.array(quotationLineItemSchema).min(1, "Add at least one line item."),
});
export type GenerateQuotationInput = z.infer<typeof generateQuotationSchema>;

// ===== Contract =====

export const contractTypeSchema = z.enum([
  "SOFTWARE_DEVELOPMENT_AGREEMENT",
  "AMC_AGREEMENT",
  "MAINTENANCE_AGREEMENT",
  "SUPPORT_AGREEMENT",
  "IMPLEMENTATION_AGREEMENT",
  "CONSULTING_AGREEMENT",
]);
export type ContractTypeInput = z.infer<typeof contractTypeSchema>;

export const contractStatusSchema = z.enum(["DRAFT", "SENT", "SIGNED", "REJECTED", "EXPIRED", "ARCHIVED"]);
export type ContractStatusInput = z.infer<typeof contractStatusSchema>;

export const generateContractSchema = z.object({
  title: z.string().trim().min(1, "Give the contract a title."),
  type: contractTypeSchema,
  companyId: z.string().trim().optional().or(z.literal("")),
  dealId: z.string().trim().optional().or(z.literal("")),
  clientId: z.string().trim().optional().or(z.literal("")),
  clientName: z.string().trim().min(1, "Name the other party."),
  value: z.coerce.number().nonnegative().optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
  brief: z.string().trim().min(10, "Give the agent a bit more context to draft from."),
});
export type GenerateContractInput = z.infer<typeof generateContractSchema>;

// ===== Invoice =====

export const invoiceTypeSchema = z.enum(["STANDARD", "GST", "RECURRING", "PROFORMA", "CREDIT_NOTE", "DEBIT_NOTE"]);
export type InvoiceTypeInput = z.infer<typeof invoiceTypeSchema>;

export const invoiceStatusSchema = z.enum(["DRAFT", "SENT", "PAID", "OVERDUE", "CANCELLED", "VOID"]);
export type InvoiceStatusInput = z.infer<typeof invoiceStatusSchema>;

export const invoiceLineItemSchema = z.object({
  description: z.string().trim().min(1, "Give the line item a description."),
  quantity: z.coerce.number().positive("Quantity must be greater than 0."),
  rate: z.coerce.number().nonnegative("Rate can't be negative."),
});
export type InvoiceLineItemInput = z.infer<typeof invoiceLineItemSchema>;

export const createInvoiceSchema = z.object({
  type: invoiceTypeSchema.default("STANDARD"),
  companyId: z.string().trim().optional().or(z.literal("")),
  dealId: z.string().trim().optional().or(z.literal("")),
  clientId: z.string().trim().optional().or(z.literal("")),
  dueDate: z.coerce.date().optional(),
  currency: z.string().trim().max(10).optional().or(z.literal("")),
  discountPercent: z.coerce.number().min(0).max(100).optional(),
  taxPercent: z.coerce.number().min(0).max(100).optional(),
  isRecurring: z.coerce.boolean().default(false),
  recurrenceRule: z.enum(["DAILY", "WEEKLY", "MONTHLY", "YEARLY"]).optional(),
  notes: z.string().trim().max(4000).optional().or(z.literal("")),
  terms: z.string().trim().max(4000).optional().or(z.literal("")),
  lineItems: z.array(invoiceLineItemSchema).min(1, "Add at least one line item."),
});
export type CreateInvoiceInput = z.infer<typeof createInvoiceSchema>;

// ===== Business Document (NDA/MSA/SLA/SOW/etc.) =====

export const businessDocumentKindSchema = z.enum([
  "NDA",
  "MSA",
  "SLA",
  "TERMS",
  "PRIVACY_AGREEMENT",
  "ACCEPTANCE_LETTER",
  "DELIVERY_CERTIFICATE",
  "SCOPE_OF_WORK",
  "REQUIREMENT_SPECIFICATION",
  "TECHNICAL_ARCHITECTURE",
  "PROJECT_ROADMAP",
  "RISK_REGISTER",
  "ACCEPTANCE_CRITERIA",
  "PROJECT_PLAN",
  "BUSINESS_REPORT",
]);
export type BusinessDocumentKindInput = z.infer<typeof businessDocumentKindSchema>;

export const businessDocumentStatusSchema = z.enum(["DRAFT", "SENT", "ACCEPTED", "REJECTED", "ARCHIVED"]);
export type BusinessDocumentStatusInput = z.infer<typeof businessDocumentStatusSchema>;

export const generateBusinessDocumentSchema = z.object({
  kind: businessDocumentKindSchema,
  companyId: z.string().trim().optional().or(z.literal("")),
  dealId: z.string().trim().optional().or(z.literal("")),
  projectId: z.string().trim().optional().or(z.literal("")),
  counterpartyName: z.string().trim().max(200).optional().or(z.literal("")),
  brief: z.string().trim().min(10, "Give the agent a bit more context to draft from."),
});
export type GenerateBusinessDocumentInput = z.infer<typeof generateBusinessDocumentSchema>;

// ===== Document Template =====

export const documentKindSchema = z.enum(["PROPOSAL", "QUOTATION", "CONTRACT", "INVOICE", "BUSINESS_DOCUMENT"]);
export type DocumentKindInput = z.infer<typeof documentKindSchema>;

export const documentTemplateSchema = z.object({
  name: z.string().trim().min(1, "Give the template a name."),
  docKind: documentKindSchema,
  category: documentIndustrySchema.optional(),
  businessDocKind: businessDocumentKindSchema.optional(),
  contractType: contractTypeSchema.optional(),
  content: z.string().trim().min(1, "The template needs content."),
  isDefault: z.coerce.boolean().default(false),
});
export type DocumentTemplateInput = z.infer<typeof documentTemplateSchema>;

// ===== Signature =====

export const manualSignatureSubmitSchema = z.object({
  signerName: z.string().trim().min(1, "Enter your full name."),
  typedSignature: z.string().trim().min(1, "Type your signature."),
});
export type ManualSignatureSubmitInput = z.infer<typeof manualSignatureSubmitSchema>;
