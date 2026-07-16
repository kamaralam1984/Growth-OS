"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Handshake, Check } from "lucide-react";

import { cn } from "@/lib/utils";
import { addCompanyToCrm } from "@/app/dashboard/companies/actions";

export function AddToCrmButton({ companyId, alreadyInCrm }: { companyId: string; alreadyInCrm: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [done, setDone] = useState(alreadyInCrm);

  function handleClick(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (done) return;
    startTransition(async () => {
      const result = await addCompanyToCrm(companyId);
      if (result.ok) {
        setDone(true);
        router.refresh();
      }
    });
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={pending || done}
      className={cn(
        "flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
        done ? "border-primary/30 bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground",
      )}
    >
      {done ? <Check className="size-3.5" /> : <Handshake className="size-3.5" />}
      {done ? "In CRM" : pending ? "Adding…" : "Add to CRM"}
    </button>
  );
}
