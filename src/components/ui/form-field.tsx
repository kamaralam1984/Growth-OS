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
 *
 * Accessibility: when `children` is a single element (true for every real
 * usage in this codebase — one Input/Select/textarea per field) and it
 * doesn't already set its own `aria-describedby`, this wires one up to the
 * hint paragraph automatically. Without it, the hint text renders visually
 * next to the field but has ZERO programmatic association with the
 * control — a screen-reader user tabbing to the input never hears it.
 */
function FormField({ label, htmlFor, children, hint, required = false, className }: FormFieldProps) {
  const hintId = `${htmlFor}-hint`;
  const isSingleElement = React.isValidElement(children);
  const control =
    hint && isSingleElement && !(children.props as { "aria-describedby"?: string })["aria-describedby"]
      ? React.cloneElement(children as React.ReactElement<{ "aria-describedby"?: string }>, { "aria-describedby": hintId })
      : children;

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={htmlFor} className="text-sm font-medium text-foreground">
        {label}
        {!required && <span className="ml-1 font-normal text-muted-foreground">(optional)</span>}
      </label>
      {control}
      {hint && (
        <p id={hintId} className="text-xs text-muted-foreground">
          {hint}
        </p>
      )}
    </div>
  );
}

export { FormField };
