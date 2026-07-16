"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";

import { Select } from "@/components/ui/select";
import { updateProjectStatus } from "../actions";
import type { ProjectStatusInput } from "@/lib/validations/project";

export function ProjectStatusSelect({ projectId, status }: { projectId: string; status: ProjectStatusInput }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <Select
      value={status}
      disabled={pending}
      onChange={(e) => {
        const next = e.target.value as ProjectStatusInput;
        startTransition(async () => {
          await updateProjectStatus(projectId, next);
          router.refresh();
        });
      }}
      className="h-9 w-40 text-xs"
    >
      <option value="PLANNING">Planning</option>
      <option value="ACTIVE">Active</option>
      <option value="ON_HOLD">On hold</option>
      <option value="COMPLETED">Completed</option>
      <option value="CANCELLED">Cancelled</option>
    </Select>
  );
}
