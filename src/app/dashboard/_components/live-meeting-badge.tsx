import Link from "next/link";
import { Radio } from "lucide-react";

import { StatusDot } from "@/app/board/_components/status-dot";

/** Links to the live meeting when one real Meeting row has status LIVE; renders nothing otherwise. */
export function LiveMeetingBadge({ meeting }: { meeting: { id: string; title: string } | null }) {
  if (!meeting) return null;

  return (
    <Link
      href={`/board/meetings/${meeting.id}`}
      className="hidden items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary/15 md:inline-flex"
    >
      <StatusDot />
      <Radio className="size-3.5" />
      <span className="max-w-32 truncate">{meeting.title}</span>
    </Link>
  );
}
