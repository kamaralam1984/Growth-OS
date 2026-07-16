import { z } from "zod";

/** Curated, small list of common web-safe/Google Fonts names — the UI select is limited to exactly this list, so we never fabricate a font-loading pipeline for an arbitrary string. */
export const WHITE_LABEL_FONT_FAMILIES = [
  "Inter",
  "Roboto",
  "Open Sans",
  "Lato",
  "Montserrat",
  "Poppins",
  "Nunito",
  "Work Sans",
  "Source Sans 3",
  "Raleway",
  "system-ui",
] as const;

const HEX_COLOR_REGEX = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

/** Turns an empty/whitespace-only string into `undefined` before the real check runs, so an untouched optional field never fails validation just for being blank. */
function optionalTrimmed(max: number, label: string) {
  return z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    z.string().trim().max(max, `Keep ${label} under ${max} characters.`).optional(),
  );
}

function optionalHexColor(label: string) {
  return z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    z
      .string()
      .trim()
      .regex(HEX_COLOR_REGEX, `${label} must be a valid hex color, e.g. #1a2b3c.`)
      .optional(),
  );
}

export const upsertWhiteLabelSettingsSchema = z.object({
  brandName: optionalTrimmed(120, "the brand name"),
  primaryColor: optionalHexColor("Primary color"),
  secondaryColor: optionalHexColor("Secondary color"),
  fontFamily: z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    z.enum(WHITE_LABEL_FONT_FAMILIES).optional(),
  ),
  customLoginHeadline: optionalTrimmed(200, "the login headline"),
  emailFromName: optionalTrimmed(120, "the email from-name"),
  emailFromAddress: z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    z.string().trim().email("Enter a valid email address.").max(200).optional(),
  ),
  pdfFooterText: optionalTrimmed(500, "the PDF footer text"),
  enabled: z.boolean().default(false),
});

export type UpsertWhiteLabelSettingsInput = z.infer<typeof upsertWhiteLabelSettingsSchema>;

/**
 * Real hostname syntax check — requires at least one dot (rejects bare
 * "localhost"), rejects IPv4-shaped input, and never accepts a protocol
 * prefix. Deliberately conservative: it doesn't try to validate every real
 * public-suffix rule, just enough to reject obviously-invalid input before
 * we ever attempt real DNS verification against it.
 */
const HOSTNAME_REGEX = /^(?!-)[a-z0-9-]{1,63}(?<!-)(\.(?!-)[a-z0-9-]{1,63}(?<!-))+$/;
const IPV4_REGEX = /^\d{1,3}(\.\d{1,3}){3}$/;

export const addCustomDomainSchema = z.object({
  domain: z
    .string()
    .trim()
    .toLowerCase()
    .min(3, "Enter a domain name.")
    .max(253, "That domain name is too long.")
    .refine((value) => !/^[a-z]+:\/\//.test(value), "Enter just the domain name, without http:// or https://.")
    .refine((value) => !IPV4_REGEX.test(value), "Enter a domain name, not an IP address.")
    .refine((value) => value !== "localhost" && !value.endsWith(".localhost"), "localhost can't be used as a custom domain.")
    .refine((value) => HOSTNAME_REGEX.test(value), "Enter a valid domain name, e.g. app.example.com."),
});

export type AddCustomDomainInput = z.infer<typeof addCustomDomainSchema>;
