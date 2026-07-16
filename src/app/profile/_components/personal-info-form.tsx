"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { FormField } from "@/components/ui/form-field";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { COMMON_COUNTRIES, COMMON_LANGUAGES } from "@/lib/constants/onboarding";
import type { PersonalInfoInput } from "@/lib/validations/profile";
import { updatePersonalInfo } from "../actions";

export interface PersonalInfoFormProps {
  initial: PersonalInfoInput;
  email: string;
}

export function PersonalInfoForm({ initial, email }: PersonalInfoFormProps) {
  const [form, setForm] = useState<PersonalInfoInput>(initial);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [pending, startTransition] = useTransition();

  function set<K extends keyof PersonalInfoInput>(key: K, value: PersonalInfoInput[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setSuccess(false);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    startTransition(async () => {
      const result = await updatePersonalInfo(form);
      if (!result.ok) {
        setError(result.error ?? "Something went wrong. Please try again.");
        return;
      }
      setSuccess(true);
    });
  }

  return (
    <Card glass>
      <CardHeader>
        <CardTitle>Personal information</CardTitle>
        <CardDescription>How your AI workforce and teammates identify you.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="First name" htmlFor="firstName" required>
              <Input
                id="firstName"
                value={form.firstName}
                onChange={(e) => set("firstName", e.target.value)}
                required
              />
            </FormField>
            <FormField label="Last name" htmlFor="lastName" required>
              <Input
                id="lastName"
                value={form.lastName}
                onChange={(e) => set("lastName", e.target.value)}
                required
              />
            </FormField>
          </div>

          <FormField
            label="Email"
            htmlFor="email"
            required
            hint="Changing your email isn't supported yet — contact support if you need this updated."
          >
            <Input id="email" type="email" value={email} disabled />
          </FormField>

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Job title" htmlFor="jobTitle">
              <Input
                id="jobTitle"
                value={form.jobTitle ?? ""}
                onChange={(e) => set("jobTitle", e.target.value)}
              />
            </FormField>
            <FormField label="Phone" htmlFor="phone">
              <Input id="phone" type="tel" value={form.phone ?? ""} onChange={(e) => set("phone", e.target.value)} />
            </FormField>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Country" htmlFor="country">
              <Select id="country" value={form.country ?? ""} onChange={(e) => set("country", e.target.value)}>
                <option value="">Select a country</option>
                {COMMON_COUNTRIES.map((country) => (
                  <option key={country} value={country}>
                    {country}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label="Preferred language" htmlFor="language">
              <Select id="language" value={form.language ?? ""} onChange={(e) => set("language", e.target.value)}>
                <option value="">Select a language</option>
                {COMMON_LANGUAGES.map((language) => (
                  <option key={language} value={language}>
                    {language}
                  </option>
                ))}
              </Select>
            </FormField>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Timezone" htmlFor="timezone" hint="IANA name, e.g. America/New_York.">
              <Input
                id="timezone"
                value={form.timezone ?? ""}
                onChange={(e) => set("timezone", e.target.value)}
              />
            </FormField>
            <FormField label="Profile photo URL" htmlFor="image">
              <Input id="image" type="url" value={form.image ?? ""} onChange={(e) => set("image", e.target.value)} />
            </FormField>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
          {success && <p className="text-sm text-primary">Saved.</p>}

          <div className="flex justify-end">
            <Button type="submit" disabled={pending}>
              {pending ? "Saving..." : "Save changes"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
