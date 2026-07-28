import { z } from "zod";

/**
 * A logo/banner/photo/image/document field that accepts either a real
 * absolute URL (a user pasting an external link, e.g. an existing Gravatar
 * or CDN URL — still supported) OR one of this app's own internal serving
 * paths (`/api/users/{id}/avatar`, `/api/organizations/{id}/assets/...`)
 * produced by a real upload. Plain `z.string().url()` rejects relative
 * paths outright, which would break every real upload feature that stores
 * its own internal URL in these same fields — this is the one shared
 * relaxation needed to support that, not a general validation loosening.
 */
export const optionalUrlOrInternalPath = z
  .string()
  .trim()
  .optional()
  .or(z.literal(""))
  .refine((value) => !value || value.startsWith("/") || /^https?:\/\//i.test(value), {
    message: "Enter a valid URL.",
  });
