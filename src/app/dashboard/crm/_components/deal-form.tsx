"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { FormField } from "@/components/ui/form-field";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createDeal, updateDeal } from "../_lib/deal-actions";

export interface DealFormOption {
  id: string;
  name: string;
}

export interface DealFormMember {
  userId: string;
  name: string | null;
  email: string | null;
}

export interface DealFormInitial {
  id: string;
  name: string;
  companyId: string;
  contactId: string;
  value: string;
  probability: string;
  expectedCloseDate: string;
  ownerUserId: string;
  priority: "LOW" | "NORMAL" | "HIGH" | "URGENT";
  products: string;
  services: string;
  notes: string;
}

export interface DealFormProps {
  companies: DealFormOption[];
  contacts: DealFormOption[];
  members: DealFormMember[];
  initial?: DealFormInitial;
  onSaved?: (dealId: string) => void;
  onCancel?: () => void;
}

const PRIORITIES = ["LOW", "NORMAL", "HIGH", "URGENT"] as const;

function splitTags(value: string): string[] {
  return value
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}

export function DealForm({ companies, contacts, members, initial, onSaved, onCancel }: DealFormProps) {
  const router = useRouter();
  const [open, setOpen] = useState(Boolean(initial));
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState(initial?.name ?? "");
  const [companyId, setCompanyId] = useState(initial?.companyId ?? "");
  const [contactId, setContactId] = useState(initial?.contactId ?? "");
  const [value, setValue] = useState(initial?.value ?? "");
  const [probability, setProbability] = useState(initial?.probability ?? "");
  const [expectedCloseDate, setExpectedCloseDate] = useState(initial?.expectedCloseDate ?? "");
  const [ownerUserId, setOwnerUserId] = useState(initial?.ownerUserId ?? "");
  const [priority, setPriority] = useState<(typeof PRIORITIES)[number]>(initial?.priority ?? "NORMAL");
  const [products, setProducts] = useState(initial?.products ?? "");
  const [services, setServices] = useState(initial?.services ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");

  function reset() {
    setName("");
    setCompanyId("");
    setContactId("");
    setValue("");
    setProbability("");
    setExpectedCloseDate("");
    setOwnerUserId("");
    setPriority("NORMAL");
    setProducts("");
    setServices("");
    setNotes("");
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const input = {
        name,
        companyId,
        contactId,
        value: value ? Number(value) : undefined,
        probability: probability ? Number(probability) : undefined,
        expectedCloseDate: expectedCloseDate ? new Date(expectedCloseDate) : undefined,
        ownerUserId,
        priority,
        products: splitTags(products),
        services: splitTags(services),
        notes,
      };
      const result = initial ? await updateDeal(initial.id, input) : await createDeal(input);
      if (!result.ok) {
        setError(result.error ?? "Something went wrong.");
        return;
      }
      if (!initial) reset();
      setOpen(false);
      router.refresh();
      const dealId = initial?.id ?? (result as { dealId?: string }).dealId;
      if (dealId) onSaved?.(dealId);
    });
  }

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)}>
        <Plus className="size-4" />
        New Deal
      </Button>
    );
  }

  return (
    <Card glass>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>{initial ? "Edit deal" : "New deal"}</CardTitle>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setOpen(false);
            onCancel?.();
          }}
          aria-label="Close"
        >
          <X className="size-4" />
        </Button>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField label="Deal name" htmlFor="deal-name" required className="sm:col-span-2">
            <Input id="deal-name" value={name} onChange={(e) => setName(e.target.value)} required />
          </FormField>
          <FormField label="Company" htmlFor="deal-company">
            <Select id="deal-company" value={companyId} onChange={(e) => setCompanyId(e.target.value)}>
              <option value="">No company</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Contact" htmlFor="deal-contact">
            <Select id="deal-contact" value={contactId} onChange={(e) => setContactId(e.target.value)}>
              <option value="">No contact</option>
              {contacts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Value" htmlFor="deal-value">
            <Input id="deal-value" type="number" min={0} value={value} onChange={(e) => setValue(e.target.value)} />
          </FormField>
          <FormField label="Probability (%)" htmlFor="deal-probability">
            <Input
              id="deal-probability"
              type="number"
              min={0}
              max={100}
              value={probability}
              onChange={(e) => setProbability(e.target.value)}
            />
          </FormField>
          <FormField label="Expected close date" htmlFor="deal-close-date">
            <Input
              id="deal-close-date"
              type="date"
              value={expectedCloseDate}
              onChange={(e) => setExpectedCloseDate(e.target.value)}
            />
          </FormField>
          <FormField label="Priority" htmlFor="deal-priority">
            <Select id="deal-priority" value={priority} onChange={(e) => setPriority(e.target.value as (typeof PRIORITIES)[number])}>
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Owner" htmlFor="deal-owner">
            <Select id="deal-owner" value={ownerUserId} onChange={(e) => setOwnerUserId(e.target.value)}>
              <option value="">Unassigned</option>
              {members.map((m) => (
                <option key={m.userId} value={m.userId}>
                  {m.name ?? m.email ?? m.userId}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Products (comma-separated)" htmlFor="deal-products">
            <Input id="deal-products" value={products} onChange={(e) => setProducts(e.target.value)} />
          </FormField>
          <FormField label="Services (comma-separated)" htmlFor="deal-services">
            <Input id="deal-services" value={services} onChange={(e) => setServices(e.target.value)} />
          </FormField>
          <FormField label="Notes" htmlFor="deal-notes" className="sm:col-span-2">
            <textarea
              id="deal-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="flex w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none transition-colors focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
            />
          </FormField>

          {error && <p className="text-sm text-destructive sm:col-span-2">{error}</p>}

          <div className="flex gap-3 sm:col-span-2">
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Save deal"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setOpen(false);
                onCancel?.();
              }}
            >
              Cancel
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
