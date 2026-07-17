"use client";

import * as React from "react";
import { useState, useTransition } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Bell,
  Calendar,
  CheckCheck,
  CheckCircle2,
  ClipboardList,
  Lightbulb,
  AlertTriangle,
  Gavel,
  ClipboardCheck,
  Mail,
  Users,
  Workflow,
  Info,
  FileText,
  ThumbsUp,
  ThumbsDown,
  FileSignature,
  DollarSign,
  ShieldCheck,
  FolderPlus,
  Flag,
  ShieldAlert,
  Clock,
  MessageSquare,
  Sparkles,
} from "lucide-react";

import { cn, formatRelativeTime } from "@/lib/utils";
import { EASES } from "@/animations";
import { useT } from "@/components/providers/translation-provider";
import type { TranslationKey } from "@/lib/i18n";
import type { NotificationType } from "@/generated/prisma/client";
import { markNotificationRead, markAllNotificationsRead } from "../actions-notifications";

export interface BoardNotification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  read: boolean;
  createdAt: Date;
}

const NOTIFICATION_ICONS: Record<NotificationType, React.ComponentType<{ className?: string }>> = {
  MEETING_STARTED: Calendar,
  MEETING_ENDED: Calendar,
  TASK_ASSIGNED: ClipboardList,
  TASK_COMPLETED: CheckCircle2,
  DECISION_MADE: Gavel,
  NEW_RECOMMENDATION: Lightbulb,
  CRITICAL_ALERT: AlertTriangle,
  APPROVAL_REQUESTED: ClipboardCheck,
  EMAIL_READY: Mail,
  CRM_EVENT: Users,
  AUTOMATION_EVENT: Workflow,
  SYSTEM_NOTICE: Info,
  PROPOSAL_SENT: FileText,
  PROPOSAL_ACCEPTED: ThumbsUp,
  PROPOSAL_REJECTED: ThumbsDown,
  CONTRACT_SIGNED: FileSignature,
  INVOICE_PAID: DollarSign,
  BOARD_REVIEW_STARTED: ShieldCheck,
  BOARD_REVIEW_COMPLETED: ShieldCheck,
  PROJECT_CREATED: FolderPlus,
  MILESTONE_COMPLETED: Flag,
  RISK_DETECTED: ShieldAlert,
  DEADLINE_APPROACHING: Clock,
  CLIENT_COMMENT_ADDED: MessageSquare,
  CLIENT_APPROVED_MILESTONE: ThumbsUp,
  DELIVERY_HEALTH_DROPPED: AlertTriangle,
  COMPANY_DNA_READY: Sparkles,
  DAILY_BRIEF_READY: Sparkles,
};

/** Category grouping for the notification-center tab bar. */
const CATEGORIES: Array<{ key: string; labelKey: TranslationKey; types: NotificationType[] }> = [
  { key: "all", labelKey: "notif.category.all", types: [] },
  { key: "critical", labelKey: "notif.category.critical", types: ["CRITICAL_ALERT", "DELIVERY_HEALTH_DROPPED"] },
  { key: "meetings", labelKey: "notif.category.meetings", types: ["MEETING_STARTED", "MEETING_ENDED", "BOARD_REVIEW_STARTED", "BOARD_REVIEW_COMPLETED"] },
  { key: "decisions", labelKey: "notif.category.decisions", types: ["DECISION_MADE", "NEW_RECOMMENDATION"] },
  { key: "approvals", labelKey: "notif.category.approvals", types: ["APPROVAL_REQUESTED"] },
  { key: "emails", labelKey: "notif.category.emails", types: ["EMAIL_READY"] },
  { key: "crm", labelKey: "notif.category.crm", types: ["CRM_EVENT"] },
  { key: "automation", labelKey: "notif.category.automation", types: ["AUTOMATION_EVENT"] },
  { key: "system", labelKey: "notif.category.system", types: ["SYSTEM_NOTICE", "TASK_ASSIGNED", "TASK_COMPLETED"] },
];

export function NotificationBell({
  initialNotifications,
  initialUnreadCount,
}: {
  initialNotifications: BoardNotification[];
  initialUnreadCount: number;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState(initialNotifications);
  const [unreadCount, setUnreadCount] = useState(initialUnreadCount);
  const [category, setCategory] = useState("all");
  const [, startTransition] = useTransition();

  const activeCategory = CATEGORIES.find((c) => c.key === category) ?? CATEGORIES[0];
  const visibleNotifications =
    activeCategory.types.length === 0
      ? notifications
      : notifications.filter((n) => activeCategory.types.includes(n.type));

  function handleOpenNotification(notification: BoardNotification) {
    if (notification.read) return;
    setNotifications((prev) => prev.map((n) => (n.id === notification.id ? { ...n, read: true } : n)));
    setUnreadCount((prev) => Math.max(0, prev - 1));
    startTransition(async () => {
      await markNotificationRead(notification.id);
    });
  }

  function handleMarkAllRead() {
    if (unreadCount === 0) return;
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    setUnreadCount(0);
    startTransition(async () => {
      await markAllNotificationsRead();
    });
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-label={unreadCount > 0 ? `${unreadCount} unread notifications` : t("notif.title")}
        aria-expanded={open}
        className="relative flex size-9 items-center justify-center rounded-lg border border-border bg-transparent text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Bell className="size-4.5" />
        {unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold leading-none text-primary-foreground">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <>
            <button
              type="button"
              aria-label="Close notifications"
              className="fixed inset-0 z-40 cursor-default"
              onClick={() => setOpen(false)}
              tabIndex={-1}
            />
            <motion.div
              initial={{ opacity: 0, y: -8, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.98 }}
              transition={{ duration: 0.18, ease: EASES.outExpo }}
              className="absolute right-0 z-50 mt-2 w-[22rem] max-w-[90vw] overflow-hidden rounded-2xl border border-border bg-card shadow-card"
            >
              <div className="flex items-center justify-between gap-3 border-b border-border p-4">
                <p className="text-sm font-semibold text-foreground">{t("notif.title")}</p>
                <button
                  type="button"
                  onClick={handleMarkAllRead}
                  disabled={unreadCount === 0}
                  className="inline-flex items-center gap-1 text-xs font-medium text-primary transition-opacity hover:underline disabled:opacity-40 disabled:hover:no-underline"
                >
                  <CheckCheck className="size-3.5" />
                  {t("notif.markAllRead")}
                </button>
              </div>

              <div className="flex gap-1.5 overflow-x-auto border-b border-border px-3 py-2">
                {CATEGORIES.map((c) => (
                  <button
                    key={c.key}
                    type="button"
                    onClick={() => setCategory(c.key)}
                    className={cn(
                      "shrink-0 rounded-full px-2.5 py-1 text-xs font-medium transition-colors",
                      category === c.key
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted/50 text-muted-foreground hover:bg-accent hover:text-foreground",
                    )}
                  >
                    {t(c.labelKey)}
                  </button>
                ))}
              </div>

              <div className="max-h-96 overflow-y-auto">
                {visibleNotifications.length === 0 ? (
                  <p className="p-6 text-center text-sm text-muted-foreground">
                    {notifications.length === 0 ? t("notif.empty") : t("notif.emptyCategory")}
                  </p>
                ) : (
                  <ul className="flex flex-col divide-y divide-border">
                    {visibleNotifications.map((notification) => {
                      const Icon = NOTIFICATION_ICONS[notification.type];
                      return (
                        <li key={notification.id}>
                          <button
                            type="button"
                            onClick={() => handleOpenNotification(notification)}
                            className={cn(
                              "flex w-full items-start gap-3 p-4 text-left transition-colors hover:bg-accent/40",
                              !notification.read && "bg-primary/5",
                            )}
                          >
                            <span
                              className={cn(
                                "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg",
                                notification.read ? "bg-muted text-muted-foreground" : "bg-primary/10 text-primary",
                              )}
                            >
                              <Icon className="size-4" />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="flex items-center gap-2">
                                <span
                                  className={cn(
                                    "truncate text-sm",
                                    notification.read ? "font-medium text-foreground" : "font-semibold text-foreground",
                                  )}
                                >
                                  {notification.title}
                                </span>
                                {!notification.read && <span className="size-1.5 shrink-0 rounded-full bg-primary" />}
                              </span>
                              <span className="mt-0.5 line-clamp-2 block text-xs text-muted-foreground">
                                {notification.message}
                              </span>
                              <span className="mt-1 block text-[11px] text-muted-foreground">
                                {formatRelativeTime(notification.createdAt)}
                              </span>
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
