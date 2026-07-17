"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Phone, X } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/ui/form-field";
import { toast } from "@/components/ui/toast";
import { createEmergencyContactAction, deactivateEmergencyContactAction } from "../actions";

export interface EmergencyContactRow {
  id: string;
  name: string;
  role: string;
  email: string;
  phone: string | null;
  escalationOrder: number;
}

function CreateContactForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [escalationOrder, setEscalationOrder] = useState(1);
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const result = await createEmergencyContactAction({ name, role, email, phone: phone || undefined, escalationOrder });
      if (!result.ok) {
        toast.error(result.error ?? "Could not add contact.");
        return;
      }
      toast.success("Emergency contact added.");
      setName("");
      setRole("");
      setEmail("");
      setPhone("");
      setEscalationOrder(1);
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-3 sm:grid-cols-5">
      <FormField label="Name" htmlFor="contact-name" required>
        <Input id="contact-name" value={name} onChange={(e) => setName(e.target.value)} required />
      </FormField>
      <FormField label="Role" htmlFor="contact-role" required>
        <Input id="contact-role" value={role} onChange={(e) => setRole(e.target.value)} placeholder="e.g. On-call Engineer" required />
      </FormField>
      <FormField label="Email" htmlFor="contact-email" required>
        <Input id="contact-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
      </FormField>
      <FormField label="Phone" htmlFor="contact-phone">
        <Input id="contact-phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
      </FormField>
      <FormField label="Order" htmlFor="contact-order" required hint="Escalation order">
        <div className="flex gap-2">
          <Input id="contact-order" type="number" min={1} max={99} value={escalationOrder} onChange={(e) => setEscalationOrder(Number(e.target.value))} required />
          <Button type="submit" size="sm" disabled={pending || !name || !role || !email}>
            {pending ? "Adding…" : "Add"}
          </Button>
        </div>
      </FormField>
    </form>
  );
}

function ContactRow({ contact }: { contact: EmergencyContactRow }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function handleRemove() {
    startTransition(async () => {
      const result = await deactivateEmergencyContactAction({ contactId: contact.id });
      if (!result.ok) {
        toast.error(result.error ?? "Could not remove contact.");
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-border/60 p-3">
      <div>
        <p className="text-sm font-medium text-foreground">
          #{contact.escalationOrder} — {contact.name} <span className="text-muted-foreground">({contact.role})</span>
        </p>
        <p className="text-xs text-muted-foreground">
          {contact.email}
          {contact.phone && ` · ${contact.phone}`}
        </p>
      </div>
      <Button variant="outline" size="sm" onClick={handleRemove} disabled={pending} className="text-red-500 hover:bg-red-500/10">
        <X className="size-3.5" />
      </Button>
    </div>
  );
}

export function EmergencyContactsPanel({ contacts }: { contacts: EmergencyContactRow[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Phone className="size-4" /> Emergency Contacts
        </CardTitle>
        <CardDescription>Real, admin-managed escalation roster for the Business Continuity plan — ordered by escalation priority.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <CreateContactForm />
        {contacts.length === 0 ? (
          <p className="text-sm text-muted-foreground">No emergency contacts on file yet.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {contacts.map((contact) => (
              <ContactRow key={contact.id} contact={contact} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
