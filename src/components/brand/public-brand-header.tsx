import type { CSSProperties } from "react";

import type { EffectiveBranding } from "@/lib/white-label/resolve-brand";

/**
 * Pre-login brand header for public/unauthenticated pages (login, register,
 * forgot/reset password, the client-portal login) — mirrors the exact same
 * `branding.logoUrl && <img/>` conditional the authenticated dashboard/
 * portal chrome already uses (src/app/dashboard/layout.tsx,
 * src/app/portal/layout.tsx), rendered once per page instead of from a
 * shared layout since none of these routes have a route-segment layout.tsx
 * of their own.
 *
 * Renders nothing when the request isn't white-labeled — the default,
 * unbranded experience on these pages is exactly what it was before this
 * component existed (no logo row at all), never a platform logo this
 * component would have to invent.
 */
export function PublicBrandHeader({ branding }: { branding: EffectiveBranding }) {
  if (!branding.logoUrl) return null;

  return (
    <div className="flex flex-col items-center gap-2 text-center">
      {/* eslint-disable-next-line @next/next/no-img-element -- org-uploaded asset, not a static/optimizable local image */}
      <img src={branding.logoUrl} alt={branding.brandName} className="h-8 w-auto" />
      <span className="text-sm font-medium text-muted-foreground">{branding.brandName}</span>
    </div>
  );
}

/**
 * Real theme-color override for these pages — overrides the `--primary` CSS
 * custom property (the same variable `.btn-animated-gradient` and the
 * card/glow accents in globals.css already read from) for the subtree it's
 * applied to, only when the resolved org actually set a primaryColor.
 * Undefined (no style prop at all) otherwise, so an unbranded request's
 * markup is byte-for-byte what it was before this existed.
 */
export function brandThemeStyle(branding: EffectiveBranding): CSSProperties | undefined {
  if (!branding.primaryColor) return undefined;
  return { "--primary": branding.primaryColor } as CSSProperties;
}
