"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Responsive, WidthProvider, type Layout } from "react-grid-layout/legacy";
import {
  DollarSign,
  Wallet,
  ListChecks,
  Calendar,
  StickyNote,
  Bot,
  FileBarChart,
  CloudSun,
  Clock as ClockIcon,
  Plus,
  X,
  GripVertical,
  Pencil,
  Check,
} from "lucide-react";
import "react-grid-layout/css/styles.css";

import { cn, formatRelativeTime } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { Widget, WidgetType } from "@/generated/prisma/client";
import type { WidgetPosition } from "@/lib/dashboard";
// Deliberately NOT importing from "@/app/dashboard/_lib/widget-data" here even
// though it exports an identical WIDGET_TITLES map: that module also imports
// "@/lib/prisma" (server-only), and this is a "use client" component — pulling
// it in breaks the client bundle the same way described in
// src/lib/nav-commands.ts's top comment. Only the (type-erased, so bundle-safe)
// WidgetDataBundle type is imported from there; the small title map below is a
// deliberate, documented duplicate.
import type { WidgetDataBundle } from "@/app/dashboard/_lib/widget-data";

import {
  addWidgetAction,
  removeWidgetAction,
  updateWidgetPositionsAction,
  updateWidgetNotesAction,
  updateWidgetConfigAction,
} from "./dashboard-actions";

const ResponsiveGridLayout = WidthProvider(Responsive);

const WIDGET_ICONS: Record<WidgetType, React.ComponentType<{ className?: string }>> = {
  REVENUE: DollarSign,
  PIPELINE: Wallet,
  TASKS: ListChecks,
  CALENDAR: Calendar,
  NOTES: StickyNote,
  AI_ACTIVITY: Bot,
  REPORTS: FileBarChart,
  WEATHER: CloudSun,
  CLOCK: ClockIcon,
  UPCOMING_MEETINGS: Calendar,
};

const WIDGET_TITLES: Record<WidgetType, string> = {
  REVENUE: "Revenue",
  PIPELINE: "Pipeline",
  TASKS: "Tasks",
  CALENDAR: "Calendar",
  NOTES: "Notes",
  AI_ACTIVITY: "AI Activity",
  REPORTS: "Reports",
  WEATHER: "Weather",
  CLOCK: "Clock",
  UPCOMING_MEETINGS: "Upcoming Meetings",
};

const ADDABLE_TYPES: WidgetType[] = [
  "REVENUE",
  "PIPELINE",
  "TASKS",
  "CALENDAR",
  "UPCOMING_MEETINGS",
  "AI_ACTIVITY",
  "REPORTS",
  "NOTES",
  "WEATHER",
  "CLOCK",
];

function ClockWidget() {
  // Starts at null (not `new Date()`) so the server-rendered HTML and the
  // client's first render match — server time and client time would
  // otherwise differ and trigger a hydration mismatch. The interval's first
  // tick (up to 1s after mount) fills in the real time.
  const [now, setNow] = React.useState<Date | null>(null);
  React.useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  if (!now) return null;
  return (
    <div className="flex h-full flex-col items-center justify-center gap-1">
      <span className="text-3xl font-semibold tabular-nums tracking-tight text-foreground">
        {now.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
      </span>
      <span className="text-xs text-muted-foreground">
        {now.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
      </span>
    </div>
  );
}

// Reads the free-form note text out of Widget.config, which is untyped Json
// on the Prisma model — never trust its shape, default to "" for null/
// malformed config rather than crashing the widget.
function readNotesText(config: Widget["config"]): string {
  if (config && typeof config === "object" && !Array.isArray(config) && typeof (config as { text?: unknown }).text === "string") {
    return (config as { text: string }).text;
  }
  return "";
}

function NotesWidget({ widgetId, config }: { widgetId: string; config: Widget["config"] }) {
  const [text, setText] = React.useState(() => readNotesText(config));
  const [status, setStatus] = React.useState<"idle" | "saving" | "saved">("idle");
  const [, startTransition] = React.useTransition();
  const savedTextRef = React.useRef(text);

  const save = React.useCallback((value: string) => {
    if (value === savedTextRef.current) return;
    savedTextRef.current = value;
    setStatus("saving");
    startTransition(async () => {
      const result = await updateWidgetNotesAction(widgetId, value);
      setStatus(result.ok ? "saved" : "idle");
    });
  }, [widgetId]);

  // Debounced autosave: 800ms after the user stops typing. A blur (see
  // below) also saves immediately so a quick edit-then-click-away isn't
  // left waiting on the timer.
  React.useEffect(() => {
    const id = setTimeout(() => save(text), 800);
    return () => clearTimeout(id);
  }, [text, save]);

  return (
    <div className="flex h-full flex-col gap-1">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => save(text)}
        placeholder="Click and type to keep a personal note here."
        className="min-h-0 flex-1 resize-none bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
      />
      <span className="shrink-0 text-[11px] text-muted-foreground">
        {status === "saving" ? "Saving…" : status === "saved" ? "Saved" : " "}
      </span>
    </div>
  );
}

// Reads the chosen city out of Widget.config, same untyped-Json caution as
// readNotesText above — default to "" for null/malformed config.
function readWeatherCity(config: Widget["config"]): string {
  if (config && typeof config === "object" && !Array.isArray(config) && typeof (config as { city?: unknown }).city === "string") {
    return (config as { city: string }).city;
  }
  return "";
}

// Real temp/condition from data.weather (server-fetched via
// src/lib/weather.ts, only when a city is configured) — never a fabricated
// number. A pencil icon opens a minimal inline city input; saving calls
// router.refresh() (unlike NotesWidget's autosave) because the actual
// weather reading lives in the server-computed data bundle, not local state.
function WeatherWidget({
  widgetId,
  config,
  weather,
}: {
  widgetId: string;
  config: Widget["config"];
  weather: WidgetDataBundle["weather"];
}) {
  const router = useRouter();
  const savedCity = readWeatherCity(config);
  const [editing, setEditing] = React.useState(savedCity === "");
  const [city, setCity] = React.useState(savedCity);
  const [isPending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  function handleSave() {
    const trimmed = city.trim();
    if (!trimmed) return;
    setError(null);
    startTransition(async () => {
      const result = await updateWidgetConfigAction(widgetId, { city: trimmed });
      if (!result.ok) {
        setError(result.error ?? "Could not save that city.");
        return;
      }
      setEditing(false);
      router.refresh();
    });
  }

  return (
    <div className="flex h-full flex-col gap-2">
      <div className="flex shrink-0 items-center justify-end gap-1.5">
        {editing ? (
          <>
            <input
              type="text"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSave()}
              placeholder="City, e.g. Mumbai"
              autoFocus
              className="min-w-0 flex-1 rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground outline-none focus:border-primary"
            />
            <button
              type="button"
              onClick={handleSave}
              disabled={isPending || !city.trim()}
              aria-label="Save city"
              className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
            >
              <Check className="size-3.5" />
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => setEditing(true)}
            aria-label="Change city"
            className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <Pencil className="size-3.5" />
          </button>
        )}
      </div>
      <div className="flex min-h-0 flex-1 flex-col justify-center">
        {error ? (
          <p className="text-xs text-destructive">{error}</p>
        ) : !savedCity ? (
          <p className="text-sm text-muted-foreground">Set a city to see its weather here.</p>
        ) : !weather ? (
          <p className="text-sm text-muted-foreground">Loading weather&hellip;</p>
        ) : weather.ok ? (
          <div className="flex flex-col gap-1">
            <p className="text-2xl font-semibold tracking-tight text-foreground">{Math.round(weather.tempC)}&deg;C</p>
            <p className="text-xs capitalize text-muted-foreground">
              {weather.condition} &middot; {weather.city}
            </p>
          </div>
        ) : weather.reason === "not_configured" ? (
          <p className="text-sm text-muted-foreground">Not configured &mdash; set WEATHER_API_KEY to enable live weather.</p>
        ) : (
          <p className="text-sm text-muted-foreground">Couldn&rsquo;t load weather right now.</p>
        )}
      </div>
    </div>
  );
}

function WidgetBody({
  widget,
  currency,
  data,
}: {
  widget: Widget;
  currency: string | null | undefined;
  data: WidgetDataBundle;
}) {
  const type = widget.type;
  const formatMoney = (n: number) =>
    new Intl.NumberFormat(undefined, { style: "currency", currency: currency || "USD", maximumFractionDigits: 0 }).format(n);

  switch (type) {
    case "REVENUE":
      return (
        <div className="flex h-full flex-col justify-center gap-2">
          <p className="text-2xl font-semibold tracking-tight text-foreground">{formatMoney(data.revenueMonthly)}</p>
          <p className="text-xs text-muted-foreground">Won this week &middot; {formatMoney(data.wonValue)} won total</p>
        </div>
      );
    case "PIPELINE":
      return (
        <div className="flex h-full flex-col justify-center gap-2">
          <p className="text-2xl font-semibold tracking-tight text-foreground">{formatMoney(data.pipelineValue)}</p>
          <p className="text-xs text-muted-foreground">Open pipeline value</p>
        </div>
      );
    case "TASKS":
      return data.tasks.length === 0 ? (
        <p className="text-sm text-muted-foreground">No open tasks.</p>
      ) : (
        <ul className="flex flex-col gap-2 overflow-y-auto">
          {data.tasks.map((t) => (
            <li key={t.id} className="flex items-center justify-between gap-2 text-sm">
              <span className="min-w-0 flex-1 truncate text-foreground">{t.title}</span>
              <span className="shrink-0 text-[11px] text-muted-foreground">{t.status}</span>
            </li>
          ))}
        </ul>
      );
    case "CALENDAR":
    case "UPCOMING_MEETINGS":
      return data.upcomingMeetings.length === 0 ? (
        <p className="text-sm text-muted-foreground">No upcoming meetings scheduled.</p>
      ) : (
        <ul className="flex flex-col gap-2 overflow-y-auto">
          {data.upcomingMeetings.map((m) => (
            <li key={m.id} className="flex items-center justify-between gap-2 text-sm">
              <span className="min-w-0 flex-1 truncate text-foreground">{m.title}</span>
              <span className="shrink-0 text-[11px] text-muted-foreground">{m.status}</span>
            </li>
          ))}
        </ul>
      );
    case "AI_ACTIVITY":
      return data.aiActivity.length === 0 ? (
        <p className="text-sm text-muted-foreground">No AI activity yet.</p>
      ) : (
        <ul className="flex flex-col gap-2 overflow-y-auto">
          {data.aiActivity.map((a) => (
            <li key={a.id} className="text-xs text-muted-foreground">
              <span className="text-foreground">{a.actorName ? `${a.actorName}: ` : ""}{a.description}</span>
              <span> &middot; {formatRelativeTime(a.createdAt)}</span>
            </li>
          ))}
        </ul>
      );
    case "REPORTS":
      return (
        <div className="grid h-full grid-cols-3 gap-2 text-center">
          <div className="flex flex-col justify-center gap-1">
            <span className="text-xl font-semibold text-foreground">{data.reports.meetingsThisWeek}</span>
            <span className="text-[11px] text-muted-foreground">Meetings</span>
          </div>
          <div className="flex flex-col justify-center gap-1">
            <span className="text-xl font-semibold text-foreground">{data.reports.tasksCompletedThisWeek}</span>
            <span className="text-[11px] text-muted-foreground">Tasks done</span>
          </div>
          <div className="flex flex-col justify-center gap-1">
            <span className="text-xl font-semibold text-foreground">{data.reports.decisionsThisWeek}</span>
            <span className="text-[11px] text-muted-foreground">Decisions</span>
          </div>
        </div>
      );
    case "WEATHER":
      return <WeatherWidget widgetId={widget.id} config={widget.config} weather={data.weather} />;
    case "CLOCK":
      return <ClockWidget />;
    case "NOTES":
      return <NotesWidget widgetId={widget.id} config={widget.config} />;
    default:
      return null;
  }
}

export interface WidgetGridProps {
  dashboardId: string;
  widgets: Widget[];
  currency: string | null | undefined;
  data: WidgetDataBundle;
}

export function WidgetGrid({ widgets: initialWidgets, currency, data }: WidgetGridProps) {
  const router = useRouter();
  const [widgets, setWidgets] = React.useState(initialWidgets);
  const [showAddMenu, setShowAddMenu] = React.useState(false);
  const [isPending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  // Re-sync local widget state when the server gives us a new
  // `initialWidgets` (e.g. after router.refresh() following an add/remove).
  // Adjusted during render (React's documented pattern for "adjusting state
  // when a prop changes") rather than in a useEffect, which would cause an
  // extra, avoidable render pass.
  const [prevInitialWidgets, setPrevInitialWidgets] = React.useState(initialWidgets);
  if (initialWidgets !== prevInitialWidgets) {
    setPrevInitialWidgets(initialWidgets);
    setWidgets(initialWidgets);
  }

  const layout: Layout = widgets.map((w) => {
    const pos = w.position as unknown as WidgetPosition;
    return { i: w.id, x: pos.x, y: pos.y, w: pos.w, h: pos.h, minW: 3, minH: 3 };
  });

  function handleLayoutChange(next: Layout) {
    const changed = next.filter((item) => {
      const current = widgets.find((w) => w.id === item.i);
      const currentPos = current?.position as unknown as WidgetPosition | undefined;
      return (
        !currentPos || currentPos.x !== item.x || currentPos.y !== item.y || currentPos.w !== item.w || currentPos.h !== item.h
      );
    });
    if (changed.length === 0) return;

    setWidgets((prev) =>
      prev.map((w) => {
        const item = next.find((l) => l.i === w.id);
        if (!item) return w;
        return { ...w, position: { x: item.x, y: item.y, w: item.w, h: item.h } as unknown as Widget["position"] };
      }),
    );

    startTransition(async () => {
      const result = await updateWidgetPositionsAction(
        changed.map((item) => ({ id: item.i, position: { x: item.x, y: item.y, w: item.w, h: item.h } })),
      );
      if (!result.ok) setError(result.error ?? "Could not save layout.");
    });
  }

  function handleAdd(type: WidgetType) {
    setShowAddMenu(false);
    setError(null);
    const maxY = widgets.reduce((max, w) => {
      const pos = w.position as unknown as WidgetPosition;
      return Math.max(max, pos.y + pos.h);
    }, 0);
    startTransition(async () => {
      const result = await addWidgetAction(type, { x: 0, y: maxY, w: 6, h: 4 });
      if (!result.ok) {
        setError(result.error ?? "Could not add widget.");
        return;
      }
      if (result.widget) setWidgets((prev) => [...prev, result.widget!]);
      router.refresh();
    });
  }

  function handleRemove(widgetId: string) {
    setError(null);
    setWidgets((prev) => prev.filter((w) => w.id !== widgetId));
    startTransition(async () => {
      const result = await removeWidgetAction(widgetId);
      if (!result.ok) setError(result.error ?? "Could not remove widget.");
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold tracking-tight text-foreground">Your Widgets</h2>
        <div className="relative">
          <Button type="button" size="sm" variant="outline" onClick={() => setShowAddMenu((v) => !v)}>
            <Plus className="size-4" />
            Add widget
          </Button>
          {showAddMenu && (
            <div className="absolute right-0 z-10 mt-2 w-48 overflow-hidden rounded-xl border border-border bg-card p-1.5 shadow-card">
              {ADDABLE_TYPES.map((type) => {
                const Icon = WIDGET_ICONS[type];
                return (
                  <button
                    key={type}
                    type="button"
                    onClick={() => handleAdd(type)}
                    className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm text-foreground transition-colors hover:bg-accent"
                  >
                    <Icon className="size-4 shrink-0 text-primary" />
                    {WIDGET_TITLES[type]}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}

      {widgets.length === 0 ? (
        <Card>
          <div className="flex flex-col items-center gap-2 p-10 text-center">
            <p className="text-sm text-muted-foreground">No widgets on your dashboard yet.</p>
            <Button type="button" size="sm" onClick={() => setShowAddMenu(true)}>
              <Plus className="size-4" />
              Add your first widget
            </Button>
          </div>
        </Card>
      ) : (
        <ResponsiveGridLayout
          className="layout"
          layouts={{ lg: layout, md: layout, sm: layout }}
          breakpoints={{ lg: 1024, md: 768, sm: 0 }}
          cols={{ lg: 12, md: 12, sm: 6 }}
          rowHeight={56}
          margin={[16, 16]}
          draggableHandle=".widget-drag-handle"
          onLayoutChange={handleLayoutChange}
          isResizable
          isDraggable
        >
          {widgets.map((w) => {
            const Icon = WIDGET_ICONS[w.type];
            return (
              <div key={w.id} className={cn(isPending && "opacity-90")}>
                <Card className="flex h-full flex-col overflow-hidden">
                  <div className="widget-drag-handle flex shrink-0 cursor-move items-center justify-between gap-2 border-b border-border px-3 py-2">
                    <span className="flex min-w-0 items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      <GripVertical className="size-3.5 shrink-0" />
                      <Icon className="size-3.5 shrink-0 text-primary" />
                      <span className="truncate">{WIDGET_TITLES[w.type]}</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => handleRemove(w.id)}
                      aria-label={`Remove ${WIDGET_TITLES[w.type]} widget`}
                      className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                    >
                      <X className="size-3.5" />
                    </button>
                  </div>
                  <div className="min-h-0 flex-1 overflow-hidden p-3">
                    <WidgetBody widget={w} currency={currency} data={data} />
                  </div>
                </Card>
              </div>
            );
          })}
        </ResponsiveGridLayout>
      )}

      <p className="text-xs text-muted-foreground">
        <Link href="/board/reports" className="underline underline-offset-4 hover:text-foreground">
          View full reports
        </Link>
      </p>
    </div>
  );
}
