"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Save } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "@/components/ui/toast";
import { createFeatureFlagAction, updateFeatureFlagAction } from "../actions";

export interface GlobalFlagRow {
  id: string;
  key: string;
  name: string;
  description: string | null;
  defaultEnabled: boolean;
}

function FlagEditRow({ flag }: { flag: GlobalFlagRow }) {
  const router = useRouter();
  const [name, setName] = useState(flag.name);
  const [description, setDescription] = useState(flag.description ?? "");
  const [defaultEnabled, setDefaultEnabled] = useState(flag.defaultEnabled);
  const [isPending, startTransition] = useTransition();

  const dirty = name !== flag.name || description !== (flag.description ?? "") || defaultEnabled !== flag.defaultEnabled;

  function handleSave() {
    startTransition(async () => {
      const result = await updateFeatureFlagAction(flag.id, { name, description: description || undefined, defaultEnabled });
      if (!result.ok) {
        toast.error(result.error ?? "Failed to update flag.");
        return;
      }
      toast.success(`"${flag.key}" updated.`);
      router.refresh();
    });
  }

  return (
    <TableRow>
      <TableCell className="font-mono text-xs text-muted-foreground">{flag.key}</TableCell>
      <TableCell>
        <Input value={name} onChange={(e) => setName(e.target.value)} className="h-9" />
      </TableCell>
      <TableCell>
        <Input value={description} onChange={(e) => setDescription(e.target.value)} className="h-9" placeholder="Description" />
      </TableCell>
      <TableCell className="text-center">
        <input
          type="checkbox"
          checked={defaultEnabled}
          onChange={(e) => setDefaultEnabled(e.target.checked)}
          className="size-4 rounded border-input"
        />
      </TableCell>
      <TableCell className="text-right">
        <Button type="button" size="sm" variant="secondary" disabled={!dirty || isPending} onClick={handleSave}>
          <Save className="size-3.5" /> Save
        </Button>
      </TableCell>
    </TableRow>
  );
}

function NewFlagRow({ onCreated }: { onCreated: () => void }) {
  const [key, setKey] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [defaultEnabled, setDefaultEnabled] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleCreate() {
    startTransition(async () => {
      const result = await createFeatureFlagAction({ key, name, description: description || undefined, defaultEnabled });
      if (!result.ok) {
        toast.error(result.error ?? "Failed to create flag.");
        return;
      }
      toast.success(`"${key}" created.`);
      setKey("");
      setName("");
      setDescription("");
      setDefaultEnabled(false);
      onCreated();
    });
  }

  return (
    <TableRow>
      <TableCell>
        <Input value={key} onChange={(e) => setKey(e.target.value)} placeholder="new_flag_key" className="h-9 font-mono text-xs" />
      </TableCell>
      <TableCell>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Display name" className="h-9" />
      </TableCell>
      <TableCell>
        <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description" className="h-9" />
      </TableCell>
      <TableCell className="text-center">
        <input
          type="checkbox"
          checked={defaultEnabled}
          onChange={(e) => setDefaultEnabled(e.target.checked)}
          className="size-4 rounded border-input"
        />
      </TableCell>
      <TableCell className="text-right">
        <Button type="button" size="sm" disabled={!key.trim() || !name.trim() || isPending} onClick={handleCreate}>
          <Plus className="size-3.5" /> Add
        </Button>
      </TableCell>
    </TableRow>
  );
}

/** Real global FeatureFlag registry manager — list/create/edit rows. Platform-operator only (page-level gate); every mutation here also re-checks isPlatformOwner server-side. */
export function GlobalFlagsManager({ flags }: { flags: GlobalFlagRow[] }) {
  const router = useRouter();

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Global feature-flag registry</h3>
          <p className="text-xs text-muted-foreground">{flags.length} registered flag{flags.length === 1 ? "" : "s"}.</p>
        </div>
        <Badge variant="accent">Platform operator</Badge>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Key</TableHead>
            <TableHead>Name</TableHead>
            <TableHead>Description</TableHead>
            <TableHead className="text-center">Default on</TableHead>
            <TableHead className="text-right">Action</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {flags.map((flag) => (
            <FlagEditRow key={flag.id} flag={flag} />
          ))}
          <NewFlagRow onCreated={() => router.refresh()} />
        </TableBody>
      </Table>
    </div>
  );
}
