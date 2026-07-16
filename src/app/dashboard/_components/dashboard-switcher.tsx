"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { LayoutDashboard, Check, ChevronsUpDown, Plus, Trash2, BookmarkPlus } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";

import { cn } from "@/lib/utils";
import { EASES } from "@/animations";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  setActiveDashboardAction,
  createDashboardAction,
  deleteDashboardAction,
  saveCurrentLayoutAsTemplateAction,
  deleteDashboardTemplateAction,
} from "@/components/command-center/dashboard-actions";
import { DASHBOARD_TEMPLATES } from "@/lib/dashboard-templates";

export interface SwitchableDashboard {
  id: string;
  name: string;
  isDefault: boolean;
}

export interface SwitchableTemplate {
  id: string;
  name: string;
}

const CUSTOM_TEMPLATE_PREFIX = "custom:";

export function DashboardSwitcher({
  dashboards,
  activeDashboardId,
  templates,
}: {
  dashboards: SwitchableDashboard[];
  activeDashboardId: string;
  templates: SwitchableTemplate[];
}) {
  const [open, setOpen] = React.useState(false);
  const [creating, setCreating] = React.useState(false);
  const [name, setName] = React.useState("");
  const [template, setTemplate] = React.useState("blank");
  const [saveOpen, setSaveOpen] = React.useState(false);
  const [saveName, setSaveName] = React.useState("");
  const [pending, startTransition] = React.useTransition();
  const router = useRouter();

  const active = dashboards.find((d) => d.id === activeDashboardId) ?? dashboards[0];

  function handleSelect(dashboardId: string) {
    setOpen(false);
    if (dashboardId === activeDashboardId) return;
    startTransition(async () => {
      const result = await setActiveDashboardAction(dashboardId);
      if (result.ok) router.refresh();
    });
  }

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const isCustom = template.startsWith(CUSTOM_TEMPLATE_PREFIX);
    const templateKey = isCustom ? undefined : template;
    const customTemplateId = isCustom ? template.slice(CUSTOM_TEMPLATE_PREFIX.length) : undefined;
    startTransition(async () => {
      const result = await createDashboardAction(name, templateKey, customTemplateId);
      if (result.ok && result.dashboardId) {
        await setActiveDashboardAction(result.dashboardId);
        setName("");
        setCreating(false);
        setOpen(false);
        router.refresh();
      }
    });
  }

  function handleDelete(dashboardId: string, e: React.MouseEvent) {
    e.stopPropagation();
    if (dashboards.length <= 1) return;
    if (!confirm("Delete this dashboard?")) return;
    startTransition(async () => {
      await deleteDashboardAction(dashboardId);
      router.refresh();
    });
  }

  function handleDeleteTemplate(templateId: string, e: React.MouseEvent) {
    e.stopPropagation();
    if (!confirm("Delete this saved template?")) return;
    startTransition(async () => {
      await deleteDashboardTemplateAction(templateId);
      router.refresh();
    });
  }

  function handleSaveTemplate(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const result = await saveCurrentLayoutAsTemplateAction(activeDashboardId, saveName);
      if (result.ok) {
        setSaveName("");
        setSaveOpen(false);
        router.refresh();
      }
    });
  }

  return (
    <div className="flex items-center gap-1.5">
      <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save current layout as template</DialogTitle>
            <DialogDescription>
              Saves &ldquo;{active?.name ?? "this dashboard"}&rdquo;&rsquo;s widget layout as a reusable template
              anyone in your org can start a new dashboard from.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSaveTemplate} className="flex flex-col gap-4">
            <Input
              autoFocus
              placeholder="Template name"
              value={saveName}
              onChange={(e) => setSaveName(e.target.value)}
            />
            <DialogFooter>
              <Button type="submit" disabled={pending || !saveName.trim()}>
                Save template
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <button
        type="button"
        onClick={() => setSaveOpen(true)}
        disabled={pending}
        title="Save current layout as template"
        className="flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-60"
      >
        <BookmarkPlus className="size-4" />
      </button>

      <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={pending}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex min-w-0 items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-accent disabled:opacity-60"
      >
        <LayoutDashboard className="size-4 shrink-0 text-primary" />
        <span className="max-w-40 truncate">{active?.name ?? "Dashboard"}</span>
        <ChevronsUpDown className="size-3.5 shrink-0 text-muted-foreground" />
      </button>

      <AnimatePresence>
        {open && (
          <>
            <button
              type="button"
              aria-label="Close dashboard switcher"
              className="fixed inset-0 z-40 cursor-default"
              onClick={() => setOpen(false)}
              tabIndex={-1}
            />
            <motion.div
              initial={{ opacity: 0, y: -6, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -6, scale: 0.98 }}
              transition={{ duration: 0.15, ease: EASES.outExpo }}
              className="absolute left-0 z-50 mt-1 w-72 overflow-hidden rounded-2xl border border-border bg-card p-1.5 shadow-card"
            >
              {dashboards.map((dashboard) => (
                <button
                  key={dashboard.id}
                  type="button"
                  onClick={() => handleSelect(dashboard.id)}
                  className={cn(
                    "flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-accent",
                    dashboard.id === activeDashboardId ? "font-semibold text-foreground" : "text-muted-foreground",
                  )}
                >
                  <span className="flex items-center gap-2 truncate">
                    {dashboard.id === activeDashboardId && <Check className="size-4 shrink-0 text-primary" />}
                    {dashboard.name}
                  </span>
                  {!dashboard.isDefault && dashboards.length > 1 && (
                    <span
                      role="button"
                      tabIndex={0}
                      onClick={(e) => handleDelete(dashboard.id, e)}
                      className="rounded-md p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    >
                      <Trash2 className="size-3.5" />
                    </span>
                  )}
                </button>
              ))}

              <div className="mt-1 border-t border-border pt-1.5">
                {!creating ? (
                  <button
                    type="button"
                    onClick={() => setCreating(true)}
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-primary transition-colors hover:bg-accent"
                  >
                    <Plus className="size-4" /> New dashboard
                  </button>
                ) : (
                  <form onSubmit={handleCreate} className="flex flex-col gap-2 p-2">
                    <Input
                      autoFocus
                      placeholder="Dashboard name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="h-9 text-sm"
                    />
                    <Select value={template} onChange={(e) => setTemplate(e.target.value)} className="h-9 text-sm">
                      <optgroup label="Built-in">
                        {Object.entries(DASHBOARD_TEMPLATES).map(([key, t]) => (
                          <option key={key} value={key}>
                            {t.label}
                          </option>
                        ))}
                      </optgroup>
                      {templates.length > 0 && (
                        <optgroup label="Your templates">
                          {templates.map((t) => (
                            <option key={t.id} value={`${CUSTOM_TEMPLATE_PREFIX}${t.id}`}>
                              {t.name}
                            </option>
                          ))}
                        </optgroup>
                      )}
                    </Select>
                    <Button type="submit" size="sm" disabled={pending || !name.trim()}>
                      Create
                    </Button>
                  </form>
                )}
              </div>

              {templates.length > 0 && (
                <div className="mt-1 border-t border-border pt-1.5">
                  <p className="px-3 pb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    Saved templates
                  </p>
                  {templates.map((t) => (
                    <div
                      key={t.id}
                      className="flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground"
                    >
                      <span className="truncate">{t.name}</span>
                      <span
                        role="button"
                        tabIndex={0}
                        onClick={(e) => handleDeleteTemplate(t.id, e)}
                        className="rounded-md p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                      >
                        <Trash2 className="size-3.5" />
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
    </div>
  );
}
