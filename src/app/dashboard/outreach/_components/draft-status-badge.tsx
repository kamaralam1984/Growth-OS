import { Badge } from "@/components/ui/badge";
import type { DraftStatus } from "@/generated/prisma/client";

const STATUS_LABEL: Record<DraftStatus, string> = {
  DRAFT: "Draft",
  PENDING_APPROVAL: "Pending Approval",
  APPROVED: "Approved",
  QUEUED: "Queued",
  SENT: "Sent",
  FAILED: "Failed",
  REJECTED: "Rejected",
  BOUNCED: "Bounced",
};

const STATUS_VARIANT: Record<DraftStatus, "outline" | "secondary" | "accent" | "default"> = {
  DRAFT: "outline",
  PENDING_APPROVAL: "secondary",
  APPROVED: "accent",
  QUEUED: "accent",
  SENT: "default",
  FAILED: "outline",
  REJECTED: "outline",
  BOUNCED: "outline",
};

const STATUS_CLASS: Partial<Record<DraftStatus, string>> = {
  SENT: "border-transparent bg-primary text-primary-foreground",
  FAILED: "border-destructive/30 bg-destructive/10 text-destructive",
  REJECTED: "border-destructive/30 bg-destructive/10 text-destructive",
  BOUNCED: "border-destructive/30 bg-destructive/10 text-destructive",
};

/** Never blurs the Draft/Pending/Approved/Queued/Sent/Failed distinction — every status gets its own explicit label. */
export function DraftStatusBadge({ status }: { status: DraftStatus }) {
  return (
    <Badge variant={STATUS_VARIANT[status]} className={STATUS_CLASS[status]}>
      {STATUS_LABEL[status]}
    </Badge>
  );
}
