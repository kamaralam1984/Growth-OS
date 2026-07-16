"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { FormField } from "@/components/ui/form-field";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createProject } from "../actions";
import type { ProjectTypeInput } from "@/lib/validations/project";

export interface ProjectFormProps {
  companies: Array<{ id: string; name: string }>;
  clients: Array<{ id: string; name: string }>;
}

const PROJECT_TYPES: Array<{ value: ProjectTypeInput; label: string }> = [
  { value: "SUPPORT", label: "Support" },
  { value: "SOFTWARE_DEVELOPMENT", label: "Software Development" },
  { value: "ERP", label: "ERP" },
  { value: "CRM", label: "CRM" },
  { value: "SAAS", label: "SaaS" },
  { value: "MOBILE_APP", label: "Mobile App" },
  { value: "AI_AUTOMATION", label: "AI Automation" },
  { value: "WEBSITE", label: "Website" },
  { value: "CLOUD_MIGRATION", label: "Cloud Migration" },
  { value: "CONSULTING", label: "Consulting" },
  { value: "MAINTENANCE", label: "Maintenance" },
  { value: "AMC", label: "AMC" },
];

export function ProjectForm({ companies, clients }: ProjectFormProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [companyId, setCompanyId] = useState("");
  const [clientId, setClientId] = useState("");
  const [projectType, setProjectType] = useState<ProjectTypeInput | "">("");
  const [priority, setPriority] = useState<"LOW" | "NORMAL" | "HIGH" | "URGENT">("NORMAL");
  const [budget, setBudget] = useState("");
  const [department, setDepartment] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [tagsText, setTagsText] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await createProject({
        name,
        description,
        companyId,
        clientId,
        status: "PLANNING",
        projectType: projectType || undefined,
        priority,
        budget: budget ? Number(budget) : undefined,
        department,
        tags: tagsText
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
        dueDate: dueDate ? new Date(dueDate) : undefined,
      });
      if (!result.ok) {
        setError(result.error ?? "Something went wrong.");
        return;
      }
      if (result.projectId) router.push(`/dashboard/projects/${result.projectId}`);
    });
  }

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)}>
        <Plus className="size-4" />
        New project
      </Button>
    );
  }

  return (
    <Card glass className="w-full">
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>New project</CardTitle>
        <Button variant="ghost" size="sm" onClick={() => setOpen(false)} aria-label="Close">
          <X className="size-4" />
        </Button>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField label="Project name" htmlFor="project-name" required className="sm:col-span-2">
            <Input id="project-name" value={name} onChange={(e) => setName(e.target.value)} required />
          </FormField>
          <FormField label="Company" htmlFor="project-company">
            <Select id="project-company" value={companyId} onChange={(e) => setCompanyId(e.target.value)}>
              <option value="">No company</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Client" htmlFor="project-client">
            <Select id="project-client" value={clientId} onChange={(e) => setClientId(e.target.value)}>
              <option value="">No client</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Project type" htmlFor="project-type">
            <Select id="project-type" value={projectType} onChange={(e) => setProjectType(e.target.value as ProjectTypeInput | "")}>
              <option value="">Not specified</option>
              {PROJECT_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Priority" htmlFor="project-priority">
            <Select id="project-priority" value={priority} onChange={(e) => setPriority(e.target.value as typeof priority)}>
              <option value="LOW">Low</option>
              <option value="NORMAL">Normal</option>
              <option value="HIGH">High</option>
              <option value="URGENT">Urgent</option>
            </Select>
          </FormField>
          <FormField label="Budget" htmlFor="project-budget">
            <Input id="project-budget" type="number" min="0" step="0.01" value={budget} onChange={(e) => setBudget(e.target.value)} placeholder="Optional" />
          </FormField>
          <FormField label="Department" htmlFor="project-department">
            <Input id="project-department" value={department} onChange={(e) => setDepartment(e.target.value)} placeholder="e.g. Engineering" />
          </FormField>
          <FormField label="Due date" htmlFor="project-due">
            <Input id="project-due" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </FormField>
          <FormField label="Tags" htmlFor="project-tags" className="sm:col-span-2">
            <Input id="project-tags" value={tagsText} onChange={(e) => setTagsText(e.target.value)} placeholder="Comma-separated, e.g. priority-client, phase-1" />
          </FormField>
          <FormField label="Description" htmlFor="project-description" className="sm:col-span-2">
            <textarea
              id="project-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full rounded-lg border border-input bg-transparent px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </FormField>

          {error && <p className="text-sm text-destructive sm:col-span-2">{error}</p>}

          <div className="flex gap-3 sm:col-span-2">
            <Button type="submit" disabled={pending}>
              {pending ? "Creating…" : "Create project"}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
