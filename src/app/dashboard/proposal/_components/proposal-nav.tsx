"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, FileText, ReceiptText, FileSignature, Receipt, ScrollText, LayoutTemplate, Library } from "lucide-react";

import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/dashboard/proposal", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { href: "/dashboard/proposal/proposals", label: "Proposals", icon: FileText },
  { href: "/dashboard/proposal/quotations", label: "Quotations", icon: ReceiptText },
  { href: "/dashboard/proposal/contracts", label: "Contracts", icon: FileSignature },
  { href: "/dashboard/proposal/invoices", label: "Invoices", icon: Receipt },
  { href: "/dashboard/proposal/documents", label: "Legal & Project Docs", icon: ScrollText },
  { href: "/dashboard/proposal/templates", label: "Templates", icon: LayoutTemplate },
  { href: "/dashboard/proposal/library", label: "Library", icon: Library },
] as const;

export function ProposalNav() {
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
