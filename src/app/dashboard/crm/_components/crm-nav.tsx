"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Kanban,
  Handshake,
  Contact as ContactIcon,
  ListChecks,
  Calendar,
  Activity as ActivityIcon,
  Users2,
  LineChart,
  FileBarChart,
} from "lucide-react";

import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/dashboard/crm", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { href: "/dashboard/crm/pipeline", label: "Pipeline", icon: Kanban },
  { href: "/dashboard/crm/deals", label: "Deals", icon: Handshake },
  { href: "/dashboard/crm/contacts", label: "Contacts", icon: ContactIcon },
  { href: "/dashboard/crm/tasks", label: "Tasks", icon: ListChecks },
  { href: "/dashboard/crm/calendar", label: "Calendar", icon: Calendar },
  { href: "/dashboard/crm/activity", label: "Activity", icon: ActivityIcon },
  { href: "/dashboard/crm/team", label: "Team", icon: Users2 },
  { href: "/dashboard/crm/forecast", label: "Forecast", icon: LineChart },
  { href: "/dashboard/crm/reports", label: "Reports", icon: FileBarChart },
] as const;

export function CrmNav() {
  const pathname = usePathname();

  return (
    <nav className="flex items-center gap-1 overflow-x-auto">
      {LINKS.map((link) => {
        const isActive = "exact" in link && link.exact ? pathname === link.href : pathname.startsWith(link.href);
        const Icon = link.icon;
        return (
          <Link
            key={link.href}
            href={link.href}
            className={cn(
              "inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              isActive ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-accent hover:text-foreground",
            )}
          >
            <Icon className="size-4" />
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
