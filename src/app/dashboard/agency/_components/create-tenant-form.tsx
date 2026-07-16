"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/ui/form-field";
import { toast } from "@/components/ui/toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { createManagedOrganizationAction } from "../actions";

export function CreateTenantForm({ agencyOrganizationId }: { agencyOrganizationId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await createManagedOrganizationAction(agencyOrganizationId, name, ownerEmail);
      if (!result.ok) {
        setError(result.error ?? "Could not create this organization.");
        toast.error(result.error ?? "Could not create this organization.");
        return;
      }
      toast.success(`${name} created — an invitation was sent to ${ownerEmail}.`);
      setName("");
      setOwnerEmail("");
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" size="sm">
          <Plus className="size-4" /> Create tenant
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create a client organization</DialogTitle>
          <DialogDescription>
            Creates a real, fully set-up organization managed by your agency, and invites the owner by email — they
            accept the same way any other invited teammate does.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <FormField label="Organization name" htmlFor="tenantName" required>
            <Input id="tenantName" value={name} onChange={(e) => setName(e.target.value)} placeholder="Acme Inc." required />
          </FormField>
          <FormField label="Owner email" htmlFor="tenantOwnerEmail" required hint="They'll receive an invitation to become this organization's owner.">
            <Input
              id="tenantOwnerEmail"
              type="email"
              value={ownerEmail}
              onChange={(e) => setOwnerEmail(e.target.value)}
              placeholder="owner@acme.com"
              required
            />
          </FormField>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="submit" disabled={pending || !name.trim() || !ownerEmail.trim()}>
              {pending ? "Creating..." : "Create & invite owner"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
