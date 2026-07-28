import { z } from "zod";

export const SALES_INQUIRY_DEPARTMENTS = [
  "SALES",
  "ENTERPRISE",
  "GOVERNMENT",
  "SUPPORT",
  "PARTNERSHIP",
  "INVESTOR",
  "CAREER",
] as const;

export const salesInquirySchema = z.object({
  name: z.string().trim().min(1, "Name is required."),
  company: z.string().trim().min(1, "Company is required."),
  businessEmail: z.string().trim().toLowerCase().email("Enter a valid email address."),
  phone: z.string().trim().optional(),
  country: z.string().trim().optional(),
  department: z.enum(SALES_INQUIRY_DEPARTMENTS),
  industry: z.string().trim().optional(),
  employeeCount: z.string().trim().optional(),
  budget: z.string().trim().optional(),
  timeline: z.string().trim().optional(),
  projectType: z.string().trim().optional(),
  message: z.string().trim().min(10, "Please add a few more details (at least 10 characters)."),
  consentGiven: z.literal(true, { message: "Please confirm you agree to be contacted." }),
  // Honeypot: real visitors never fill this hidden field; if it's non-empty,
  // the API route quietly reports success without writing a row.
  website: z.string().max(0).optional(),
});

export type SalesInquiryInput = z.infer<typeof salesInquirySchema>;
