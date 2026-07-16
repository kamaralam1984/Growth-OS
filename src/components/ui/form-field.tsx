import * as React from "react";

import { cn } from "@/lib/utils";

export interface FormFieldProps {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
  hint?: string;
  required?: boolean;
  className?: string;
}

/**
 * Label + control + optional helper-text wrapper used across the
 * registration form and the onboarding wizard. Renders an "(optional)"
 * suffix unless `required` is set, so every field is self-explanatory
 * without a separate legend.
 */
function FormField({ label, htmlFor, children, hint, required = false, className }: FormFieldProps) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={htmlFor} className="text-sm font-medium text-foreground">
        {label}
        {!required && <span className="ml-1 font-normal text-muted-foreground">(optional)</span>}
      </label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export { FormField };
