"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { FormField } from "@/components/ui/form-field";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { toast } from "@/components/ui/toast";
import { updateBrandSettingsAction } from "../actions";
import { WHITE_LABEL_FONT_FAMILIES } from "@/lib/validations/white-label";

export interface BrandSettingsFormProps {
  canManage: boolean;
  initial: {
    brandName: string;
    primaryColor: string;
    secondaryColor: string;
    fontFamily: string;
    customLoginHeadline: string;
    emailFromName: string;
    emailFromAddress: string;
    pdfFooterText: string;
    enabled: boolean;
    logoUrl: string | null;
    faviconUrl: string | null;
  };
}

/** Real form + Server Action for WhiteLabelSettings — combines the plain-text fields and the two optional file inputs (logo, favicon) into a single multipart submission, same toggle-card + FormData shape as UploadDocumentForm. */
export function BrandSettingsForm({ canManage, initial }: BrandSettingsFormProps) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [faviconPreview, setFaviconPreview] = useState<string | null>(null);
  const [primaryColor, setPrimaryColor] = useState(initial.primaryColor || "#3b82f6");
  const [secondaryColor, setSecondaryColor] = useState(initial.secondaryColor || "#8b5cf6");

  function handleFileChange(kind: "logo" | "favicon", file: File | null) {
    const setPreview = kind === "logo" ? setLogoPreview : setFaviconPreview;
    if (!file) {
      setPreview(null);
      return;
    }
    setPreview(URL.createObjectURL(file));
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await updateBrandSettingsAction(formData);
      if (!result.ok) {
        setError(result.error ?? "Something went wrong.");
        toast.error(result.error ?? "Something went wrong.");
        return;
      }
      toast.success("Brand settings saved.");
      router.refresh();
    });
  }

  return (
    <Card glass className="w-full">
      <CardHeader>
        <CardTitle>Brand settings</CardTitle>
        <CardDescription>
          Real values stored on this organization&apos;s WhiteLabelSettings row. Saving here does not yet change what
          visitors see on the public login screen, dashboard chrome, PDF exports, or emails — those rendering
          surfaces are wired up in a later pass.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form ref={formRef} onSubmit={handleSubmit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField label="Brand name" htmlFor="wl-brand-name" className="sm:col-span-2">
            <Input id="wl-brand-name" name="brandName" defaultValue={initial.brandName} maxLength={120} placeholder="Acme Growth" disabled={!canManage} />
          </FormField>

          <FormField label="Logo" htmlFor="wl-logo-file" hint="PNG, JPEG, WebP, GIF, or SVG — up to 2MB.">
            <Input
              id="wl-logo-file"
              name="logoFile"
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
              disabled={!canManage}
              onChange={(e) => handleFileChange("logo", e.target.files?.[0] ?? null)}
            />
            {(logoPreview ?? initial.logoUrl) && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={logoPreview ?? initial.logoUrl ?? undefined}
                alt="Logo preview"
                className="mt-2 h-12 max-w-[160px] rounded border border-border bg-white object-contain p-1"
              />
            )}
          </FormField>

          <FormField label="Favicon" htmlFor="wl-favicon-file" hint="PNG, ICO, or SVG — up to 512KB.">
            <Input
              id="wl-favicon-file"
              name="faviconFile"
              type="file"
              accept="image/png,image/x-icon,image/vnd.microsoft.icon,image/svg+xml"
              disabled={!canManage}
              onChange={(e) => handleFileChange("favicon", e.target.files?.[0] ?? null)}
            />
            {(faviconPreview ?? initial.faviconUrl) && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={faviconPreview ?? initial.faviconUrl ?? undefined}
                alt="Favicon preview"
                className="mt-2 size-8 rounded border border-border bg-white object-contain p-1"
              />
            )}
          </FormField>

          <FormField label="Primary color" htmlFor="wl-primary-color">
            <div className="flex items-center gap-2">
              <input
                id="wl-primary-color"
                name="primaryColor"
                type="color"
                value={primaryColor}
                onChange={(e) => setPrimaryColor(e.target.value)}
                disabled={!canManage}
                className="h-11 w-14 cursor-pointer rounded-lg border border-input bg-transparent p-1 disabled:cursor-not-allowed disabled:opacity-50"
              />
              <span className="text-sm text-muted-foreground">{primaryColor}</span>
            </div>
          </FormField>

          <FormField label="Secondary color" htmlFor="wl-secondary-color">
            <div className="flex items-center gap-2">
              <input
                id="wl-secondary-color"
                name="secondaryColor"
                type="color"
                value={secondaryColor}
                onChange={(e) => setSecondaryColor(e.target.value)}
                disabled={!canManage}
                className="h-11 w-14 cursor-pointer rounded-lg border border-input bg-transparent p-1 disabled:cursor-not-allowed disabled:opacity-50"
              />
              <span className="text-sm text-muted-foreground">{secondaryColor}</span>
            </div>
          </FormField>

          <FormField label="Font family" htmlFor="wl-font-family" className="sm:col-span-2">
            <Select id="wl-font-family" name="fontFamily" defaultValue={initial.fontFamily} disabled={!canManage}>
              <option value="">Use KVL GrowthOS default</option>
              {WHITE_LABEL_FONT_FAMILIES.map((font) => (
                <option key={font} value={font}>
                  {font}
                </option>
              ))}
            </Select>
          </FormField>

          <FormField label="Custom login headline" htmlFor="wl-login-headline" className="sm:col-span-2" hint="Shown above the login form once wired into the login screen.">
            <Input id="wl-login-headline" name="customLoginHeadline" defaultValue={initial.customLoginHeadline} maxLength={200} placeholder="Welcome back to Acme Growth" disabled={!canManage} />
          </FormField>

          <FormField label="Email from name" htmlFor="wl-email-from-name">
            <Input id="wl-email-from-name" name="emailFromName" defaultValue={initial.emailFromName} maxLength={120} placeholder="Acme Growth" disabled={!canManage} />
          </FormField>

          <FormField label="Email from address" htmlFor="wl-email-from-address">
            <Input id="wl-email-from-address" name="emailFromAddress" type="email" defaultValue={initial.emailFromAddress} maxLength={200} placeholder="notifications@acme.com" disabled={!canManage} />
          </FormField>

          <FormField label="PDF footer text" htmlFor="wl-pdf-footer" className="sm:col-span-2">
            <Input id="wl-pdf-footer" name="pdfFooterText" defaultValue={initial.pdfFooterText} maxLength={500} placeholder="Generated by Acme Growth" disabled={!canManage} />
          </FormField>

          <div className="flex items-center gap-2 sm:col-span-2">
            <input id="wl-enabled" name="enabled" type="checkbox" defaultChecked={initial.enabled} disabled={!canManage} className="size-4 rounded border-input" />
            <label htmlFor="wl-enabled" className="text-sm font-medium text-foreground">
              Enable white-label branding for this organization
            </label>
          </div>

          {error && <p className="text-sm text-destructive sm:col-span-2">{error}</p>}

          {canManage && (
            <div className="sm:col-span-2">
              <Button type="submit" disabled={pending}>
                {pending ? "Saving…" : "Save brand settings"}
              </Button>
            </div>
          )}
        </form>
      </CardContent>
    </Card>
  );
}
