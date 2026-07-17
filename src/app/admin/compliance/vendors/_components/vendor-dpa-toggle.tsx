"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";

import { toast } from "@/components/ui/toast";
import { setVendorDpaStatusAction } from "../actions";

export function VendorDpaToggle({ vendorId, dpaSigned }: { vendorId: string; dpaSigned: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function handleChange(checked: boolean) {
    startTransition(async () => {
      const result = await setVendorDpaStatusAction({ vendorId, dpaSigned: checked });
      if (!result.ok) {
        toast.error(result.error ?? "Could not update DPA status.");
        return;
      }
      router.refresh();
    });
  }

  return (
    <label className="flex items-center gap-2 text-xs text-foreground">
      <input type="checkbox" checked={dpaSigned} disabled={pending} onChange={(e) => handleChange(e.target.checked)} />
      DPA on file
    </label>
  );
}
