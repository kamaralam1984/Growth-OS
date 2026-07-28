"use client";

import { useState, useTransition } from "react";
import { Award, ExternalLink, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/ui/form-field";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DocumentUploadField } from "@/components/upload/document-upload-field";
import type { CertificateInput } from "@/lib/validations/company";
import { updateCertificates } from "../actions";

export interface CertificatesSectionProps {
  orgId: string;
  canEdit: boolean;
  initial: CertificateInput[];
}

function newCertificate(): CertificateInput {
  return { id: crypto.randomUUID(), name: "", issuer: "", issuedAt: "", expiresAt: "", fileUrl: "" };
}

export function CertificatesSection({ orgId, canEdit, initial }: CertificatesSectionProps) {
  const [certificates, setCertificates] = useState<CertificateInput[]>(initial);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [pending, startTransition] = useTransition();

  function update(id: string, patch: Partial<CertificateInput>) {
    setCertificates((prev) => prev.map((cert) => (cert.id === id ? { ...cert, ...patch } : cert)));
    setSuccess(false);
  }

  function remove(id: string) {
    setCertificates((prev) => prev.filter((cert) => cert.id !== id));
    setSuccess(false);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    startTransition(async () => {
      const result = await updateCertificates(orgId, certificates);
      if (!result.ok) {
        setError(result.error ?? "Something went wrong. Please try again.");
        return;
      }
      setSuccess(true);
    });
  }

  if (!canEdit) {
    return (
      <Card glass>
        <CardHeader>
          <CardTitle>Certificates</CardTitle>
          <CardDescription>Certifications your organization holds.</CardDescription>
        </CardHeader>
        <CardContent>
          {certificates.length === 0 ? (
            <p className="text-sm text-muted-foreground">No certificates listed yet.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {certificates.map((cert) => (
                <li key={cert.id} className="flex items-start gap-3 rounded-xl border border-border p-4">
                  <Award className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  <div className="flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium text-foreground">{cert.name}</p>
                      {cert.fileUrl && (
                        <a
                          href={cert.fileUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                        >
                          View <ExternalLink className="size-3" />
                        </a>
                      )}
                    </div>
                    {cert.issuer && <p className="text-xs text-muted-foreground">{cert.issuer}</p>}
                    {(cert.issuedAt || cert.expiresAt) && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        {cert.issuedAt && `Issued ${cert.issuedAt}`}
                        {cert.issuedAt && cert.expiresAt && " · "}
                        {cert.expiresAt && `Expires ${cert.expiresAt}`}
                      </p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card glass>
      <CardHeader>
        <CardTitle>Certificates</CardTitle>
        <CardDescription>Certifications your organization holds.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {certificates.length === 0 && (
            <p className="text-sm text-muted-foreground">No certificates added yet.</p>
          )}
          {certificates.map((cert, index) => (
            <div key={cert.id} className="flex flex-col gap-3 rounded-xl border border-border p-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <FormField label="Name" htmlFor={`cert-name-${cert.id}`} required>
                  <Input
                    id={`cert-name-${cert.id}`}
                    placeholder="ISO 27001"
                    value={cert.name}
                    onChange={(e) => update(cert.id, { name: e.target.value })}
                    required
                  />
                </FormField>
                <FormField label="Issuer" htmlFor={`cert-issuer-${cert.id}`}>
                  <Input
                    id={`cert-issuer-${cert.id}`}
                    value={cert.issuer ?? ""}
                    onChange={(e) => update(cert.id, { issuer: e.target.value })}
                  />
                </FormField>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <FormField label="Issued on" htmlFor={`cert-issued-${cert.id}`}>
                  <Input
                    id={`cert-issued-${cert.id}`}
                    type="date"
                    value={cert.issuedAt ?? ""}
                    onChange={(e) => update(cert.id, { issuedAt: e.target.value })}
                  />
                </FormField>
                <FormField label="Expires on" htmlFor={`cert-expires-${cert.id}`}>
                  <Input
                    id={`cert-expires-${cert.id}`}
                    type="date"
                    value={cert.expiresAt ?? ""}
                    onChange={(e) => update(cert.id, { expiresAt: e.target.value })}
                  />
                </FormField>
                <FormField label="Certificate file" htmlFor={`cert-file-${cert.id}`}>
                  <DocumentUploadField
                    id={`cert-file-${cert.id}`}
                    uploadUrl={`/api/organizations/${orgId}/assets`}
                    extraFields={{ kind: "document", previousUrl: cert.fileUrl ?? "" }}
                    value={cert.fileUrl ?? ""}
                    onChange={(url) => update(cert.id, { fileUrl: url })}
                  />
                </FormField>
              </div>
              <div className="flex justify-end">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => remove(cert.id)}
                  aria-label={`Remove certificate ${index + 1}`}
                >
                  <Trash2 className="size-4" /> Remove
                </Button>
              </div>
            </div>
          ))}

          <div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setCertificates((prev) => [...prev, newCertificate()])}
            >
              <Plus className="size-4" /> Add certificate
            </Button>
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
