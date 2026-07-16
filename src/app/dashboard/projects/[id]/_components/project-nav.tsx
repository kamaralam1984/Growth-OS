"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Kanban, GanttChartSquare, Layers, Clock, Calendar, FileText, ShieldAlert, Flag, Gavel, Bug } from "lucide-react";

import { cn } from "@/lib/utils";

export function ProjectNav({ projectId }: { projectId: string }) {
  const pathname = usePathname();
  const base = `/dashboard/projects/${projectId}`;

  const LINKS = [
    { href: base, label: "Overview", icon: LayoutDashboard },
    { href: `${base}/delivery`, label: "Delivery Board", icon: Gavel },
    { href: `${base}/board`, label: "Board", icon: Kanban },
    { href: `${base}/gantt`, label: "Gantt", icon: GanttChartSquare },
    { href: `${base}/sprints`, label: "Sprints", icon: Layers },
    { href: `${base}/milestones`, label: "Milestones", icon: Flag },
    { href: `${base}/time`, label: "Time", icon: Clock },
    { href: `/dashboard/crm/calendar?projectId=${projectId}`, label: "Calendar", icon: Calendar },
    { href: `${base}/files`, label: "Files", icon: FileText },
    { href: `${base}/risks`, label: "Risks", icon: ShieldAlert },
    { href: `${base}/bugs`, label: "Bugs", icon: Bug },
  ] as const;

  return (
    <nav className="flex items-center gap-1 overflow-x-auto">
      {LINKS.map((link) => {
        const isActive = link.href === base ? pathname === base : pathname.startsWith(link.href.split("?")[0]) && !link.href.startsWith("/dashboard/crm/calendar");
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
