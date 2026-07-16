"use client";

import { useState } from "react";

import { ProjectTaskBoard } from "../../../_components/task-board";
import { TaskDetailDialog } from "../../../_components/task-detail-dialog";
import type { ProjectBoardTask } from "../../../_components/task-card";

export function KanbanClient({
  tasks,
  members,
  milestones,
  sprints,
  canManage,
}: {
  tasks: ProjectBoardTask[];
  members: Array<{ userId: string; name: string | null }>;
  milestones: Array<{ id: string; name: string }>;
  sprints: Array<{ id: string; name: string }>;
  canManage: boolean;
}) {
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);
  const openTask = tasks.find((t) => t.id === openTaskId) ?? null;

  return (
    <>
      <ProjectTaskBoard tasks={tasks} onOpenTask={setOpenTaskId} />
      {openTask && (
        <TaskDetailDialog
          task={openTask}
          members={members}
          milestones={milestones}
          sprints={sprints}
          canManage={canManage}
          onClose={() => setOpenTaskId(null)}
        />
      )}
    </>
  );
}
