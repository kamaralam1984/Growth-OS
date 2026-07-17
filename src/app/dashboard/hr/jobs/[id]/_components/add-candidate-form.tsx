"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { UserPlus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { addCandidateAction } from "../../../_lib/actions";

export function AddCandidateForm({ jobOpeningId }: { jobOpeningId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [source, setSource] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const result = await addCandidateAction({ jobOpeningId, name, email, source });
      if (!result.ok) {
        toast.error(result.error ?? "Could not add candidate.");
        return;
      }
      toast.success("Candidate added.");
      setName("");
      setEmail("");
      setSource("");
      setOpen(false);
      router.refresh();
    });
  }

  if (!open) {
    return (
      <Button type="button" size="sm" onClick={() => setOpen(true)}>
        <UserPlus className="size-4" /> Add candidate
      </Button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-2 rounded-lg border border-border p-3">
      <Input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} required className="w-40" />
      <Input type="email" placeholder="Email (optional)" value={email} onChange={(e) => setEmail(e.target.value)} className="w-48" />
      <Input placeholder="Source (optional)" value={source} onChange={(e) => setSource(e.target.value)} className="w-36" />
      <Button type="submit" size="sm" disabled={pending}>
        Add
      </Button>
    </form>
  );
}
