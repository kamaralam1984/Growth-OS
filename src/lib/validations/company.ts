import { z } from "zod";

const optionalUrl = z.string().trim().url("Enter a valid URL.").optional().or(z.literal(""));

// Logo/banner + About/Mission/Vision/Values + social links.
export const companyAboutSchema = z.object({
  logo: optionalUrl,
  banner: optionalUrl,
  description: z.string().trim().optional(),
  mission: z.string().trim().optional(),
  vision: z.string().trim().optional(),
  values: z.array(z.string().trim().min(1)).default([]),
  linkedin: optionalUrl,
  facebook: optionalUrl,
  twitter: optionalUrl,
});

export type CompanyAboutInput = z.infer<typeof companyAboutSchema>;

// Services offered + industries served (stored on the `clientTypes` field).
export const companyServicesSchema = z.object({
  services: z.array(z.string().trim().min(1)).default([]),
  clientTypes: z.array(z.string().trim().min(1)).default([]),
});

export type CompanyServicesInput = z.infer<typeof companyServicesSchema>;

// Stored in Organization.officeLocations (Json).
export const officeLocationSchema = z.object({
  id: z.string().trim().min(1),
  label: z.string().trim().min(1, "Give this location a name, e.g. Head Office."),
  address: z.string().trim().min(1, "Enter an address."),
});

export const officeLocationsSchema = z.array(officeLocationSchema).max(50);

export type OfficeLocationInput = z.infer<typeof officeLocationSchema>;

const WEEKDAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const;
export type Weekday = (typeof WEEKDAYS)[number];
export { WEEKDAYS };

// Stored in Organization.workingHours (Json) — one entry per weekday.
export const workingHoursDaySchema = z.object({
  closed: z.boolean().default(false),
  open: z.string().trim().optional(),
  close: z.string().trim().optional(),
});

export const workingHoursSchema = z.record(z.enum(WEEKDAYS), workingHoursDaySchema);

export type WorkingHoursInput = z.infer<typeof workingHoursSchema>;

// Stored in Organization.certificates (Json).
export const certificateSchema = z.object({
  id: z.string().trim().min(1),
  name: z.string().trim().min(1, "Certificate name is required."),
  issuer: z.string().trim().optional(),
  issuedAt: z.string().trim().optional(),
  expiresAt: z.string().trim().optional(),
  fileUrl: optionalUrl,
});

export const certificatesSchema = z.array(certificateSchema).max(50);

export type CertificateInput = z.infer<typeof certificateSchema>;

// Stored in Organization.awards (Json).
export const awardSchema = z.object({
  id: z.string().trim().min(1),
  title: z.string().trim().min(1, "Award title is required."),
  issuer: z.string().trim().optional(),
  year: z.coerce.number().int().min(1900).max(2100).optional(),
  description: z.string().trim().optional(),
});

export const awardsSchema = z.array(awardSchema).max(50);

export type AwardInput = z.infer<typeof awardSchema>;

// Stored in Organization.caseStudies (Json).
export const caseStudySchema = z.object({
  id: z.string().trim().min(1),
  title: z.string().trim().min(1, "Title is required."),
  clientName: z.string().trim().optional(),
  industry: z.string().trim().optional(),
  summary: z.string().trim().min(1, "Summary is required."),
  outcome: z.string().trim().optional(),
  imageUrl: optionalUrl,
});

export const caseStudiesSchema = z.array(caseStudySchema).max(50);

export type CaseStudyInput = z.infer<typeof caseStudySchema>;

// Stored in Organization.portfolio (Json).
export const portfolioItemSchema = z.object({
  id: z.string().trim().min(1),
  title: z.string().trim().min(1, "Title is required."),
  category: z.string().trim().optional(),
  description: z.string().trim().optional(),
  imageUrl: optionalUrl,
  projectUrl: optionalUrl,
});

export const portfolioItemsSchema = z.array(portfolioItemSchema).max(50);

export type PortfolioItemInput = z.infer<typeof portfolioItemSchema>;
