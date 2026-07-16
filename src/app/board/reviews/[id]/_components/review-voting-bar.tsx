import type { VoteChoice } from "@/generated/prisma/client";

export interface ReviewVoteTally {
  vote: VoteChoice;
  agentName: string;
  reasoning: string;
}

const REVIEW_VOTE_LABEL: Partial<Record<VoteChoice, string>> = {
  APPROVE: "Approve",
  APPROVE_WITH_CHANGES: "Approve with Changes",
  REQUEST_REVISION: "Needs Revision",
  REJECT: "Reject",
};

const REVIEW_VOTE_COLOR: Partial<Record<VoteChoice, string>> = {
  APPROVE: "bg-emerald-500",
  APPROVE_WITH_CHANGES: "bg-teal-500",
  REQUEST_REVISION: "bg-orange-500",
  REJECT: "bg-rose-500",
};

const REVIEW_VOTE_ORDER: VoteChoice[] = ["APPROVE", "APPROVE_WITH_CHANGES", "REQUEST_REVISION", "REJECT"];

/** Real percentage bar per vote choice — the 4-outcome Review Board variant of the War Room's VotingBar, computed directly from DecisionVote rows. */
export function ReviewVotingBar({ votes }: { votes: ReviewVoteTally[] }) {
  const total = votes.length;
  if (total === 0) {
    return <p className="text-xs text-muted-foreground">No votes cast yet.</p>;
  }

  const counts = REVIEW_VOTE_ORDER.map((choice) => ({
    choice,
    count: votes.filter((v) => v.vote === choice).length,
  })).filter((c) => c.count > 0);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-muted">
        {counts.map(({ choice, count }) => (
          <div
            key={choice}
            className={REVIEW_VOTE_COLOR[choice]}
            style={{ width: `${(count / total) * 100}%` }}
            title={`${REVIEW_VOTE_LABEL[choice]}: ${Math.round((count / total) * 100)}%`}
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
        {counts.map(({ choice, count }) => (
          <span key={choice} className="flex items-center gap-1">
            <span className={`size-2 rounded-full ${REVIEW_VOTE_COLOR[choice]}`} />
            {REVIEW_VOTE_LABEL[choice]} {Math.round((count / total) * 100)}%
          </span>
        ))}
      </div>
      {votes.length > 0 && (
        <div className="flex flex-col gap-1.5 border-t border-border/60 pt-2">
          {votes.map((vote, i) => (
            <p key={i} className="text-xs text-muted-foreground">
              <span className="font-medium text-foreground">{vote.agentName}</span> voted{" "}
              <span className="font-medium text-foreground">{REVIEW_VOTE_LABEL[vote.vote] ?? vote.vote}</span>: {vote.reasoning}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
