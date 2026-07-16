"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/ui/form-field";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TagInput } from "@/app/onboarding/_components/tag-input";
import { createContact } from "../../_lib/contact-actions";

export function ContactForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [country, setCountry] = useState("");
  const [city, setCity] = useState("");
  const [tags, setTags] = useState<string[]>([]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await createContact({ firstName, lastName, email, jobTitle, country, city, tags });
      if (!result.ok) {
        setError(result.error ?? "Something went wrong.");
        return;
      }
      setOpen(false);
      setFirstName("");
      setLastName("");
      setEmail("");
      setJobTitle("");
      setCountry("");
      setCity("");
      setTags([]);
      router.refresh();
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
        <CardTitle>Add contact</CardTitle>
        <Button variant="ghost" size="sm" onClick={() => setOpen(false)} aria-label="Close">
          <X className="size-4" />
        </Button>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField label="First name" htmlFor="contact-first-name" required>
            <Input id="contact-first-name" value={firstName} onChange={(e) => setFirstName(e.target.value)} required />
          </FormField>
          <FormField label="Last name" htmlFor="contact-last-name">
            <Input id="contact-last-name" value={lastName} onChange={(e) => setLastName(e.target.value)} />
          </FormField>
          <FormField label="Email" htmlFor="contact-email" required className="sm:col-span-2">
            <Input id="contact-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </FormField>
          <FormField label="Job title" htmlFor="contact-job-title">
            <Input id="contact-job-title" value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} />
          </FormField>
          <FormField label="Country" htmlFor="contact-country">
            <Input id="contact-country" value={country} onChange={(e) => setCountry(e.target.value)} />
          </FormField>
          <FormField label="City" htmlFor="contact-city" className="sm:col-span-2">
            <Input id="contact-city" value={city} onChange={(e) => setCity(e.target.value)} />
          </FormField>
          <FormField label="Tags" htmlFor="contact-tags" className="sm:col-span-2">
            <TagInput presetOptions={[]} value={tags} onChange={setTags} placeholder="Add a tag and press Enter" />
          </FormField>

          {error && <p className="text-sm text-destructive sm:col-span-2">{error}</p>}

          <div className="flex gap-3 sm:col-span-2">
            <Button type="submit" disabled={pending || !firstName.trim() || !email.trim()}>
              {pending ? "Saving…" : "Save contact"}
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
