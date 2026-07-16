"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { FormField } from "@/components/ui/form-field";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createContact, updateContact } from "@/app/dashboard/outreach/_lib/contact-actions";

export interface CrmContactFormInitial {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  jobTitle: string;
  phone: string;
  companyId: string;
  department: string;
  linkedin: string;
  relationshipScore: string;
}

export interface CrmContactFormProps {
  companies: Array<{ id: string; name: string }>;
  initial?: CrmContactFormInitial;
  onDone?: () => void;
}

/** Full CRM Contact form — reuses createContact/updateContact from the Outreach module's contact-actions.ts (extended with linkedin/department/relationshipScore) rather than a parallel action. */
export function CrmContactForm({ companies, initial, onDone }: CrmContactFormProps) {
  const router = useRouter();
  const [open, setOpen] = useState(Boolean(initial));
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [firstName, setFirstName] = useState(initial?.firstName ?? "");
  const [lastName, setLastName] = useState(initial?.lastName ?? "");
  const [email, setEmail] = useState(initial?.email ?? "");
  const [jobTitle, setJobTitle] = useState(initial?.jobTitle ?? "");
  const [phone, setPhone] = useState(initial?.phone ?? "");
  const [companyId, setCompanyId] = useState(initial?.companyId ?? "");
  const [department, setDepartment] = useState(initial?.department ?? "");
  const [linkedin, setLinkedin] = useState(initial?.linkedin ?? "");
  const [relationshipScore, setRelationshipScore] = useState(initial?.relationshipScore ?? "");

  function reset() {
    setFirstName("");
    setLastName("");
    setEmail("");
    setJobTitle("");
    setPhone("");
    setCompanyId("");
    setDepartment("");
    setLinkedin("");
    setRelationshipScore("");
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const input = {
        firstName,
        lastName,
        email,
        jobTitle,
        phone,
        companyId,
        department,
        linkedin,
        relationshipScore: relationshipScore ? Number(relationshipScore) : undefined,
        tags: [],
        status: "NEW" as const,
      };
      const result = initial ? await updateContact(initial.id, input) : await createContact(input);
      if (!result.ok) {
        setError(result.error ?? "Something went wrong.");
        return;
      }
      if (!initial) reset();
      setOpen(false);
      router.refresh();
      onDone?.();
    });
  }

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)}>
        <Plus className="size-4" /> Add contact
      </Button>
    );
  }

  return (
    <Card glass className="w-full">
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>{initial ? "Edit contact" : "Add contact"}</CardTitle>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setOpen(false);
            onDone?.();
          }}
          aria-label="Close"
        >
          <X className="size-4" />
        </Button>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField label="First name" htmlFor="crm-contact-first-name" required>
            <Input id="crm-contact-first-name" value={firstName} onChange={(e) => setFirstName(e.target.value)} required />
          </FormField>
          <FormField label="Last name" htmlFor="crm-contact-last-name">
            <Input id="crm-contact-last-name" value={lastName} onChange={(e) => setLastName(e.target.value)} />
          </FormField>
          <FormField label="Business email" htmlFor="crm-contact-email" required>
            <Input id="crm-contact-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </FormField>
          <FormField label="Business phone" htmlFor="crm-contact-phone">
            <Input id="crm-contact-phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </FormField>
          <FormField label="Position" htmlFor="crm-contact-job-title">
            <Input id="crm-contact-job-title" value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} />
          </FormField>
          <FormField label="Department" htmlFor="crm-contact-department">
            <Input id="crm-contact-department" value={department} onChange={(e) => setDepartment(e.target.value)} />
          </FormField>
          <FormField label="Company" htmlFor="crm-contact-company">
            <Select id="crm-contact-company" value={companyId} onChange={(e) => setCompanyId(e.target.value)}>
              <option value="">No company</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="LinkedIn URL" htmlFor="crm-contact-linkedin">
            <Input id="crm-contact-linkedin" value={linkedin} onChange={(e) => setLinkedin(e.target.value)} placeholder="https://linkedin.com/in/…" />
          </FormField>
          <FormField label="Relationship score (0-100)" htmlFor="crm-contact-score" className="sm:col-span-2">
            <Input
              id="crm-contact-score"
              type="number"
              min={0}
              max={100}
              value={relationshipScore}
              onChange={(e) => setRelationshipScore(e.target.value)}
            />
          </FormField>

          {error && <p className="text-sm text-destructive sm:col-span-2">{error}</p>}

          <div className="flex gap-3 sm:col-span-2">
            <Button type="submit" disabled={pending || !firstName.trim() || !email.trim()}>
              {pending ? "Saving…" : "Save contact"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setOpen(false);
                onDone?.();
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
