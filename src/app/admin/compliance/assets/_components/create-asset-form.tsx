"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { FormField } from "@/components/ui/form-field";
import { toast } from "@/components/ui/toast";
import { createAssetAction } from "../actions";

const TYPE_OPTIONS = ["HARDWARE", "SOFTWARE", "CLOUD_SERVICE", "DATA_STORE", "DOCUMENT", "OTHER"] as const;
const CLASSIFICATION_OPTIONS = ["PUBLIC", "INTERNAL", "CONFIDENTIAL", "RESTRICTED"] as const;

export function CreateAssetForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [assetType, setAssetType] = useState<(typeof TYPE_OPTIONS)[number]>("CLOUD_SERVICE");
  const [description, setDescription] = useState("");
  const [classification, setClassification] = useState<(typeof CLASSIFICATION_OPTIONS)[number]>("INTERNAL");
  const [location, setLocation] = useState("");
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const result = await createAssetAction({ name, assetType, description, classification, location: location || undefined });
      if (!result.ok) {
        toast.error(result.error ?? "Could not add asset.");
        return;
      }
      toast.success("Asset added to the inventory.");
      setName("");
      setDescription("");
      setLocation("");
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <FormField label="Asset name" htmlFor="asset-name" required>
          <Input id="asset-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Primary Postgres database" required />
        </FormField>
        <FormField label="Type" htmlFor="asset-type" required>
          <Select id="asset-type" value={assetType} onChange={(e) => setAssetType(e.target.value as (typeof TYPE_OPTIONS)[number])}>
            {TYPE_OPTIONS.map((opt) => (
              <option key={opt} value={opt}>
                {opt.replace(/_/g, " ")}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label="Classification" htmlFor="asset-classification" required>
          <Select id="asset-classification" value={classification} onChange={(e) => setClassification(e.target.value as (typeof CLASSIFICATION_OPTIONS)[number])}>
            {CLASSIFICATION_OPTIONS.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </Select>
        </FormField>
      </div>
      <FormField label="Description" htmlFor="asset-description" required>
        <Input id="asset-description" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What is this asset, and why does it matter?" required />
      </FormField>
      <FormField label="Location (optional)" htmlFor="asset-location" hint="e.g. AWS us-east-1, Postgres primary, local storage/">
        <Input id="asset-location" value={location} onChange={(e) => setLocation(e.target.value)} />
      </FormField>
      <div>
        <Button type="submit" disabled={pending || name.trim().length === 0 || description.trim().length === 0} size="sm">
          {pending ? "Adding…" : "Add asset"}
        </Button>
      </div>
    </form>
  );
}
