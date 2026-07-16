"use client";

import type { CSSProperties } from "react";
import { useTheme } from "next-themes";
import { Toaster as SonnerToaster, type ToasterProps } from "sonner";

const toastVars = {
  "--border-radius": "var(--radius-2xl)",

  "--normal-bg": "var(--card)",
  "--normal-border": "var(--border)",
  "--normal-text": "var(--card-foreground)",

  "--success-bg": "color-mix(in srgb, var(--color-emerald-500) 12%, var(--card))",
  "--success-border": "color-mix(in srgb, var(--color-emerald-500) 35%, transparent)",
  "--success-text": "var(--color-emerald-500)",

  "--error-bg": "color-mix(in srgb, var(--color-rose-500) 12%, var(--card))",
  "--error-border": "color-mix(in srgb, var(--color-rose-500) 35%, transparent)",
  "--error-text": "var(--color-rose-500)",

  "--warning-bg": "color-mix(in srgb, var(--color-amber-500) 12%, var(--card))",
  "--warning-border": "color-mix(in srgb, var(--color-amber-500) 35%, transparent)",
  "--warning-text": "var(--color-amber-500)",

  "--info-bg": "color-mix(in srgb, var(--color-blue-500) 12%, var(--card))",
  "--info-border": "color-mix(in srgb, var(--color-blue-500) 35%, transparent)",
  "--info-text": "var(--color-blue-500)",
} as CSSProperties;

function Toaster() {
  const { resolvedTheme } = useTheme();

  return (
    <SonnerToaster
      theme={(resolvedTheme as ToasterProps["theme"]) ?? "dark"}
      position="bottom-right"
      richColors
      closeButton
      toastOptions={{
        classNames: {
          toast: "!shadow-elevated",
        },
      }}
      style={toastVars}
    />
  );
}

export { Toaster };
export { toast } from "sonner";
