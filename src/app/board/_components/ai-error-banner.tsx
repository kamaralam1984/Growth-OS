import { AlertTriangle, CreditCard, Plug } from "lucide-react";

export type AIErrorKind = "not_connected" | "billing" | "generic" | undefined;

export interface AiErrorBannerProps {
  error: string;
  kind?: AIErrorKind;
}

/**
 * Honest, distinct banner for the two real AI failure modes the brief calls
 * out (no API key vs. no credit balance) plus a generic fallback — never a
 * silent failure, never fabricated agent output standing in for an error.
 */
export function AiErrorBanner({ error, kind }: AiErrorBannerProps) {
  const Icon = kind === "not_connected" ? Plug : kind === "billing" ? CreditCard : AlertTriangle;
  return (
    <div className="flex items-start gap-2.5 rounded-xl border border-destructive/30 bg-destructive/10 p-3.5 text-sm text-destructive">
      <Icon className="mt-0.5 size-4 shrink-0" />
      <span>{error}</span>
    </div>
  );
}
