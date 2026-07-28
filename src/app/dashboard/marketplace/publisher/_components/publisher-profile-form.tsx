"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/ui/form-field";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ImageUploadField } from "@/components/upload/image-upload-field";
import { toast } from "@/components/ui/toast";
import { updatePublisherProfile } from "../actions";

const STATUS_VARIANT: Record<string, "default" | "secondary" | "outline" | "accent"> = {
  PENDING: "secondary",
  APPROVED: "accent",
  SUSPENDED: "outline",
  REJECTED: "outline",
};

const STATUS_DESCRIPTION: Record<string, string> = {
  PENDING: "A platform operator reviews and approves new publisher applications manually — there's no self-service approval.",
  APPROVED: "Approved — your submitted listings can go through review and publish.",
  SUSPENDED: "Your publisher account is not currently active.",
  REJECTED: "Your publisher account is not currently active.",
};

export interface PublisherProfileFormProps {
  status: string;
  initial: {
    displayName: string;
    companyName: string;
    website: string;
    bio: string;
    logoUrl: string;
  };
  referralInfo: string | null;
}

export function PublisherProfileForm({ status, initial, referralInfo }: PublisherProfileFormProps) {
  const router = useRouter();
  const [displayName, setDisplayName] = useState(initial.displayName);
  const [companyName, setCompanyName] = useState(initial.companyName);
  const [website, setWebsite] = useState(initial.website);
  const [bio, setBio] = useState(initial.bio);
  const [logoUrl, setLogoUrl] = useState(initial.logoUrl);
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const result = await updatePublisherProfile({ displayName, companyName, website, bio });
      if (!result.ok) {
        toast.error(result.error ?? "Could not save your publisher profile.");
        return;
      }
      toast.success("Publisher profile updated.");
      router.refresh();
    });
  }

  return (
    <Card glass className="max-w-xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {initial.displayName}
          <Badge variant={STATUS_VARIANT[status]}>{status}</Badge>
        </CardTitle>
        <CardDescription>{STATUS_DESCRIPTION[status]}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <FormField label="Logo" htmlFor="publisher-logo">
            <ImageUploadField
              id="publisher-logo"
              uploadUrl="/api/marketplace/publisher/logo"
              value={logoUrl}
              onChange={setLogoUrl}
            />
          </FormField>
          <FormField label="Publisher / studio name" htmlFor="publisher-name">
            <Input id="publisher-name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} required />
          </FormField>
          <FormField label="Company" htmlFor="publisher-company">
            <Input id="publisher-company" value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
          </FormField>
          <FormField label="Website" htmlFor="publisher-website">
            <Input id="publisher-website" value={website} onChange={(e) => setWebsite(e.target.value)} />
          </FormField>
          <FormField label="Bio" htmlFor="publisher-bio">
            <textarea
              id="publisher-bio"
              rows={3}
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              className="w-full rounded-lg border border-input bg-transparent px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </FormField>
          {referralInfo && <p className="text-sm text-muted-foreground">{referralInfo}</p>}
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
