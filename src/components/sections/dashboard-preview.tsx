"use client";

import * as React from "react";
import { motion } from "framer-motion";
import {
  LayoutDashboard,
  Users,
  Send,
  LineChart as LineChartIcon,
  Workflow as WorkflowIcon,
  Settings,
  Bell,
  Search,
  ArrowUpRight,
  Circle,
} from "lucide-react";

import { Container } from "@/components/ui/container";
import { SectionHeading } from "@/components/ui/section-heading";
import { Badge } from "@/components/ui/badge";
import { EASES, fadeInUp, staggerContainer } from "@/animations";

interface NavIcon {
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  label: string;
  active?: boolean;
}

const NAV_ICONS: NavIcon[] = [
  { icon: LayoutDashboard, label: "Dashboard", active: true },
  { icon: Users, label: "Pipeline" },
  { icon: Send, label: "Outreach" },
  { icon: WorkflowIcon, label: "Workflows" },
  { icon: LineChartIcon, label: "Analytics" },
  { icon: Settings, label: "Settings" },
];

const STAT_CARDS = [
  {
    label: "Qualified pipeline",
    value: "$482K",
    delta: "+18.2%",
    accent: "var(--chart-1)",
  },
  {
    label: "AI-booked meetings",
    value: "146",
    delta: "+9.4%",
    accent: "var(--chart-2)",
  },
  {
    label: "Avg. response time",
    value: "2m 14s",
    delta: "-31.0%",
    accent: "var(--chart-3)",
  },
] as const;

const BAR_CHART = [
  { label: "Mon", value: 38 },
  { label: "Tue", value: 52 },
  { label: "Wed", value: 44 },
  { label: "Thu", value: 68 },
  { label: "Fri", value: 61 },
  { label: "Sat", value: 34 },
  { label: "Sun", value: 76 },
] as const;

const LINE_POINTS = "0,58 16,49 32,52 48,34 64,38 80,20 100,14";

function DashboardPreview() {
  return (
    <section className="relative py-24 sm:py-32">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-1/4 -z-10 mx-auto h-[32rem] max-w-4xl bg-radial-fade blur-3xl"
      />

      <Container className="flex flex-col items-center gap-16">
        <SectionHeading
          eyebrow="Inside GrowthOS"
          title={
            <>
              One command center for{" "}
              <span className="text-gradient-brand">every growth signal</span>
            </>
          }
          description="Pipeline value, outreach performance, and AI agent activity, live in a single view your team actually checks every morning."
        />

        <motion.div
          className="w-full max-w-5xl"
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.7, ease: EASES.outExpo }}
        >
          <motion.div
            animate={{ y: [0, -10, 0] }}
            transition={{
              duration: 7,
              repeat: Infinity,
              repeatType: "mirror",
              ease: "easeInOut",
            }}
            className="overflow-hidden rounded-2xl border border-border shadow-elevated shadow-glow-primary glass-panel-strong"
          >
            {/* Browser chrome bar */}
            <div className="flex items-center gap-4 border-b border-border px-5 py-3">
              <div className="flex items-center gap-1.5">
                <span className="size-2.5 rounded-full bg-muted-foreground/40" />
                <span className="size-2.5 rounded-full bg-muted-foreground/40" />
                <span className="size-2.5 rounded-full bg-muted-foreground/40" />
              </div>
              <div className="mx-auto flex w-full max-w-xs items-center gap-2 rounded-full border border-border bg-muted px-3 py-1.5 text-xs text-muted-foreground">
                <Search className="size-3.5" strokeWidth={2} />
                app.kvlgrowthos.com/dashboard
              </div>
              <Bell className="size-4 shrink-0 text-muted-foreground" strokeWidth={2} />
            </div>

            <div className="flex">
              {/* Sidebar */}
              <div className="hidden w-16 shrink-0 flex-col items-center gap-2 border-r border-sidebar-border bg-sidebar py-6 sm:flex">
                {NAV_ICONS.map(({ icon: Icon, label, active }) => (
                  <span
                    key={label}
                    title={label}
                    className={
                      active
                        ? "flex size-10 items-center justify-center rounded-xl bg-sidebar-accent text-sidebar-accent-foreground"
                        : "flex size-10 items-center justify-center rounded-xl text-sidebar-foreground/60 transition-colors hover:bg-sidebar-accent/60 hover:text-sidebar-foreground"
                    }
                  >
                    <Icon className="size-4.5" strokeWidth={2} />
                  </span>
                ))}
              </div>

              {/* Main area */}
              <div className="flex-1 p-5 sm:p-8">
                <div className="mb-6 flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-semibold tracking-tight text-foreground">
                      Growth overview
                    </h3>
                    <p className="text-xs text-muted-foreground">Last 7 days</p>
                  </div>
                  <Badge variant="accent">
                    <Circle className="size-2 fill-current" />
                    3 agents active
                  </Badge>
                </div>

                <motion.div
                  className="grid grid-cols-1 gap-3 sm:grid-cols-3"
                  variants={staggerContainer}
                  initial="hidden"
                  whileInView="visible"
                  viewport={{ once: true, margin: "-80px" }}
                >
                  {STAT_CARDS.map((stat) => (
                    <motion.div
                      key={stat.label}
                      variants={fadeInUp}
                      className="rounded-xl border border-border bg-card p-4"
                    >
                      <p className="text-xs text-muted-foreground">{stat.label}</p>
                      <div className="mt-2 flex items-end justify-between">
                        <span className="text-xl font-semibold tracking-tight text-foreground">
                          {stat.value}
                        </span>
                        <span
                          className="flex items-center gap-0.5 text-xs font-medium"
                          style={{ color: stat.accent }}
                        >
                          <ArrowUpRight className="size-3" strokeWidth={2.5} />
                          {stat.delta}
                        </span>
                      </div>
                    </motion.div>
                  ))}
                </motion.div>

                <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-5">
                  {/* Bar chart */}
                  <div className="rounded-xl border border-border bg-card p-5 lg:col-span-3">
                    <div className="mb-4 flex items-center justify-between">
                      <p className="text-xs font-medium text-foreground">
                        Outreach touches sent
                      </p>
                      <p className="text-xs text-muted-foreground">This week</p>
                    </div>
                    <div className="flex h-32 items-end justify-between gap-2 sm:gap-3" aria-hidden="true">
                      {BAR_CHART.map((bar, i) => (
                        <div
                          key={bar.label}
                          className="flex flex-1 flex-col items-center gap-2"
                        >
                          <div className="flex h-24 w-full items-end overflow-hidden rounded-md bg-muted">
                            <motion.div
                              className="w-full rounded-md"
                              style={{
                                backgroundColor:
                                  i === BAR_CHART.length - 1
                                    ? "var(--chart-1)"
                                    : "var(--chart-2)",
                                opacity: i === BAR_CHART.length - 1 ? 1 : 0.55,
                              }}
                              initial={{ height: 0 }}
                              whileInView={{ height: `${bar.value}%` }}
                              viewport={{ once: true, margin: "-80px" }}
                              transition={{
                                duration: 0.6,
                                ease: EASES.outExpo,
                                delay: i * 0.06,
                              }}
                            />
                          </div>
                          <span className="text-[10px] text-muted-foreground">
                            {bar.label}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Line chart */}
                  <div className="rounded-xl border border-border bg-card p-5 lg:col-span-2">
                    <div className="mb-4">
                      <p className="text-xs font-medium text-foreground">
                        Pipeline velocity
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Lead to close, days
                      </p>
                    </div>
                    <svg
                      viewBox="0 0 100 60"
                      preserveAspectRatio="none"
                      className="h-24 w-full"
                      aria-hidden="true"
                    >
                      <motion.polyline
                        points={LINE_POINTS}
                        fill="none"
                        stroke="var(--chart-3)"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        vectorEffect="non-scaling-stroke"
                        initial={{ pathLength: 0, opacity: 0 }}
                        whileInView={{ pathLength: 1, opacity: 1 }}
                        viewport={{ once: true, margin: "-80px" }}
                        transition={{ duration: 1.1, ease: EASES.outExpo }}
                      />
                    </svg>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </motion.div>
      </Container>
    </section>
  );
}

export default DashboardPreview;
export { DashboardPreview };
