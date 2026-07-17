"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Plus, UserPlus, Command, X, ListChecks, Calendar, Sparkles } from "lucide-react";

import { cn } from "@/lib/utils";
import { EASES } from "@/animations";
import { useT } from "@/components/providers/translation-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { createLead } from "@/app/dashboard/actions";
import { createTask } from "@/app/board/tasks/actions";
import { createMeeting } from "@/app/board/meetings/actions";
import { generateProposal } from "@/app/dashboard/proposal/actions";
import { startAIMeeting } from "./actions";

export const OPEN_COMMAND_PALETTE_EVENT = "growthos:open-command-palette";

export function openCommandPalette() {
  window.dispatchEvent(new Event(OPEN_COMMAND_PALETTE_EVENT));
}

export interface QuickActionsProps {
  agents: Array<{ id: string; name: string }>;
  users: Array<{ id: string; name: string | null }>;
  companies: Array<{ id: string; name: string }>;
  clients: Array<{ id: string; name: string }>;
}

type ActiveForm = "lead" | "task" | "meeting" | "ai-meeting" | "proposal" | null;

/** Floating action cluster: fast paths to the six things a user does most from anywhere in the Command Center. */
export function QuickActions({ agents, users, companies, clients }: QuickActionsProps) {
  const t = useT();
  const [expanded, setExpanded] = React.useState(false);
  const [activeForm, setActiveForm] = React.useState<ActiveForm>(null);

  function openForm(form: ActiveForm) {
    setActiveForm(form);
  }

  return (
    <div className="fixed bottom-16 right-4 z-30 flex flex-col items-end gap-3 sm:right-6">
      <AnimatePresence>
        {activeForm && (
          <QuickFormPanel
            form={activeForm}
            agents={agents}
            users={users}
            companies={companies}
            clients={clients}
            onClose={() => setActiveForm(null)}
            onDone={() => {
              setActiveForm(null);
              setExpanded(false);
            }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {expanded && !activeForm && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            transition={{ duration: 0.15 }}
            className="flex flex-col items-end gap-2"
          >
            <QuickActionButton icon={Sparkles} label={t("qa.generateProposal")} onClick={() => openForm("proposal")} />
            <QuickActionButton icon={Calendar} label={t("qa.startAiMeeting")} onClick={() => openForm("ai-meeting")} />
            <QuickActionButton icon={Calendar} label={t("qa.createMeeting")} onClick={() => openForm("meeting")} />
            <QuickActionButton icon={ListChecks} label={t("qa.createTask")} onClick={() => openForm("task")} />
            <QuickActionButton icon={UserPlus} label={t("qa.createLead")} onClick={() => openForm("lead")} />
            <QuickActionButton
              icon={Command}
              label={t("qa.askAi")}
              onClick={() => {
                openCommandPalette();
                setExpanded(false);
              }}
            />
          </motion.div>
        )}
      </AnimatePresence>

      <Button
        type="button"
        onClick={() => {
          setActiveForm(null);
          setExpanded((v) => !v);
        }}
        aria-label="Quick actions"
        className={cn(
          "size-12 shrink-0 rounded-full p-0 shadow-card transition-transform [&_svg]:size-5",
          expanded && "rotate-45",
        )}
      >
        <Plus />
      </Button>
    </div>
  );
}

function QuickActionButton({
  icon: Icon,
  label,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2.5 text-sm font-medium text-foreground shadow-card transition-colors hover:bg-accent"
    >
      <Icon className="size-4 text-primary" />
      {label}
    </button>
  );
}

function PanelShell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 12, scale: 0.96 }}
      transition={{ duration: 0.18, ease: EASES.outExpo }}
      className="w-80 rounded-2xl border border-border bg-card p-4 shadow-card"
    >
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm font-semibold text-foreground">{title}</p>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <X className="size-3.5" />
        </button>
      </div>
      {children}
    </motion.div>
  );
}

function QuickFormPanel({
  form,
  agents,
  users,
  companies,
  clients,
  onClose,
  onDone,
}: {
  form: Exclude<ActiveForm, null>;
  agents: QuickActionsProps["agents"];
  users: QuickActionsProps["users"];
  companies: QuickActionsProps["companies"];
  clients: QuickActionsProps["clients"];
  onClose: () => void;
  onDone: () => void;
}) {
  const router = useRouter();

  if (form === "lead") return <LeadForm clients={clients} onClose={onClose} onDone={onDone} router={router} />;
  if (form === "task") return <TaskForm agents={agents} users={users} onClose={onClose} onDone={onDone} />;
  if (form === "meeting") return <MeetingForm onClose={onClose} />;
  if (form === "ai-meeting") return <AiMeetingForm onClose={onClose} />;
  return <ProposalForm companies={companies} onClose={onClose} router={router} />;
}

function LeadForm({
  clients,
  onClose,
  onDone,
  router,
}: {
  clients: QuickActionsProps["clients"];
  onClose: () => void;
  onDone: () => void;
  router: ReturnType<typeof useRouter>;
}) {
  const [name, setName] = React.useState("");
  const [company, setCompany] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [estimatedValue, setEstimatedValue] = React.useState("");
  const [referredByClientId, setReferredByClientId] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState(false);
  const [pending, startTransition] = React.useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await createLead({
        name,
        company: company || undefined,
        email: email || undefined,
        estimatedValue: estimatedValue ? Number(estimatedValue) : undefined,
        referredByClientId: referredByClientId || undefined,
      });
      if (!result.ok) {
        setError(result.error ?? "Something went wrong.");
        return;
      }
      setSuccess(true);
      router.refresh();
      setTimeout(onDone, 1000);
    });
  }

  return (
    <PanelShell title="Quick: Create Lead" onClose={onClose}>
      {success ? (
        <p className="text-sm text-primary">Lead created.</p>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-2">
          <Input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} required />
          <Input placeholder="Company (optional)" value={company} onChange={(e) => setCompany(e.target.value)} />
          <Input type="email" placeholder="Email (optional)" value={email} onChange={(e) => setEmail(e.target.value)} />
          <Input
            type="number"
            min={0}
            step="0.01"
            placeholder="Estimated value (optional)"
            value={estimatedValue}
            onChange={(e) => setEstimatedValue(e.target.value)}
          />
          <Select value={referredByClientId} onChange={(e) => setReferredByClientId(e.target.value)}>
            <option value="">Not referred by a client</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                Referred by: {c.name}
              </option>
            ))}
          </Select>
          {error && <p className="text-xs text-destructive">{error}</p>}
          <Button type="submit" size="sm" disabled={pending || !name.trim()} className="mt-1">
            {pending ? "Creating…" : "Create lead"}
          </Button>
        </form>
      )}
    </PanelShell>
  );
}

function TaskForm({
  agents,
  users,
  onClose,
  onDone,
}: {
  agents: QuickActionsProps["agents"];
  users: QuickActionsProps["users"];
  onClose: () => void;
  onDone: () => void;
}) {
  const [title, setTitle] = React.useState("");
  const [assigneeKind, setAssigneeKind] = React.useState<"agent" | "user">("agent");
  const [assigneeId, setAssigneeId] = React.useState(agents[0]?.id ?? "");
  const [error, setError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState(false);
  const [pending, startTransition] = React.useTransition();

  const options = assigneeKind === "agent" ? agents.map((a) => ({ id: a.id, label: a.name })) : users.map((u) => ({ id: u.id, label: u.name ?? "Team member" }));

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!assigneeId) {
      setError("Choose someone to assign this task to.");
      return;
    }
    startTransition(async () => {
      const result = await createTask({
        title,
        assignedToAgentId: assigneeKind === "agent" ? assigneeId : undefined,
        assignedToUserId: assigneeKind === "user" ? assigneeId : undefined,
      });
      if (!result.ok) {
        setError(result.error ?? "Something went wrong.");
        return;
      }
      setSuccess(true);
      setTimeout(onDone, 1000);
    });
  }

  return (
    <PanelShell title="Quick: Create Task" onClose={onClose}>
      {success ? (
        <p className="text-sm text-primary">Task assigned.</p>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-2">
          <Input placeholder="Task title" value={title} onChange={(e) => setTitle(e.target.value)} required />
          <Select
            value={assigneeKind}
            onChange={(e) => {
              const kind = e.target.value as "agent" | "user";
              setAssigneeKind(kind);
              setAssigneeId(kind === "agent" ? agents[0]?.id ?? "" : users[0]?.id ?? "");
            }}
          >
            <option value="agent">Assign to AI agent</option>
            <option value="user">Assign to team member</option>
          </Select>
          <Select value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)}>
            {options.length === 0 && <option value="">None available</option>}
            {options.map((opt) => (
              <option key={opt.id} value={opt.id}>
                {opt.label}
              </option>
            ))}
          </Select>
          {error && <p className="text-xs text-destructive">{error}</p>}
          <Button type="submit" size="sm" disabled={pending || !title.trim() || !assigneeId} className="mt-1">
            {pending ? "Assigning…" : "Create task"}
          </Button>
        </form>
      )}
    </PanelShell>
  );
}

function MeetingForm({ onClose }: { onClose: () => void }) {
  const [title, setTitle] = React.useState("");
  const [agenda, setAgenda] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await createMeeting({ title, agenda });
      // createMeeting redirects on success and only returns on failure.
      if (result && !result.ok) setError(result.error ?? "Something went wrong.");
    });
  }

  return (
    <PanelShell title="Quick: Create Meeting" onClose={onClose}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-2">
        <Input placeholder="Meeting title" value={title} onChange={(e) => setTitle(e.target.value)} required />
        <textarea
          placeholder="Agenda"
          value={agenda}
          onChange={(e) => setAgenda(e.target.value)}
          rows={3}
          className="w-full resize-none rounded-lg border border-input bg-transparent px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          required
        />
        {error && <p className="text-xs text-destructive">{error}</p>}
        <Button type="submit" size="sm" disabled={pending || !title.trim() || !agenda.trim()} className="mt-1">
          {pending ? "Starting…" : "Start meeting"}
        </Button>
      </form>
    </PanelShell>
  );
}

function AiMeetingForm({ onClose }: { onClose: () => void }) {
  const [topic, setTopic] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await startAIMeeting(topic);
      // startAIMeeting redirects on success and only returns on failure.
      if (result && !result.ok) setError(result.error ?? "Something went wrong.");
    });
  }

  return (
    <PanelShell title="Quick: Start AI Meeting" onClose={onClose}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-2">
        <Input placeholder="What's this meeting about?" value={topic} onChange={(e) => setTopic(e.target.value)} required />
        <p className="text-xs text-muted-foreground">Your CEO agent will draft the agenda and start the meeting.</p>
        {error && <p className="text-xs text-destructive">{error}</p>}
        <Button type="submit" size="sm" disabled={pending || !topic.trim()} className="mt-1">
          {pending ? "Drafting agenda…" : "Start AI meeting"}
        </Button>
      </form>
    </PanelShell>
  );
}

function ProposalForm({
  companies,
  onClose,
  router,
}: {
  companies: QuickActionsProps["companies"];
  onClose: () => void;
  router: ReturnType<typeof useRouter>;
}) {
  const [title, setTitle] = React.useState("");
  const [companyId, setCompanyId] = React.useState("");
  const [brief, setBrief] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await generateProposal({ title, companyId, brief });
      if (!result.ok) {
        setError(result.error ?? "Something went wrong.");
        return;
      }
      if (result.proposalId) router.push(`/dashboard/proposal/proposals/${result.proposalId}`);
    });
  }

  return (
    <PanelShell title="Quick: Generate Proposal" onClose={onClose}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-2">
        <Input placeholder="Proposal title" value={title} onChange={(e) => setTitle(e.target.value)} required />
        <Select value={companyId} onChange={(e) => setCompanyId(e.target.value)}>
          <option value="">No company</option>
          {companies.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
        <textarea
          placeholder="Brief: scope, budget, goal..."
          value={brief}
          onChange={(e) => setBrief(e.target.value)}
          rows={3}
          className="w-full resize-none rounded-lg border border-input bg-transparent px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          required
        />
        {error && <p className="text-xs text-destructive">{error}</p>}
        <Button type="submit" size="sm" disabled={pending || !title.trim() || brief.trim().length < 10} className="mt-1">
          {pending ? "Drafting…" : "Generate proposal"}
        </Button>
      </form>
    </PanelShell>
  );
}
