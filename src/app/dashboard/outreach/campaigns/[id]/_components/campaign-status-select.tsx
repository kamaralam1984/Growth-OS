"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";

import { Select } from "@/components/ui/select";
import { setCampaignStatus } from "../../../_lib/campaign-actions";
import type { CampaignStatus } from "@/generated/prisma/client";

const STATUS_OPTIONS: CampaignStatus[] = ["DRAFT", "ACTIVE", "PAUSED", "COMPLETED", "ARCHIVED"];

export function CampaignStatusSelect({ campaignId, status }: { campaignId: string; status: CampaignStatus }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function handleChange(value: CampaignStatus) {
    startTransition(async () => {
      await setCampaignStatus(campaignId, value);
      router.refresh();
    });
  }

  return (
    <Select value={status} onChange={(e) => handleChange(e.target.value as CampaignStatus)} disabled={pending} className="h-8 w-36 text-xs">
      {STATUS_OPTIONS.map((s) => (
        <option key={s} value={s}>
          {s}
        </option>
      ))}
    </Select>
  );
}
