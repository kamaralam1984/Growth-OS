"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { FormField } from "@/components/ui/form-field";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient } from "../actions";

export interface ClientFormProps {
  companies: Array<{ id: string; name: string }>;
}

export function ClientForm({ companies }: ClientFormProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [companyId, setCompanyId] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [contractValue, setContractValue] = useState("");

  function reset() {
    setName("");
    setCompanyId("");
    setEmail("");
    setPhone("");
    setContractValue("");
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await createClient({
        name,
        companyId,
        email,
        phone,
        status: "ACTIVE",
        contractValue: contractValue ? Number(contractValue) : undefined,
      });
      if (!result.ok) {
        setError(result.error ?? "Something went wrong.");
        return;
      }
      reset();
      setOpen(false);
      router.refresh();
    });
  }

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)}>
        <Plus className="size-4" />
        Add client
      </Button>
    );
  }

  return (
    <Card glass>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>Add client</CardTitle>
        <Button variant="ghost" size="sm" onClick={() => setOpen(false)} aria-label="Close">
          <X className="size-4" />
        </Button>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField label="Client name" htmlFor="client-name" required>
            <Input id="client-name" value={name} onChange={(e) => setName(e.target.value)} required />
          </FormField>
          <FormField label="Company" htmlFor="client-company">
            <Select id="client-company" value={companyId} onChange={(e) => setCompanyId(e.target.value)}>
              <option value="">No company</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Email" htmlFor="client-email">
            <Input id="client-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </FormField>
          <FormField label="Phone" htmlFor="client-phone">
            <Input id="client-phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </FormField>
          <FormField label="Contract value" htmlFor="client-value">
            <Input
              id="client-value"
              type="number"
              min={0}
              value={contractValue}
              onChange={(e) => setContractValue(e.target.value)}
            />
          </FormField>

          {error && <p className="text-sm text-destructive sm:col-span-2">{error}</p>}

          <div className="flex gap-3 sm:col-span-2">
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Save client"}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
