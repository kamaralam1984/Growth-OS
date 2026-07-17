"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Check, X, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/components/ui/toast";
import { requestLeaveAction, decideLeaveRequestAction } from "../_lib/actions";
import type { LeaveType } from "@/generated/prisma/client";

const LEAVE_TYPES: LeaveType[] = ["VACATION", "SICK", "UNPAID", "OTHER"];

interface LeaveRequestRow {
  id: string;
  type: LeaveType;
  startDate: string;
  endDate: string;
  status: string;
  reason: string | null;
  requesterLabel: string;
}

export function LeaveRequestPanel({ requests, canDecide }: { requests: LeaveRequestRow[]; canDecide: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<LeaveType>("VACATION");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [reason, setReason] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const result = await requestLeaveAction({ type, startDate, endDate, reason });
      if (!result.ok) {
        toast.error(result.error ?? "Could not submit leave request.");
        return;
      }
      toast.success("Leave request submitted.");
      setOpen(false);
      setStartDate("");
      setEndDate("");
      setReason("");
      router.refresh();
    });
  }

  function handleDecide(id: string, status: "APPROVED" | "REJECTED") {
    startTransition(async () => {
      const result = await decideLeaveRequestAction(id, status);
      if (!result.ok) {
        toast.error(result.error ?? "Could not decide request.");
        return;
      }
      toast.success(`Leave request ${status.toLowerCase()}.`);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {!open ? (
        <Button type="button" size="sm" variant="outline" onClick={() => setOpen(true)} className="self-start">
          <Plus className="size-4" /> Request leave
        </Button>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-2 rounded-lg border border-border p-3">
          <Select value={type} onChange={(e) => setType(e.target.value as LeaveType)} className="w-32">
            {LEAVE_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </Select>
          <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required className="w-40" />
          <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} required className="w-40" />
          <Input placeholder="Reason (optional)" value={reason} onChange={(e) => setReason(e.target.value)} className="flex-1 min-w-[160px]" />
          <Button type="submit" size="sm" disabled={pending}>
            Submit
          </Button>
        </form>
      )}

      {requests.length === 0 ? (
        <p className="text-sm text-muted-foreground">No leave requests.</p>
      ) : (
        requests.map((request) => (
          <div key={request.id} className="flex items-center justify-between gap-2 rounded-lg border border-border p-3 text-sm">
            <div>
              <p className="text-foreground">
                {request.requesterLabel} · {request.type} · {request.startDate} → {request.endDate}
              </p>
              {request.reason && <p className="text-xs text-muted-foreground">{request.reason}</p>}
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline">{request.status}</Badge>
              {canDecide && request.status === "PENDING" && (
                <>
                  <Button type="button" size="sm" variant="outline" onClick={() => handleDecide(request.id, "APPROVED")} disabled={pending}>
                    <Check className="size-3.5" />
                  </Button>
                  <Button type="button" size="sm" variant="outline" onClick={() => handleDecide(request.id, "REJECTED")} disabled={pending}>
                    <X className="size-3.5" />
                  </Button>
                </>
              )}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
