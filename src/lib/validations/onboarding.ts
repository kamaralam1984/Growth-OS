import { z } from "zod";

// Mirrors prisma.CompanySize exactly — keep in sync with prisma/schema.prisma.
export const companySizeSchema = z.enum([
  "SIZE_1_10",
  "SIZE_11_50",
  "SIZE_51_200",
  "SIZE_201_1000",
  "SIZE_1000_PLUS",
]);

export const companyProfileSchema = z.object({
  name: z.string().trim().min(1, "Company name is required."),
  logo: z.string().trim().url("Enter a valid URL.").optional().or(z.literal("")),
  industry: z.string().trim().optional(),
  website: z.string().trim().url("Enter a valid URL.").optional().or(z.literal("")),
  email: z.string().trim().toLowerCase().email("Enter a valid email address.").optional().or(z.literal("")),
  phone: z.string().trim().optional(),
  gstNumber: z.string().trim().optional(),
  registrationNumber: z.string().trim().optional(),
  linkedin: z.string().trim().url("Enter a valid URL.").optional().or(z.literal("")),
  facebook: z.string().trim().url("Enter a valid URL.").optional().or(z.literal("")),
  twitter: z.string().trim().url("Enter a valid URL.").optional().or(z.literal("")),
  description: z.string().trim().optional(),
});

export type CompanyProfileInput = z.infer<typeof companyProfileSchema>;

export const businessDetailsSchema = z.object({
  companySize: companySizeSchema.optional(),
  annualRevenue: z.string().trim().optional(),
  primaryMarket: z.string().trim().optional(),
  countriesServed: z.array(z.string().trim().min(1)).default([]),
  primaryLanguage: z.string().trim().optional(),
  currency: z.string().trim().optional(),
  timezone: z.string().trim().optional(),
});

export type BusinessDetailsInput = z.infer<typeof businessDetailsSchema>;

export const servicesGoalsSchema = z.object({
  services: z.array(z.string().trim().min(1)).default([]),
  clientTypes: z.array(z.string().trim().min(1)).default([]),
  aiGoals: z.array(z.string().trim().min(1)).default([]),
});

export type ServicesGoalsInput = z.infer<typeof servicesGoalsSchema>;
