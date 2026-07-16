"use client";

import { Copy } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";

export function CopyReferralLink({ link }: { link: string }) {
  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      toast.success("Referral link copied.");
    } catch {
      toast.error("Could not copy to clipboard.");
    }
  }

  return (
    <div className="flex items-center gap-2">
      <Input value={link} readOnly className="font-mono text-xs" />
      <Button type="button" variant="outline" size="sm" onClick={copy} aria-label="Copy referral link">
        <Copy className="size-4" />
      </Button>
    </div>
  );
}
