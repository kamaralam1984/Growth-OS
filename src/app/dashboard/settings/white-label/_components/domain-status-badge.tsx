import { CheckCircle2, Clock, XCircle } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import type { DomainVerificationStatus } from "@/generated/prisma/client";

export function DomainStatusBadge({ status }: { status: DomainVerificationStatus }) {
  if (status === "VERIFIED") {
    return (
      <Badge variant="accent" className="gap-1">
        <CheckCircle2 className="size-3" /> Verified
      </Badge>
    );
  }
  if (status === "FAILED") {
    return (
      <Badge variant="outline" className="gap-1 border-red-500/40 text-red-500">
        <XCircle className="size-3" /> Failed
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="gap-1">
      <Clock className="size-3" /> Pending
    </Badge>
  );
}
