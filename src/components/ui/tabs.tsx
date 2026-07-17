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
  /**
   * Whether this trigger has a corresponding <TabsContent> panel. Defaults
   * to true (the normal case). Set to false for "tabs-styled toggle" usages
   * that have no distinct panel to reveal (e.g. the pricing page's
   * monthly/yearly switch, which re-renders the same always-visible grid
   * rather than swapping panels) — otherwise aria-controls would point at
   * an id that never exists in the DOM, which is a real axe-core
   * aria-valid-attr-value violation (an ARIA ID-reference attribute must
   * resolve to an existing element).
   */
  hasPanel?: boolean;
}

// WAI-ARIA APG "Tabs" keyboard pattern (automatic activation — matches this
// component's existing click-to-activate behavior): Left/Right (and Up/Down,
// since this list has no meaningful vertical/horizontal distinction) move
// AND activate the adjacent tab, Home/End jump to the first/last. Reads
// sibling tabs via the DOM (data-value) rather than a registered-list in
// context, since TabsList/TabsTrigger otherwise have no shared registry —
// simplest fix that doesn't restructure the existing Context shape.
function handleTabKeyDown(event: React.KeyboardEvent<HTMLButtonElement>, currentValue: string, setValue: (value: string) => void) {
  const KEYS = ["ArrowRight", "ArrowLeft", "ArrowDown", "ArrowUp", "Home", "End"];
  if (!KEYS.includes(event.key)) return;
  event.preventDefault();

  const tablist = event.currentTarget.closest('[role="tablist"]');
  if (!tablist) return;
  const tabs = Array.from(tablist.querySelectorAll<HTMLButtonElement>('[role="tab"]'));
  if (tabs.length === 0) return;
  const currentIndex = tabs.findIndex((tab) => tab.dataset.value === currentValue);

  let nextIndex = currentIndex;
  if (event.key === "ArrowRight" || event.key === "ArrowDown") nextIndex = (currentIndex + 1) % tabs.length;
  else if (event.key === "ArrowLeft" || event.key === "ArrowUp") nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
  else if (event.key === "Home") nextIndex = 0;
  else if (event.key === "End") nextIndex = tabs.length - 1;

  const nextTab = tabs[nextIndex];
  const nextValue = nextTab?.dataset.value;
  if (nextValue === undefined) return;
  nextTab.focus();
  setValue(nextValue);
}

function TabsTrigger({ value, className, children, hasPanel = true, ...props }: TabsTriggerProps) {
  const { value: activeValue, setValue, indicatorId } = useTabsContext("TabsTrigger");
  const isActive = activeValue === value;

  return (
    <button
      type="button"
      role="tab"
      id={`${indicatorId}-tab-${value}`}
      aria-controls={hasPanel ? `${indicatorId}-panel-${value}` : undefined}
      aria-selected={isActive}
      tabIndex={isActive ? 0 : -1}
      data-slot="tabs-trigger"
      data-state={isActive ? "active" : "inactive"}
      data-value={value}
      onClick={() => setValue(value)}
      onKeyDown={(e) => handleTabKeyDown(e, value, setValue)}
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
  const { value: activeValue, indicatorId } = useTabsContext("TabsContent");
  const isActive = activeValue === value;

  // Stay mounted (hidden via the native `hidden` attribute) rather than
  // unmounting via `return null` when inactive — the sibling TabsTrigger
  // for every tab, not just the active one, points aria-controls at this
  // panel's id, so the id must keep resolving to a real element or axe-core
  // flags it as an invalid ARIA attribute value (aria-valid-attr-value).
  // Children are still only rendered while active, preserving the previous
  // "don't pay render cost for inactive panels" behavior.
  return (
    <div
      role="tabpanel"
      id={`${indicatorId}-panel-${value}`}
      aria-labelledby={`${indicatorId}-tab-${value}`}
      tabIndex={0}
      hidden={!isActive}
      data-slot="tabs-content"
      className={cn("focus-visible:outline-none", className)}
      {...props}
    >
      {isActive ? children : null}
    </div>
  );
}

export { Tabs, TabsList, TabsTrigger, TabsContent };
