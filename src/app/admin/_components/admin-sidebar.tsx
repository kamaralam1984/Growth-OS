"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Workflow,
  Wrench,
  Server,
  AlertTriangle,
  ShieldCheck,
  CreditCard,
  Landmark,
  Percent,
} from "lucide-react";

import { cn } from "@/lib/utils";

interface AdminLink {
  href: string;
  label: string;
  icon: typeof Workflow;
  exact?: boolean;
}

interface AdminLinkGroup {
  label: string;
  links: AdminLink[];
}

/**
 * Every group/link here is a real, working platform-scoped page — no
 * placeholders. Deliberately does NOT mirror the tenant dashboard sidebar's
 * full nav (CRM, Projects, Billing-as-a-customer, etc.) — those pages are
 * per-organization and have no meaningful "platform" view without picking a
 * specific tenant first (a separate, larger feature — see the plan behind
 * this file for why it's out of scope here).
 */
const GROUPS: AdminLinkGroup[] = [
  {
    label: "Automation",
    links: [
      { href: "/admin/workflow", label: "Workflow", icon: Workflow, exact: true },
      { href: "/admin/automation", label: "Automation Builder", icon: Wrench },
    ],
  },
  {
    label: "Operations",
    links: [
      { href: "/admin/production", label: "Production", icon: Server, exact: true },
      { href: "/admin/incidents", label: "Incidents", icon: AlertTriangle },
      { href: "/admin/compliance", label: "Compliance", icon: ShieldCheck, exact: true },
    ],
  },
  {
    label: "Finance",
    links: [
      { href: "/admin/billing", label: "Billing", icon: CreditCard, exact: true },
      { href: "/admin/payouts", label: "Payouts", icon: Landmark, exact: true },
    ],
  },
  {
    label: "Partners",
    links: [{ href: "/admin/partners", label: "Partners", icon: Percent, exact: true }],
  },
];

export function AdminSidebar() {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-5 overflow-y-auto p-3">
      {GROUPS.map((group) => (
        <div key={group.label} className="flex flex-col gap-1">
          <p className="px-3 pb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{group.label}</p>
          {group.links.map((link) => {
            const isActive = link.exact ? pathname === link.href : pathname.startsWith(link.href);
            const Icon = link.icon;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  "inline-flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  isActive ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-accent hover:text-foreground",
                )}
              >
                <Icon className="size-4 shrink-0" />
                {link.label}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
