"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { Info } from "lucide-react";

import { fadeInUp } from "@/animations";
import { AnimatedCounter } from "@/components/ui/animated-counter";
import { Card } from "@/components/ui/card";
import { Container } from "@/components/ui/container";
import { SectionHeading } from "@/components/ui/section-heading";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/**
 * Illustrative-only assumptions used to project outputs from the three
 * inputs below. These are not guarantees — see the disclaimer tooltip
 * next to the results.
 *
 * - MEETING_LIFT_RATE: share of monthly leads that convert into an
 *   additional booked meeting because the Outreach AI follows up
 *   instantly instead of leads going cold waiting on a rep.
 * - CLOSE_RATE_LIFT_PP: percentage-point lift to close rate from faster,
 *   more consistent proposal follow-through (Proposal AI + Sales AI).
 * - MAX_CLOSE_RATE: a sanity ceiling so the projected close rate never
 *   reads as unrealistic regardless of inputs.
 * - REP_BASE_HOURS_SAVED / REP_HOURS_PER_LEADS: baseline hours saved per
 *   rep per week from automated scheduling/logging, plus incremental
 *   hours saved per additional lead volume the agents handle.
 */
const MEETING_LIFT_RATE = 0.18;
const CLOSE_RATE_LIFT_PP = 7;
const MAX_CLOSE_RATE = 75;
const REP_BASE_HOURS_SAVED = 3;
const REP_HOURS_PER_LEADS = 25;
const MAX_HOURS_SAVED = 20;

interface SliderFieldProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  formatValue: (value: number) => string;
}

function SliderField({
  label,
  value,
  min,
  max,
  step,
  onChange,
  formatValue,
}: SliderFieldProps) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-4">
        <label className="text-sm font-medium text-foreground">{label}</label>
        <span className="font-mono text-sm font-semibold tabular-nums text-primary">
          {formatValue(value)}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-muted accent-primary"
        aria-label={label}
      />
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>{formatValue(min)}</span>
        <span>{formatValue(max)}</span>
      </div>
    </div>
  );
}

interface OutputRowProps {
  label: string;
  value: number;
  prefix?: string;
  suffix?: string;
  decimals?: number;
}

function OutputRow({ label, value, prefix, suffix, decimals }: OutputRowProps) {
  return (
    <div className="flex flex-col gap-1 rounded-xl border border-border bg-card/60 p-5">
      <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <span className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
        <AnimatedCounter
          value={value}
          prefix={prefix}
          suffix={suffix}
          decimals={decimals}
        />
      </span>
    </div>
  );
}

function RoiCalculator() {
  const [leads, setLeads] = React.useState(200);
  const [dealSize, setDealSize] = React.useState(5000);
  const [closeRate, setCloseRate] = React.useState(20);

  const additionalMeetings = Math.round(leads * MEETING_LIFT_RATE);
  const newCloseRate = Math.min(MAX_CLOSE_RATE, closeRate + CLOSE_RATE_LIFT_PP);
  const currentRevenue = leads * (closeRate / 100) * dealSize;
  const projectedRevenue =
    (leads + additionalMeetings) * (newCloseRate / 100) * dealSize;
  const additionalRevenue = Math.max(
    0,
    Math.round(projectedRevenue - currentRevenue),
  );
  const hoursSavedPerRep = Math.min(
    MAX_HOURS_SAVED,
    Math.round((REP_BASE_HOURS_SAVED + leads / REP_HOURS_PER_LEADS) * 10) / 10,
  );

  return (
    <section className="relative py-24 sm:py-32">
      <Container className="flex flex-col items-center gap-16">
        <SectionHeading
          eyebrow="ROI calculator"
          title={
            <>
              See what GrowthOS could add{" "}
              <span className="text-gradient-brand">to your pipeline</span>
            </>
          }
          description="Adjust the sliders to match your current funnel and see illustrative estimates update live."
        />

        <motion.div
          variants={fadeInUp}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-80px" }}
          className="w-full max-w-5xl"
        >
          <Card glass className="p-6 sm:p-10">
            <div className="grid grid-cols-1 gap-10 lg:grid-cols-2 lg:gap-12">
              <div className="flex flex-col gap-8">
                <SliderField
                  label="Leads per month"
                  value={leads}
                  min={25}
                  max={1000}
                  step={25}
                  onChange={setLeads}
                  formatValue={(v) => v.toLocaleString()}
                />
                <SliderField
                  label="Average deal size ($)"
                  value={dealSize}
                  min={500}
                  max={50000}
                  step={500}
                  onChange={setDealSize}
                  formatValue={(v) => `$${v.toLocaleString()}`}
                />
                <SliderField
                  label="Current close rate (%)"
                  value={closeRate}
                  min={5}
                  max={50}
                  step={1}
                  onChange={setCloseRate}
                  formatValue={(v) => `${v}%`}
                />
              </div>

              <div className="flex flex-col gap-4">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-medium text-foreground">
                    Estimated impact
                  </h3>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        aria-label="How these estimates are calculated"
                        className={cn(
                          "inline-flex size-4 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground",
                        )}
                      >
                        <Info className="size-4" strokeWidth={2} />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-72 text-left">
                      These figures are illustrative estimates based on
                      typical gains other teams see from faster follow-up
                      and more consistent proposal work — not a guarantee
                      of results for your business.
                    </TooltipContent>
                  </Tooltip>
                </div>

                <div className="flex flex-col gap-3">
                  <OutputRow
                    label="Additional qualified meetings / month"
                    value={additionalMeetings}
                    suffix="/mo"
                  />
                  <OutputRow
                    label="Additional revenue / month"
                    value={additionalRevenue}
                    prefix="$"
                  />
                  <OutputRow
                    label="Hours saved per rep / week"
                    value={hoursSavedPerRep}
                    suffix=" hrs"
                    decimals={1}
                  />
                </div>
              </div>
            </div>
          </Card>
        </motion.div>
      </Container>
    </section>
  );
}

export default RoiCalculator;
export { RoiCalculator };
