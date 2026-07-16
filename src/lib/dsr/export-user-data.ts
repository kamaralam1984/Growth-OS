import { prisma } from "@/lib/prisma";

/**
 * Data Subject Request (DSR) self-service export — GDPR Art. 15/20 ("right
 * of access" / "right to data portability") and the CCPA/DPDP-India
 * equivalents. Returns a real, live snapshot of every record this app can
 * attribute to `userId`, scoped ONLY to rows that carry that exact user's own
 * id (never another user's data, even within the same organization).
 *
 * HONEST SCOPE NOTE: this covers the User's own profile plus every category
 * of directly-owned/authored/participated-in record queried below (CRM
 * ownership, tasks, meetings, notifications, activity/audit/security logs,
 * documents, comments, time entries, reminders, bookmarks, search history,
 * and commercial documents this user created). It does NOT walk every one of
 * this schema's 100+ models — categories not listed here are not currently
 * exported. Extend the Promise.all below if a new category needs to be
 * covered. Secrets are never included: password hashes, 2FA secrets, API key
 * hashes, and OAuth tokens are deliberately excluded even though the rows
 * that hold them belong to this user.
 */
export async function collectUserDataExport(userId: string) {
  const [
    user,
    memberships,
    ownedDeals,
    ownedContacts,
    ownedCompanies,
    tasksAssignedToMe,
    tasksAssignedByMe,
    createdMeetings,
    meetingParticipation,
    notifications,
    activities,
    securityEvents,
    auditLogs,
    deviceSessions,
    apiKeys,
    documentsUploaded,
    comments,
    timeEntries,
    reminders,
    bookmarks,
    searchHistory,
    createdQuotations,
    createdContracts,
    createdInvoices,
  ] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        firstName: true,
        lastName: true,
        email: true,
        emailVerified: true,
        image: true,
        phone: true,
        country: true,
        language: true,
        timezone: true,
        jobTitle: true,
        twoFactorEnabled: true,
        onboardingCompletedAt: true,
        isPlatformOwner: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
    prisma.membership.findMany({
      where: { userId },
      select: {
        id: true,
        role: true,
        status: true,
        invitedAt: true,
        joinedAt: true,
        createdAt: true,
        organization: { select: { id: true, name: true } },
      },
    }),
    prisma.deal.findMany({ where: { ownerUserId: userId } }),
    prisma.contact.findMany({ where: { ownerUserId: userId } }),
    prisma.company.findMany({ where: { ownerUserId: userId } }),
    prisma.task.findMany({ where: { assignedToUserId: userId } }),
    prisma.task.findMany({ where: { assignedByUserId: userId } }),
    prisma.meeting.findMany({ where: { createdById: userId } }),
    prisma.meetingParticipant.findMany({ where: { userId }, select: { id: true, meetingId: true, joinedAt: true } }),
    prisma.notification.findMany({ where: { userId } }),
    prisma.activity.findMany({ where: { actorUserId: userId } }),
    prisma.securityEvent.findMany({ where: { userId } }),
    prisma.auditLog.findMany({ where: { userId } }),
    prisma.deviceSession.findMany({ where: { userId } }),
    prisma.apiKey.findMany({
      where: { userId },
      select: {
        id: true,
        name: true,
        prefix: true,
        scopes: true,
        rateLimitPerHour: true,
        lastUsedAt: true,
        revokedAt: true,
        createdAt: true,
      },
    }),
    prisma.document.findMany({
      where: { uploadedByUserId: userId },
      select: { id: true, name: true, mimeType: true, sizeBytes: true, folder: true, createdAt: true },
    }),
    prisma.comment.findMany({ where: { authorUserId: userId } }),
    prisma.timeEntry.findMany({ where: { userId } }),
    prisma.reminder.findMany({ where: { userId } }),
    prisma.bookmark.findMany({ where: { userId } }),
    prisma.searchHistory.findMany({ where: { userId } }),
    prisma.quotation.findMany({ where: { createdByUserId: userId } }),
    prisma.contract.findMany({ where: { createdByUserId: userId } }),
    prisma.invoice.findMany({ where: { createdByUserId: userId } }),
  ]);

  return {
    exportedAt: new Date().toISOString(),
    disclaimer:
      "Self-service GDPR/CCPA/DPDP-India data export. Covers this account's own profile plus every record category listed as a top-level key below, scoped strictly to rows owned/authored/participated-in by this user id. Secrets (password hash, 2FA secret, API key hashes, OAuth tokens) are never included.",
    profile: user,
    memberships,
    crm: { ownedDeals, ownedContacts, ownedCompanies },
    tasks: { assignedToMe: tasksAssignedToMe, assignedByMe: tasksAssignedByMe },
    meetings: { created: createdMeetings, participatedIn: meetingParticipation },
    notifications,
    activities,
    securityEvents,
    auditLogs,
    deviceSessions,
    apiKeys,
    documentsUploaded,
    comments,
    timeEntries,
    reminders,
    bookmarks,
    searchHistory,
    commercialDocumentsCreated: { quotations: createdQuotations, contracts: createdContracts, invoices: createdInvoices },
  };
}
