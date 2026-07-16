"use client";

import * as React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";
import { DURATIONS, EASES } from "@/animations";

/**
 * Accordion — plain React state, no external dependency beyond framer-motion.
 *
 * Usage:
 *   <Accordion type="single" defaultValue="item-1">
 *     <AccordionItem value="item-1">
 *       <AccordionTrigger>What is GrowthOS?</AccordionTrigger>
 *       <AccordionContent>It's the AI workforce that grows your business.</AccordionContent>
 *     </AccordionItem>
 *   </Accordion>
 */

type AccordionType = "single" | "multiple";

interface AccordionContextValue {
  openValues: string[];
  toggle: (value: string) => void;
}

const AccordionContext = React.createContext<AccordionContextValue | null>(null);

function useAccordionContext(component: string) {
  const ctx = React.useContext(AccordionContext);
  if (!ctx) {
    throw new Error(`${component} must be used within an <Accordion>`);
  }
  return ctx;
}

export interface AccordionProps extends React.HTMLAttributes<HTMLDivElement> {
  type?: AccordionType;
  defaultValue?: string | string[];
  value?: string | string[];
  onValueChange?: (value: string | string[]) => void;
}

function Accordion({
  type = "single",
  defaultValue,
  value,
  onValueChange,
  className,
  children,
  ...props
}: AccordionProps) {
  const toArray = React.useCallback(
    (v: string | string[] | undefined): string[] => {
      if (v === undefined) return [];
      return Array.isArray(v) ? v : [v];
    },
    [],
  );

  const [internalOpen, setInternalOpen] = React.useState<string[]>(() =>
    toArray(defaultValue),
  );

  const isControlled = value !== undefined;
  const openValues = isControlled ? toArray(value) : internalOpen;

  const toggle = React.useCallback(
    (itemValue: string) => {
      const isOpen = openValues.includes(itemValue);
      let next: string[];

      if (type === "single") {
        next = isOpen ? [] : [itemValue];
      } else {
        next = isOpen
          ? openValues.filter((v) => v !== itemValue)
          : [...openValues, itemValue];
      }

      if (!isControlled) {
        setInternalOpen(next);
      }

      onValueChange?.(type === "single" ? (next[0] ?? "") : next);
    },
    [isControlled, onValueChange, openValues, type],
  );

  return (
    <AccordionContext.Provider value={{ openValues, toggle }}>
      <div data-slot="accordion" className={cn("flex flex-col", className)} {...props}>
        {children}
      </div>
    </AccordionContext.Provider>
  );
}

const AccordionItemContext = React.createContext<string | null>(null);

export interface AccordionItemProps extends React.HTMLAttributes<HTMLDivElement> {
  value: string;
}

function AccordionItem({ value, className, children, ...props }: AccordionItemProps) {
  return (
    <AccordionItemContext.Provider value={value}>
      <div
        data-slot="accordion-item"
        className={cn("border-b border-border", className)}
        {...props}
      >
        {children}
      </div>
    </AccordionItemContext.Provider>
  );
}

function useAccordionItemValue(component: string) {
  const value = React.useContext(AccordionItemContext);
  if (value === null) {
    throw new Error(`${component} must be used within an <AccordionItem>`);
  }
  return value;
}

export type AccordionTriggerProps = React.ButtonHTMLAttributes<HTMLButtonElement>;

function AccordionTrigger({ className, children, ...props }: AccordionTriggerProps) {
  const value = useAccordionItemValue("AccordionTrigger");
  const { openValues, toggle } = useAccordionContext("AccordionTrigger");
  const isOpen = openValues.includes(value);
  const triggerId = `accordion-trigger-${value}`;
  const contentId = `accordion-content-${value}`;

  return (
    <button
      id={triggerId}
      type="button"
      data-slot="accordion-trigger"
      aria-expanded={isOpen}
      aria-controls={contentId}
      onClick={() => toggle(value)}
      className={cn(
        "flex w-full items-center justify-between gap-4 py-5 text-left text-sm font-medium text-foreground transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:text-base",
        className,
      )}
      {...props}
    >
      <span>{children}</span>
      <ChevronDown
        aria-hidden
        className={cn(
          "size-4 shrink-0 text-muted-foreground transition-transform duration-300",
          isOpen && "rotate-180 text-primary",
        )}
        style={{ transitionTimingFunction: "var(--ease-out-quad)" }}
      />
    </button>
  );
}

export type AccordionContentProps = React.HTMLAttributes<HTMLDivElement>;

function AccordionContent({ className, children, ...props }: AccordionContentProps) {
  const value = useAccordionItemValue("AccordionContent");
  const { openValues } = useAccordionContext("AccordionContent");
  const isOpen = openValues.includes(value);
  const triggerId = `accordion-trigger-${value}`;
  const contentId = `accordion-content-${value}`;

  return (
    <AnimatePresence initial={false}>
      {isOpen && (
        <motion.div
          id={contentId}
          role="region"
          aria-labelledby={triggerId}
          key="content"
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: DURATIONS.base, ease: EASES.outExpo }}
          className="overflow-hidden"
        >
          <div className={cn("pb-5 text-sm text-muted-foreground", className)} {...props}>
            {children}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export { Accordion, AccordionItem, AccordionTrigger, AccordionContent };
