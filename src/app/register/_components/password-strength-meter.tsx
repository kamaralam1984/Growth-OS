"use client";

import { getPasswordStrength } from "@/lib/password-strength";
import { cn } from "@/lib/utils";

/**
 * Live password-strength indicator. Purely a UX hint — the real enforcement
 * is registerSchema (min 8 chars + at least one number). Uses only the
 * existing rose/monochrome palette: filled segments go from a dim rose (weak)
 * to full-intensity rose (very strong), never a rainbow of colors.
 */
export function PasswordStrengthMeter({ password }: { password: string }) {
  const { score, label } = getPasswordStrength(password);

  if (!password) return null;

  const segmentOpacity = ["opacity-30", "opacity-50", "opacity-70", "opacity-85", "opacity-100"];

  return (
    <div className="flex flex-col gap-1.5" aria-live="polite">
      <div className="flex gap-1.5">
        {Array.from({ length: 4 }).map((_, index) => (
          <div
            key={index}
            className={cn(
              "h-1.5 flex-1 rounded-full transition-colors duration-300",
              index < score ? cn("bg-primary", segmentOpacity[score]) : "bg-muted",
            )}
          />
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        Password strength: <span className="font-medium text-foreground">{label}</span>
      </p>
    </div>
  );
}
