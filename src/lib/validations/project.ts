import { z } from "zod";

export const projectStatusSchema = z.enum(["PLANNING", "ACTIVE", "ON_HOLD", "COMPLETED", "CANCELLED"]);
export type ProjectStatusInput = z.infer<typeof projectStatusSchema>;

export const projectTypeSchema = z.enum([
  "SUPPORT",
  "SOFTWARE_DEVELOPMENT",
  "ERP",
  "CRM",
  "SAAS",
  "MOBILE_APP",
  "AI_AUTOMATION",
  "WEBSITE",
  "CLOUD_MIGRATION",
  "CONSULTING",
  "MAINTENANCE",
  "AMC",
]);
export type ProjectTypeInput = z.infer<typeof projectTypeSchema>;

export const projectPrioritySchema = z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]);

export const projectSchema = z.object({
  name: z.string().trim().min(1, "Give the project a name."),
  description: z.string().trim().max(4000).optional().or(z.literal("")),
  companyId: z.string().trim().optional().or(z.literal("")),
  clientId: z.string().trim().optional().or(z.literal("")),
  status: projectStatusSchema.default("PLANNING"),
  projectType: projectTypeSchema.optional(),
  priority: projectPrioritySchema.default("NORMAL"),
  budget: z.coerce.number().nonnegative().optional(),
  tags: z.array(z.string().trim().min(1)).max(20).default([]),
  department: z.string().trim().max(120).optional().or(z.literal("")),
  startDate: z.coerce.date().optional(),
  dueDate: z.coerce.date().optional(),
});

// z.input (not z.infer/z.output): status/priority/tags all have defaults,
// so they must stay optional for callers constructing this object — the
// schema itself fills the default during safeParse inside the action (same
// convention as CreateTaskInput/CreateDecisionInput elsewhere in this app).
export type ProjectInput = z.input<typeof projectSchema>;

export const projectDetailsSchema = projectSchema.omit({ status: true });
export type ProjectDetailsInput = z.input<typeof projectDetailsSchema>;

export const projectRoleSchema = z.enum(["PROJECT_MANAGER", "DEVELOPER", "DESIGNER", "QA", "DEVOPS", "CONSULTANT", "STAKEHOLDER"]);
export type ProjectRoleInput = z.infer<typeof projectRoleSchema>;

export const addProjectMemberSchema = z.object({
  userId: z.string().trim().min(1, "Choose a team member."),
  role: projectRoleSchema,
  hourlyRate: z.coerce.number().nonnegative().optional(),
  capacityHoursPerWeek: z.coerce.number().nonnegative().optional(),
});
export type AddProjectMemberInput = z.infer<typeof addProjectMemberSchema>;

// ===== Project Kanban task =====
// Deliberately NOT the War Room's createTaskSchema (src/lib/validations/board.ts)
// — that one is agent/human-assignee-shaped for the AI task inbox, this one
// is project-delivery-shaped (sprint/milestone/hours/client visibility).
export const taskStatusSchema = z.enum([
  "BACKLOG",
  "PENDING",
  "RUNNING",
  "REVIEW",
  "TESTING",
  "READY_FOR_CLIENT",
  "COMPLETED",
  "ARCHIVED",
  "BLOCKED",
  "CANCELLED",
]);
export type TaskStatusInput = z.infer<typeof taskStatusSchema>;

export const createProjectTaskSchema = z.object({
  title: z.string().trim().min(1, "Give the task a title."),
  description: z.string().trim().max(4000).optional().or(z.literal("")),
  assignedToUserId: z.string().trim().optional().or(z.literal("")),
  priority: z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]).default("NORMAL"),
  status: taskStatusSchema.default("BACKLOG"),
  type: z.enum(["CALL", "EMAIL", "MEETING", "PROPOSAL", "RESEARCH", "FOLLOW_UP", "DOCUMENTATION", "APPROVAL", "DEVELOPMENT", "SUPPORT"]).optional(),
  milestoneId: z.string().trim().optional().or(z.literal("")),
  sprintId: z.string().trim().optional().or(z.literal("")),
  startDate: z.coerce.date().optional(),
  dueDate: z.coerce.date().optional(),
  estimatedHours: z.coerce.number().nonnegative().optional(),
  labels: z.array(z.string().trim().min(1)).max(20).default([]),
  visibleToClient: z.boolean().default(false),
});
export type CreateProjectTaskInput = z.input<typeof createProjectTaskSchema>;

// ===== Project files (versioned) =====
// projectFileId is present when uploading a NEW VERSION of an existing
// ProjectFile — its absence means "create a brand new ProjectFile with a
// first version". folder only applies to brand-new files (a version never
// moves the file to a different folder).
export const uploadProjectFileSchema = z.object({
  projectFileId: z.string().trim().optional().or(z.literal("")),
  folder: z.string().trim().max(120).optional().or(z.literal("")),
  visibleToClient: z.boolean().default(false),
  changeNote: z.string().trim().max(2000).optional().or(z.literal("")),
});
export type UploadProjectFileInput = z.input<typeof uploadProjectFileSchema>;
