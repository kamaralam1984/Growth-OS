import type { VoteChoice } from "@/generated/prisma/client";

export interface VoteTally {
  vote: VoteChoice;
  agentName: string;
  reasoning: string;
}

/** Spec's 5 vote choices, mapped onto the real VoteChoice enum — DELAY reads as "Need More Data" in boardroom language. APPROVE_WITH_CHANGES/REQUEST_REVISION are AI Proposal Review Board-only (see review-voting-bar.tsx for the 4-outcome variant), included here only so this map stays exhaustive. */
const VOTE_LABEL: Record<VoteChoice, string> = {
  APPROVE: "Approve",
  REJECT: "Reject",
  ESCALATE: "Escalate",
  DELAY: "Need More Data",
  DELEGATE: "Delegate",
  DISCUSS: "Discuss",
  APPROVE_WITH_CHANGES: "Approve with Changes",
  REQUEST_REVISION: "Request Revision",
};

const VOTE_COLOR: Record<VoteChoice, string> = {
  APPROVE: "bg-emerald-500",
  REJECT: "bg-rose-500",
  ESCALATE: "bg-amber-500",
  DELAY: "bg-blue-500",
  DELEGATE: "bg-purple-500",
  DISCUSS: "bg-muted-foreground",
  APPROVE_WITH_CHANGES: "bg-teal-500",
  REQUEST_REVISION: "bg-orange-500",
};

const VOTE_ORDER: VoteChoice[] = [
  "APPROVE",
  "REJECT",
  "ESCALATE",
  "DELAY",
  "DELEGATE",
  "DISCUSS",
  "APPROVE_WITH_CHANGES",
  "REQUEST_REVISION",
];

/** Real percentage bar per vote choice, computed directly from DecisionVote rows — never estimated. */
export function VotingBar({ votes }: { votes: VoteTally[] }) {
  const total = votes.length;
  if (total === 0) {
    return <p className="text-xs text-muted-foreground">No votes cast yet.</p>;
  }

  const counts = VOTE_ORDER.map((choice) => ({
    choice,
    count: votes.filter((v) => v.vote === choice).length,
  })).filter((c) => c.count > 0);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-muted">
        {counts.map(({ choice, count }) => (
          <div
            key={choice}
            className={VOTE_COLOR[choice]}
            style={{ width: `${(count / total) * 100}%` }}
            title={`${VOTE_LABEL[choice]}: ${Math.round((count / total) * 100)}%`}
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
        {counts.map(({ choice, count }) => (
          <span key={choice} className="flex items-center gap-1">
            <span className={`size-2 rounded-full ${VOTE_COLOR[choice]}`} />
            {VOTE_LABEL[choice]} {Math.round((count / total) * 100)}%
          </span>
        ))}
      </div>
    </div>
  );
}
