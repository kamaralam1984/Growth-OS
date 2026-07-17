import { prisma } from "@/lib/prisma";
import { notifyOrganizationOwners } from "@/lib/notifications";
import type { LeaveRequest, LeaveType, LeaveRequestStatus } from "@/generated/prisma/client";

export interface RequestLeaveInput {
  organizationId: string;
  userId: string;
  type: LeaveType;
  startDate: Date;
  endDate: Date;
  reason?: string;
}

export async function requestLeave(input: RequestLeaveInput): Promise<LeaveRequest> {
  if (input.endDate < input.startDate) throw new Error("End date can't be before the start date.");

  const request = await prisma.leaveRequest.create({
    data: {
      organizationId: input.organizationId,
      userId: input.userId,
      type: input.type,
      startDate: input.startDate,
      endDate: input.endDate,
      reason: input.reason ?? null,
    },
  });

  await notifyOrganizationOwners({
    organizationId: input.organizationId,
    type: "APPROVAL_REQUESTED",
    title: "New leave request",
    message: `A team member requested ${input.type.toLowerCase()} leave from ${input.startDate.toDateString()} to ${input.endDate.toDateString()}.`,
  });

  return request;
}

export async function decideLeaveRequest(leaveRequestId: string, organizationId: string, status: LeaveRequestStatus, approvedByUserId: string): Promise<LeaveRequest> {
  const request = await prisma.leaveRequest.findUnique({ where: { id: leaveRequestId } });
  if (!request || request.organizationId !== organizationId) throw new Error("Leave request not found.");
  if (request.status !== "PENDING") throw new Error("This leave request has already been decided.");

  return prisma.leaveRequest.update({
    where: { id: leaveRequestId },
    data: { status, approvedByUserId },
  });
}

export async function listLeaveRequests(organizationId: string, status?: LeaveRequestStatus): Promise<LeaveRequest[]> {
  return prisma.leaveRequest.findMany({
    where: { organizationId, ...(status ? { status } : {}) },
    orderBy: { createdAt: "desc" },
  });
}
