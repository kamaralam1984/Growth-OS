"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2, Pencil, ExternalLink } from "lucide-react";

import { Button } from "@/components/ui/button";
import { deleteContact } from "@/app/dashboard/outreach/_lib/contact-actions";
import { CrmContactForm, type CrmContactFormInitial } from "./crm-contact-form";

export interface ContactRow {
  id: string;
  firstName: string;
  lastName: string | null;
  email: string;
  jobTitle: string | null;
  phone: string | null;
  department: string | null;
  linkedin: string | null;
  relationshipScore: number | null;
  companyName: string | null;
  companyId: string | null;
}

export function ContactList({ contacts, companies }: { contacts: ContactRow[]; companies: Array<{ id: string; name: string }> }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [editingId, setEditingId] = useState<string | null>(null);

  if (contacts.length === 0) {
    return <p className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">No contacts yet.</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      {contacts.map((c) => {
        if (editingId === c.id) {
          const initial: CrmContactFormInitial = {
            id: c.id,
            firstName: c.firstName,
            lastName: c.lastName ?? "",
            email: c.email,
            jobTitle: c.jobTitle ?? "",
            phone: c.phone ?? "",
            companyId: c.companyId ?? "",
            department: c.department ?? "",
            linkedin: c.linkedin ?? "",
            relationshipScore: c.relationshipScore != null ? String(c.relationshipScore) : "",
          };
          return <CrmContactForm key={c.id} companies={companies} initial={initial} onDone={() => setEditingId(null)} />;
        }

        return (
          <div key={c.id} className="glass-panel flex flex-wrap items-center justify-between gap-3 rounded-xl p-4 text-sm">
            <div className="min-w-0">
              <p className="font-medium text-foreground">
                {c.firstName} {c.lastName ?? ""}
                {c.jobTitle && <span className="ml-2 font-normal text-muted-foreground">{c.jobTitle}</span>}
              </p>
              <p className="text-xs text-muted-foreground">
                {c.email}
                {c.phone ? ` · ${c.phone}` : ""}
                {c.companyName ? ` · ${c.companyName}` : ""}
                {c.department ? ` · ${c.department}` : ""}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {c.relationshipScore != null && (
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">{c.relationshipScore}/100</span>
              )}
              {c.linkedin && (
                <a href={c.linkedin} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-primary" aria-label="LinkedIn">
                  <ExternalLink className="size-4" />
                </a>
              )}
              <Button variant="ghost" size="sm" onClick={() => setEditingId(c.id)} aria-label="Edit">
                <Pencil className="size-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  startTransition(async () => {
                    await deleteContact(c.id);
                    router.refresh();
                  })
                }
                aria-label="Delete"
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
