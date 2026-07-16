/**
 * Shared option lists for the registration form and the onboarding wizard.
 * Deliberately curated (not an exhaustive ISO list) — keeps the pickers fast
 * to scan; every list includes free-text fallbacks elsewhere in the form for
 * anything not covered here.
 */

export const COMMON_COUNTRIES = [
  "United States",
  "United Kingdom",
  "Canada",
  "Australia",
  "India",
  "Pakistan",
  "United Arab Emirates",
  "Saudi Arabia",
  "Germany",
  "France",
  "Netherlands",
  "Sweden",
  "Ireland",
  "Spain",
  "Italy",
  "Switzerland",
  "Singapore",
  "Japan",
  "China",
  "South Korea",
  "Indonesia",
  "Philippines",
  "Bangladesh",
  "Nigeria",
  "South Africa",
  "Brazil",
  "Mexico",
  "New Zealand",
  "Israel",
] as const;

export const COMMON_LANGUAGES = [
  "English",
  "Spanish",
  "French",
  "German",
  "Portuguese",
  "Arabic",
  "Hindi",
  "Urdu",
  "Mandarin Chinese",
  "Japanese",
  "Russian",
  "Italian",
  "Dutch",
] as const;

export const COMMON_CURRENCIES = [
  "USD",
  "EUR",
  "GBP",
  "INR",
  "PKR",
  "AED",
  "SAR",
  "AUD",
  "CAD",
  "SGD",
  "JPY",
  "CNY",
] as const;

export const COMPANY_SIZE_OPTIONS = [
  { value: "SIZE_1_10", label: "1–10 employees" },
  { value: "SIZE_11_50", label: "11–50 employees" },
  { value: "SIZE_51_200", label: "51–200 employees" },
  { value: "SIZE_201_1000", label: "201–1,000 employees" },
  { value: "SIZE_1000_PLUS", label: "1,000+ employees" },
] as const;

export const SERVICES_OFFERED = [
  "Software Development",
  "ERP",
  "CRM",
  "SaaS",
  "Mobile Apps",
  "Cloud",
  "AI",
  "Automation",
  "DevOps",
  "UI/UX",
  "Cyber Security",
  "Digital Transformation",
  "Custom Software",
  "API Development",
  "Consulting",
] as const;

export const CLIENT_TYPES = [
  "Startup",
  "SME",
  "Enterprise",
  "Government",
  "Hospital",
  "School",
  "University",
  "Real Estate",
  "Manufacturing",
  "Retail",
  "Logistics",
  "Finance",
  "Healthcare",
] as const;

export const AI_GOALS = [
  "Find Clients",
  "Generate Leads",
  "Cold Email",
  "LinkedIn Outreach",
  "Sales",
  "Proposal",
  "Marketing",
  "CRM",
  "Customer Support",
  "Operations",
  "Project Management",
] as const;
