"use client";

import * as React from "react";
import { motion } from "framer-motion";

import { cn } from "@/lib/utils";
import { EASES } from "@/animations";

/**
 * Tabs — simple controlled/uncontrolled Context implementation with a
 * sliding active-indicator animated via framer-motion layoutId.
 *
 * Usage:
 *   <Tabs defaultValue="outreach">
 *     <TabsList>
 *       <TabsTrigger value="outreach">Outreach</TabsTrigger>
 *       <TabsTrigger value="qualify">Qualify</TabsTrigger>
 *     </TabsList>
 *     <TabsContent value="outreach">...</TabsContent>
 *     <TabsContent value="qualify">...</TabsContent>
 *   </Tabs>
 */

interface TabsContextValue {
  value: string;
  setValue: (value: string) => void;
  indicatorId: string;
}

const TabsContext = React.createContext<TabsContextValue | null>(null);

function useTabsContext(component: string) {
  const ctx = React.useContext(TabsContext);
  if (!ctx) {
    throw new Error(`${component} must be used within <Tabs>`);
  }
  return ctx;
}

export interface TabsProps extends React.HTMLAttributes<HTMLDivElement> {
  defaultValue?: string;
  value?: string;
  onValueChange?: (value: string) => void;
}

function Tabs({
  defaultValue,
  value,
  onValueChange,
  className,
  children,
  ...props
}: TabsProps) {
  const indicatorId = React.useId();
  const [internalValue, setInternalValue] = React.useState(defaultValue ?? "");
  const isControlled = value !== undefined;
  const activeValue = isControlled ? value : internalValue;

  const setValue = React.useCallback(
    (next: string) => {
      if (!isControlled) setInternalValue(next);
      onValueChange?.(next);
    },
    [isControlled, onValueChange],
  );

  return (
    <TabsContext.Provider
      value={{ value: activeValue, setValue, indicatorId }}
    >
      <div data-slot="tabs" className={cn("flex flex-col gap-4", className)} {...props}>
        {children}
      </div>
    </TabsContext.Provider>
  );
}

export type TabsListProps = React.HTMLAttributes<HTMLDivElement>;

function TabsList({ className, ...props }: TabsListProps) {
  return (
    <div
      role="tablist"
      data-slot="tabs-list"
      className={cn(
        "relative inline-flex items-center gap-1 rounded-xl border border-border bg-muted/40 p-1",
        className,
      )}
      {...props}
    />
  );
}

export interface TabsTriggerProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  value: string;
}

function TabsTrigger({ value, className, children, ...props }: TabsTriggerProps) {
  const { value: activeValue, setValue, indicatorId } = useTabsContext("TabsTrigger");
  const isActive = activeValue === value;

  return (
    <button
      type="button"
      role="tab"
      aria-selected={isActive}
      data-slot="tabs-trigger"
      data-state={isActive ? "active" : "inactive"}
      onClick={() => setValue(value)}
      className={cn(
        "relative z-10 rounded-lg px-4 py-2 text-sm font-medium transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        isActive ? "text-primary-foreground" : "text-muted-foreground hover:text-foreground",
        className,
      )}
      {...props}
    >
      {isActive && (
        <motion.span
          layoutId={indicatorId}
          className="absolute inset-0 -z-10 rounded-lg bg-primary shadow-card"
          transition={{ duration: 0.35, ease: EASES.outExpo }}
        />
      )}
      {children}
    </button>
  );
}

export interface TabsContentProps extends React.HTMLAttributes<HTMLDivElement> {
  value: string;
}

function TabsContent({ value, className, children, ...props }: TabsContentProps) {
  const { value: activeValue } = useTabsContext("TabsContent");
  if (activeValue !== value) return null;

  return (
    <div
      role="tabpanel"
      data-slot="tabs-content"
      className={cn("focus-visible:outline-none", className)}
      {...props}
    >
      {children}
    </div>
  );
}

export { Tabs, TabsList, TabsTrigger, TabsContent };
