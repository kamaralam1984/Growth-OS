"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Search, Globe, CheckCircle2, Loader2 } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/ui/form-field";
import { EASES } from "@/animations";
import { startScan } from "../actions";

// Purely a client-side activity indicator — this app has no granular
// server-push channel for a multi-step pipeline (the realtime event bus only
// carries a bare signal, no step payload; see event-bus.ts). These labels
// cycle while the ONE real startScan() call is in flight; the real result
// only ever renders once that call actually returns. Never fabricates a
// score or finding mid-animation.
const SCAN_STEPS = [
  "Fetching website…",
  "Parsing page content…",
  "Detecting technology stack…",
  "Running SEO, Performance, Security & UX checks…",
  "Generating AI executive report…",
];

export function ScanForm() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [stepIndex, setStepIndex] = useState(0);

  const [url, setUrl] = useState("");
  const [websiteName, setWebsiteName] = useState("");
  const [companyNameInput, setCompanyNameInput] = useState("");
  const [industryInput, setIndustryInput] = useState("");
  const [websiteType, setWebsiteType] = useState("");

  useEffect(() => {
    if (!pending) return;
    const interval = setInterval(() => {
      setStepIndex((i) => Math.min(i + 1, SCAN_STEPS.length - 1));
    }, 2200);
    return () => clearInterval(interval);
  }, [pending]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setStepIndex(0);
    startTransition(async () => {
      const result = await startScan({ url, websiteName, companyNameInput, industryInput, websiteType });
      if (!result.ok || !result.scanId) {
        setError(result.error ?? "Something went wrong scanning that website.");
        return;
      }
      router.push(`/dashboard/website-scanner/${result.scanId}`);
    });
  }

  return (
    <Card glass>
      <CardContent className="p-5">
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <FormField label="Website URL" htmlFor="scan-url" required>
            <Input
              id="scan-url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com"
              required
              disabled={pending}
            />
          </FormField>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <FormField label="Website name" htmlFor="scan-website-name">
              <Input id="scan-website-name" value={websiteName} onChange={(e) => setWebsiteName(e.target.value)} disabled={pending} />
            </FormField>
            <FormField label="Company name" htmlFor="scan-company-name">
              <Input id="scan-company-name" value={companyNameInput} onChange={(e) => setCompanyNameInput(e.target.value)} disabled={pending} />
            </FormField>
            <FormField label="Industry" htmlFor="scan-industry">
              <Input id="scan-industry" value={industryInput} onChange={(e) => setIndustryInput(e.target.value)} disabled={pending} />
            </FormField>
          </div>
          <FormField label="Website type" htmlFor="scan-type" hint="e.g. E-commerce, SaaS, Hospital, Landing page">
            <Input id="scan-type" value={websiteType} onChange={(e) => setWebsiteType(e.target.value)} disabled={pending} />
          </FormField>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div>
            <Button type="submit" disabled={pending || url.trim().length < 4}>
              <Search className="size-4" />
              {pending ? "Scanning…" : "Scan website"}
            </Button>
          </div>
        </form>

        <AnimatePresence>
          {pending && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.3, ease: EASES.outExpo }}
              className="mt-5 overflow-hidden rounded-xl border border-primary/20 bg-primary/5 p-4"
            >
              <div className="flex items-center gap-2 text-sm font-medium text-primary">
                <Globe className="size-4 animate-pulse" /> Live scan in progress
              </div>
              <ul className="mt-3 flex flex-col gap-2">
                {SCAN_STEPS.map((step, i) => (
                  <li key={step} className="flex items-center gap-2 text-sm">
                    {i < stepIndex ? (
                      <CheckCircle2 className="size-4 shrink-0 text-primary" />
                    ) : i === stepIndex ? (
                      <Loader2 className="size-4 shrink-0 animate-spin text-primary" />
                    ) : (
                      <span className="size-4 shrink-0 rounded-full border border-border" />
                    )}
                    <span className={i <= stepIndex ? "text-foreground" : "text-muted-foreground"}>{step}</span>
                  </li>
                ))}
              </ul>
            </motion.div>
          )}
        </AnimatePresence>
      </CardContent>
    </Card>
  );
}
