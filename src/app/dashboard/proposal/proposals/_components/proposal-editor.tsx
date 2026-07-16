"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { updateProposalContent, updateProposalStatus } from "../../actions";
import type { ProposalStatusInput } from "@/lib/validations/proposal";

export interface ProposalEditorProps {
  proposalId: string;
  initialTitle: string;
  initialContent: string;
  initialValue: string;
  status: ProposalStatusInput;
}

export function ProposalEditor({ proposalId, initialTitle, initialContent, initialValue, status }: ProposalEditorProps) {
  const router = useRouter();
  const [title, setTitle] = useState(initialTitle);
  const [content, setContent] = useState(initialContent);
  const [value, setValue] = useState(initialValue);
  const [saving, startSave] = useTransition();
  const [statusPending, startStatus] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function handleSave() {
    setError(null);
    setSaved(false);
    startSave(async () => {
      const result = await updateProposalContent(proposalId, {
        title,
        content,
        value: value ? Number(value) : undefined,
      });
      if (!result.ok) {
        setError(result.error ?? "Something went wrong.");
        return;
      }
      setSaved(true);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Input value={title} onChange={(e) => setTitle(e.target.value)} className="max-w-md text-lg font-medium" />
        <div className="flex items-center gap-2">
          <Input
            type="number"
            min={0}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="Value"
            className="w-32"
          />
          <Select
            value={status}
            disabled={statusPending}
            onChange={(e) => {
              const next = e.target.value as ProposalStatusInput;
              startStatus(async () => {
                await updateProposalStatus(proposalId, next);
                router.refresh();
              });
            }}
            className="h-11 w-32"
          >
            <option value="DRAFT">Draft</option>
            <option value="SENT">Sent</option>
            <option value="ACCEPTED">Accepted</option>
            <option value="REJECTED">Rejected</option>
          </Select>
        </div>
      </div>

      <Card glass>
        <CardContent className="p-0">
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={20}
            className="w-full resize-y rounded-2xl bg-transparent p-5 font-mono text-sm leading-relaxed text-foreground focus-visible:outline-none"
          />
        </CardContent>
      </Card>

      {error && <p className="text-sm text-destructive">{error}</p>}
      {saved && <p className="text-sm text-primary">Saved.</p>}

      <div>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? "Saving…" : "Save changes"}
        </Button>
      </div>
    </div>
  );
}
