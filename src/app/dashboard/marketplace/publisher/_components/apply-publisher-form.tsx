"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "@/components/ui/toast";
import { applyAsPublisher } from "../actions";

export function ApplyPublisherForm() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [displayName, setDisplayName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [website, setWebsite] = useState("");
  const [bio, setBio] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const result = await applyAsPublisher({ displayName, companyName, contactEmail, website, bio });
      if (!result.ok) {
        toast.error(result.error ?? "Could not submit your publisher application.");
        return;
      }
      toast.success("Application submitted — a platform operator will review it.");
      router.refresh();
    });
  }

  return (
    <Card glass className="max-w-xl">
      <CardHeader>
        <CardTitle>Become a publisher</CardTitle>
        <CardDescription>
          Applying creates your publisher account with status <span className="font-medium text-foreground">PENDING</span>.
          A platform operator reviews and approves new publisher applications manually.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-2">
          <Input placeholder="Publisher / studio name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} required />
          <Input placeholder="Company (optional)" value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
          <Input type="email" placeholder="Contact email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} required />
          <Input placeholder="Website (optional)" value={website} onChange={(e) => setWebsite(e.target.value)} />
          <textarea
            placeholder="Short bio (optional)"
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            className="min-h-20 rounded-lg border border-border bg-background px-3 py-2 text-sm"
          />
          <Button type="submit" disabled={pending} className="mt-1 self-start">
            {pending ? "Submitting..." : "Apply to become a publisher"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
