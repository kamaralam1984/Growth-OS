"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { UserPlus } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { addContactsToCampaign } from "../../../_lib/campaign-actions";

export interface ContactOption {
  id: string;
  label: string;
}

export function AddContactsForm({ campaignId, contactOptions }: { campaignId: string; contactOptions: ContactOption[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [mode, setMode] = useState<"select" | "industry" | "country" | "tag">("select");
  const [selectedId, setSelectedId] = useState("");
  const [filterValue, setFilterValue] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  function handleAdd() {
    setMessage(null);
    startTransition(async () => {
      const selection =
        mode === "select"
          ? { contactIds: selectedId ? [selectedId] : [] }
          : mode === "industry"
            ? { industry: filterValue }
            : mode === "country"
              ? { country: filterValue }
              : { tag: filterValue };

      const result = await addContactsToCampaign(campaignId, selection);
      setMessage(result.ok ? `Added ${result.addedCount} contact(s).` : result.error ?? "Something went wrong.");
      if (result.ok) router.refresh();
    });
  }

  return (
    <Card glass>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <UserPlus className="size-4" /> Add contacts
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 pt-0">
        <Select value={mode} onChange={(e) => setMode(e.target.value as typeof mode)} className="h-9 text-sm">
          <option value="select">Pick a contact</option>
          <option value="industry">By industry (real Company data)</option>
          <option value="country">By country (real data)</option>
          <option value="tag">By tag</option>
        </Select>

        {mode === "select" ? (
          <Select value={selectedId} onChange={(e) => setSelectedId(e.target.value)} className="h-9 text-sm">
            <option value="">Choose a contact…</option>
            {contactOptions.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </Select>
        ) : (
          <Input value={filterValue} onChange={(e) => setFilterValue(e.target.value)} placeholder={`Enter a ${mode}…`} className="h-9 text-sm" />
        )}

        {message && <p className="text-xs text-primary">{message}</p>}

        <Button size="sm" onClick={handleAdd} disabled={pending || (mode === "select" ? !selectedId : !filterValue.trim())}>
          {pending ? "Adding…" : "Add"}
        </Button>
      </CardContent>
    </Card>
  );
}
