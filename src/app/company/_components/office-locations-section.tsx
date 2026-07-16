"use client";

import { useState, useTransition } from "react";
import { Plus, Trash2, MapPin } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/ui/form-field";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { OfficeLocationInput } from "@/lib/validations/company";
import { updateOfficeLocations } from "../actions";

export interface OfficeLocationsSectionProps {
  orgId: string;
  canEdit: boolean;
  initial: OfficeLocationInput[];
}

function newLocation(): OfficeLocationInput {
  return { id: crypto.randomUUID(), label: "", address: "" };
}

export function OfficeLocationsSection({ orgId, canEdit, initial }: OfficeLocationsSectionProps) {
  const [locations, setLocations] = useState<OfficeLocationInput[]>(initial);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [pending, startTransition] = useTransition();

  function update(id: string, patch: Partial<OfficeLocationInput>) {
    setLocations((prev) => prev.map((loc) => (loc.id === id ? { ...loc, ...patch } : loc)));
    setSuccess(false);
  }

  function remove(id: string) {
    setLocations((prev) => prev.filter((loc) => loc.id !== id));
    setSuccess(false);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    startTransition(async () => {
      const result = await updateOfficeLocations(orgId, locations);
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
          <CardTitle>Office locations</CardTitle>
          <CardDescription>Where your team is based.</CardDescription>
        </CardHeader>
        <CardContent>
          {locations.length === 0 ? (
            <p className="text-sm text-muted-foreground">No office locations listed yet.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {locations.map((loc) => (
                <li key={loc.id} className="flex items-start gap-3 rounded-xl border border-border p-4">
                  <MapPin className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium text-foreground">{loc.label}</p>
                    <p className="text-xs text-muted-foreground">{loc.address}</p>
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
        <CardTitle>Office locations</CardTitle>
        <CardDescription>Where your team is based.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {locations.length === 0 && (
            <p className="text-sm text-muted-foreground">No locations added yet.</p>
          )}
          {locations.map((loc, index) => (
            <div key={loc.id} className="flex flex-col gap-3 rounded-xl border border-border p-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <FormField label="Name" htmlFor={`loc-label-${loc.id}`} required>
                  <Input
                    id={`loc-label-${loc.id}`}
                    placeholder="Head Office"
                    value={loc.label}
                    onChange={(e) => update(loc.id, { label: e.target.value })}
                    required
                  />
                </FormField>
                <FormField label="Address" htmlFor={`loc-address-${loc.id}`} required>
                  <Input
                    id={`loc-address-${loc.id}`}
                    placeholder="123 Main St, City, Country"
                    value={loc.address}
                    onChange={(e) => update(loc.id, { address: e.target.value })}
                    required
                  />
                </FormField>
              </div>
              <div className="flex justify-end">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => remove(loc.id)}
                  aria-label={`Remove location ${index + 1}`}
                >
                  <Trash2 className="size-4" /> Remove
                </Button>
              </div>
            </div>
          ))}

          <div>
            <Button type="button" variant="outline" size="sm" onClick={() => setLocations((prev) => [...prev, newLocation()])}>
              <Plus className="size-4" /> Add location
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
