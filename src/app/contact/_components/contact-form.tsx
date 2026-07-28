"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { CheckCircle2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { FormField } from "@/components/ui/form-field";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { fadeInUp } from "@/animations";
import { ALL_COUNTRIES } from "@/lib/constants/timezones";
import { SALES_INQUIRY_DEPARTMENTS } from "@/lib/validations/sales-inquiry";
import { trackMarketingEvent } from "@/lib/client/track-marketing-event";

const DEPARTMENT_LABELS: Record<(typeof SALES_INQUIRY_DEPARTMENTS)[number], string> = {
  SALES: "Sales",
  ENTERPRISE: "Enterprise",
  GOVERNMENT: "Government",
  SUPPORT: "Support",
  PARTNERSHIP: "Partnership",
  INVESTOR: "Investor",
  CAREER: "Career",
};

interface FormState {
  name: string;
  company: string;
  businessEmail: string;
  phone: string;
  country: string;
  department: string;
  industry: string;
  employeeCount: string;
  budget: string;
  timeline: string;
  projectType: string;
  message: string;
  consentGiven: boolean;
  website: string; // honeypot, always left blank by real visitors
}

function initialState(department: string | null): FormState {
  return {
    name: "",
    company: "",
    businessEmail: "",
    phone: "",
    country: "",
    department: department && department in DEPARTMENT_LABELS ? department : "SALES",
    industry: "",
    employeeCount: "",
    budget: "",
    timeline: "",
    projectType: "",
    message: "",
    consentGiven: false,
    website: "",
  };
}

export function ContactForm() {
  const searchParams = useSearchParams();
  const [form, setForm] = useState<FormState>(() => initialState(searchParams.get("department")));
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const response = await fetch("/api/sales-inquiries", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });

    setLoading(false);

    if (!response.ok) {
      const data = await response.json().catch(() => null);
      setError(data?.error ?? "Something went wrong. Please try again.");
      return;
    }

    setSubmitted(true);
    trackMarketingEvent("FORM_SUBMIT", "/contact", `talk_to_sales_${form.department.toLowerCase()}`);
  }

  if (submitted) {
    return (
      <motion.div variants={fadeInUp} initial="hidden" animate="visible" className="w-full max-w-2xl">
        <Card glass className="w-full">
          <CardContent className="flex flex-col items-center gap-4 py-16 text-center">
            <CheckCircle2 className="size-12 text-emerald-500" />
            <h2 className="text-xl font-semibold text-foreground">Thanks — we&apos;ll be in touch</h2>
            <p className="max-w-sm text-sm text-muted-foreground">
              Your message has been sent to our team. We typically respond within one business day.
            </p>
          </CardContent>
        </Card>
      </motion.div>
    );
  }

  return (
    <motion.div variants={fadeInUp} initial="hidden" animate="visible" className="w-full max-w-2xl">
      <Card glass className="w-full">
        <CardHeader>
          <CardTitle className="text-2xl">Talk to sales</CardTitle>
          <CardDescription>
            Tell us a bit about your business and what you&apos;re looking for — a real person on our team will
            follow up.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="flex flex-col gap-5">
            {/* Honeypot: hidden from real visitors via CSS, not display:none
                (some bots skip display:none fields specifically). */}
            <div className="absolute -left-[9999px] h-0 w-0 overflow-hidden" aria-hidden="true">
              <label htmlFor="website">Leave this field empty</label>
              <input
                id="website"
                name="website"
                type="text"
                tabIndex={-1}
                autoComplete="off"
                value={form.website}
                onChange={(e) => set("website", e.target.value)}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="Name" htmlFor="name" required>
                <Input id="name" value={form.name} onChange={(e) => set("name", e.target.value)} required />
              </FormField>
              <FormField label="Company" htmlFor="company" required>
                <Input id="company" value={form.company} onChange={(e) => set("company", e.target.value)} required />
              </FormField>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="Business email" htmlFor="businessEmail" required>
                <Input
                  id="businessEmail"
                  type="email"
                  value={form.businessEmail}
                  onChange={(e) => set("businessEmail", e.target.value)}
                  required
                />
              </FormField>
              <FormField label="Phone" htmlFor="phone">
                <Input id="phone" type="tel" value={form.phone} onChange={(e) => set("phone", e.target.value)} />
              </FormField>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="Country" htmlFor="country">
                <Select id="country" value={form.country} onChange={(e) => set("country", e.target.value)}>
                  <option value="">Select a country</option>
                  {ALL_COUNTRIES.map((country) => (
                    <option key={country.code} value={country.name}>
                      {country.name}
                    </option>
                  ))}
                </Select>
              </FormField>
              <FormField label="Department" htmlFor="department" required>
                <Select id="department" value={form.department} onChange={(e) => set("department", e.target.value)}>
                  {SALES_INQUIRY_DEPARTMENTS.map((dept) => (
                    <option key={dept} value={dept}>
                      {DEPARTMENT_LABELS[dept]}
                    </option>
                  ))}
                </Select>
              </FormField>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="Industry" htmlFor="industry">
                <Input id="industry" value={form.industry} onChange={(e) => set("industry", e.target.value)} />
              </FormField>
              <FormField label="Company size" htmlFor="employeeCount">
                <Select
                  id="employeeCount"
                  value={form.employeeCount}
                  onChange={(e) => set("employeeCount", e.target.value)}
                >
                  <option value="">Select a range</option>
                  <option value="1-10">1-10</option>
                  <option value="10-50">10-50</option>
                  <option value="50-200">50-200</option>
                  <option value="200-1000">200-1000</option>
                  <option value="1000+">1000+</option>
                </Select>
              </FormField>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="Budget" htmlFor="budget">
                <Input id="budget" value={form.budget} onChange={(e) => set("budget", e.target.value)} />
              </FormField>
              <FormField label="Timeline" htmlFor="timeline">
                <Input id="timeline" value={form.timeline} onChange={(e) => set("timeline", e.target.value)} />
              </FormField>
            </div>

            <FormField label="Project type" htmlFor="projectType">
              <Input id="projectType" value={form.projectType} onChange={(e) => set("projectType", e.target.value)} />
            </FormField>

            <FormField label="Message" htmlFor="message" required hint="At least 10 characters.">
              <Textarea
                id="message"
                value={form.message}
                onChange={(e) => set("message", e.target.value)}
                minLength={10}
                required
              />
            </FormField>

            <label htmlFor="consentGiven" className="flex items-start gap-2.5 text-sm text-muted-foreground">
              <Checkbox
                id="consentGiven"
                checked={form.consentGiven}
                onChange={(e) => set("consentGiven", e.target.checked)}
                required
              />
              I agree to be contacted by KVL GrowthOS about my inquiry.
            </label>

            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" disabled={loading} className="mt-2">
              {loading ? "Sending..." : "Send message"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </motion.div>
  );
}
