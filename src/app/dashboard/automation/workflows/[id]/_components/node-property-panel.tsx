"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { AlertTriangle, X } from "lucide-react";
import type { z } from "zod";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { FormField } from "@/components/ui/form-field";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { DURATIONS } from "@/animations";
import { updateWorkflowStepAction } from "../../../actions";
import { NODE_TYPE_META, ALL_NODE_TYPES } from "../_lib/node-type-meta";
import { documentIndustrySchema, pricingModelSchema } from "@/lib/validations/proposal";
import {
  NODE_CONFIG_SCHEMAS,
  conditionOperatorSchema,
  personaTypeSchema,
  httpMethodSchema,
  documentKindSchema,
  queryableModelSchema,
  queryableOperationSchema,
  internalFunctionNameSchema,
} from "@/lib/validations/workflow-node-configs";
import type { WorkflowNodeTypeInput } from "@/lib/validations/workflows";
import type { Prisma } from "@/generated/prisma/client";
import { NotificationType } from "@/generated/prisma/enums";

/**
 * Node-selection-driven property panel for the Workflow visual builder.
 * Composition contract for the canvas: lift a `selectedStep` state
 * (WorkflowStepPanelData | null), pass it in as `step`, clear it in
 * `onClose`, and refresh canvas data in `onSaved`.
 *
 *   const [selectedStep, setSelectedStep] = useState<WorkflowStepPanelData | null>(null);
 *   <NodePropertyPanel step={selectedStep} onClose={() => setSelectedStep(null)} onSaved={() => router.refresh()} />
 *   // on node click: setSelectedStep(step)
 */
export interface WorkflowStepPanelData {
  id: string;
  nodeType: WorkflowNodeTypeInput;
  name: string;
  config: Prisma.JsonValue;
}

export interface NodePropertyPanelProps {
  step: WorkflowStepPanelData | null;
  onClose: () => void;
  onSaved?: () => void;
}

type ConfigRecord = Record<string, unknown>;

function asConfigRecord(value: Prisma.JsonValue): ConfigRecord {
  if (value && typeof value === "object" && !Array.isArray(value)) return { ...(value as ConfigRecord) };
  return {};
}

function str(config: ConfigRecord, key: string): string {
  const v = config[key];
  return typeof v === "string" ? v : typeof v === "number" || typeof v === "boolean" ? String(v) : "";
}

function bool(config: ConfigRecord, key: string): boolean {
  return config[key] === true;
}

// ---------------------------------------------------------------------------
// Reusable field primitives — every one patches a single real config key.
// ---------------------------------------------------------------------------

interface FieldProps {
  config: ConfigRecord;
  patch: (partial: ConfigRecord) => void;
  fieldKey: string;
  label: string;
  hint?: string;
  required?: boolean;
  idPrefix: string;
}

function TextField({ config, patch, fieldKey, label, hint, required, idPrefix, type = "text" }: FieldProps & { type?: string }) {
  const id = `${idPrefix}-${fieldKey}`;
  return (
    <FormField label={label} htmlFor={id} hint={hint} required={required}>
      <Input
        id={id}
        type={type}
        value={str(config, fieldKey)}
        onChange={(e) => {
          const v = e.target.value;
          patch({ [fieldKey]: v.trim() === "" ? undefined : v });
        }}
      />
    </FormField>
  );
}

function NumberField({ config, patch, fieldKey, label, hint, required, idPrefix }: FieldProps) {
  const id = `${idPrefix}-${fieldKey}`;
  return (
    <FormField label={label} htmlFor={id} hint={hint} required={required}>
      <Input
        id={id}
        type="number"
        value={str(config, fieldKey)}
        onChange={(e) => {
          const v = e.target.value;
          patch({ [fieldKey]: v.trim() === "" ? undefined : v });
        }}
      />
    </FormField>
  );
}

function TextareaField({ config, patch, fieldKey, label, hint, required, idPrefix, rows = 3 }: FieldProps & { rows?: number }) {
  const id = `${idPrefix}-${fieldKey}`;
  return (
    <FormField label={label} htmlFor={id} hint={hint} required={required}>
      <textarea
        id={id}
        rows={rows}
        value={str(config, fieldKey)}
        onChange={(e) => {
          const v = e.target.value;
          patch({ [fieldKey]: v.trim() === "" ? undefined : v });
        }}
        className="w-full rounded-lg border border-input bg-transparent p-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
    </FormField>
  );
}

function SelectField({
  config,
  patch,
  fieldKey,
  label,
  hint,
  required,
  idPrefix,
  options,
}: FieldProps & { options: readonly string[] | Array<{ value: string; label: string }> }) {
  const id = `${idPrefix}-${fieldKey}`;
  const normalized = options.map((o) => (typeof o === "string" ? { value: o, label: o } : o));
  const currentValue = str(config, fieldKey);

  // Required selects always default the config to a real, valid value —
  // the browser otherwise shows the first <option> as selected while the
  // underlying config key stays unset, silently mismatching what's on screen.
  useEffect(() => {
    if (required && currentValue === "" && normalized.length > 0) {
      patch({ [fieldKey]: normalized[0].value });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [required, currentValue, fieldKey]);

  return (
    <FormField label={label} htmlFor={id} hint={hint} required={required}>
      <Select
        id={id}
        value={currentValue}
        onChange={(e) => {
          const v = e.target.value;
          patch({ [fieldKey]: v === "" ? undefined : v });
        }}
      >
        {!required && <option value="">— none —</option>}
        {normalized.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </Select>
    </FormField>
  );
}

function CheckboxField({ config, patch, fieldKey, label, hint, idPrefix }: Omit<FieldProps, "required">) {
  const id = `${idPrefix}-${fieldKey}`;
  return (
    <label htmlFor={id} className="flex items-center gap-2 text-sm text-foreground">
      <input
        id={id}
        type="checkbox"
        checked={bool(config, fieldKey)}
        onChange={(e) => patch({ [fieldKey]: e.target.checked ? true : undefined })}
        className="size-4 rounded border-input"
      />
      {label}
      {hint && <span className="text-xs text-muted-foreground">({hint})</span>}
    </label>
  );
}

function JsonField({ config, patch, fieldKey, label, hint, idPrefix }: Omit<FieldProps, "required">) {
  const id = `${idPrefix}-${fieldKey}`;
  const initial = config[fieldKey];
  const [text, setText] = useState(() => (initial === undefined ? "" : JSON.stringify(initial, null, 2)));
  const [error, setError] = useState<string | null>(null);

  return (
    <FormField label={label} htmlFor={id} hint={hint ?? "Optional — JSON object."}>
      <textarea
        id={id}
        rows={3}
        value={text}
        onChange={(e) => {
          const next = e.target.value;
          setText(next);
          if (next.trim() === "") {
            setError(null);
            patch({ [fieldKey]: undefined });
            return;
          }
          try {
            const parsed = JSON.parse(next);
            setError(null);
            patch({ [fieldKey]: parsed });
          } catch {
            setError("Invalid JSON — not saved until fixed.");
          }
        }}
        className="w-full rounded-lg border border-input bg-transparent p-3 font-mono text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
      {error && <p className="text-xs text-destructive">{error}</p>}
    </FormField>
  );
}

// ---------------------------------------------------------------------------
// Per-node-type forms — each renders exactly the real fields its executor
// (src/lib/workflows/node-executors/*.ts) reads for that nodeType.
// ---------------------------------------------------------------------------

type FormProps = { config: ConfigRecord; patch: (partial: ConfigRecord) => void };

function ConditionForm({ config, patch }: FormProps) {
  const operator = str(config, "operator") || "equals";
  const needsValue = operator !== "exists" && operator !== "not_exists";
  const currentValue = config.value;
  const valueKind: "string" | "number" | "boolean" =
    typeof currentValue === "number" ? "number" : typeof currentValue === "boolean" ? "boolean" : "string";

  return (
    <div className="flex flex-col gap-4">
      <TextField
        config={config}
        patch={patch}
        fieldKey="field"
        label="Field"
        hint="Dotted path into trigger payload / prior step outputs, e.g. dealId or stepOutputs.step1.dealId."
        required
        idPrefix="condition"
      />
      <SelectField
        config={config}
        patch={patch}
        fieldKey="operator"
        label="Operator"
        required
        idPrefix="condition"
        options={conditionOperatorSchema.options}
      />
      {needsValue && (
        <div className="grid grid-cols-[7rem_1fr] gap-3">
          <FormField label="Value type" htmlFor="condition-value-kind" required>
            <Select
              id="condition-value-kind"
              value={valueKind}
              onChange={(e) => {
                const kind = e.target.value as "string" | "number" | "boolean";
                if (kind === "boolean") patch({ value: false });
                else if (kind === "number") patch({ value: 0 });
                else patch({ value: "" });
              }}
            >
              <option value="string">Text</option>
              <option value="number">Number</option>
              <option value="boolean">True/false</option>
            </Select>
          </FormField>
          {valueKind === "boolean" ? (
            <FormField label="Value" htmlFor="condition-value" required>
              <Select
                id="condition-value"
                value={currentValue === true ? "true" : "false"}
                onChange={(e) => patch({ value: e.target.value === "true" })}
              >
                <option value="true">true</option>
                <option value="false">false</option>
              </Select>
            </FormField>
          ) : valueKind === "number" ? (
            <FormField label="Value" htmlFor="condition-value" required>
              <Input
                id="condition-value"
                type="number"
                value={typeof currentValue === "number" ? String(currentValue) : ""}
                onChange={(e) => patch({ value: e.target.value === "" ? 0 : Number(e.target.value) })}
              />
            </FormField>
          ) : (
            <FormField label="Value" htmlFor="condition-value" required>
              <Input
                id="condition-value"
                value={typeof currentValue === "string" ? currentValue : ""}
                onChange={(e) => patch({ value: e.target.value })}
              />
            </FormField>
          )}
        </div>
      )}
    </div>
  );
}

function DelayForm({ config, patch }: FormProps) {
  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs text-muted-foreground">Set exactly one of these — a fixed delay, or an absolute resume date.</p>
      <NumberField config={config} patch={patch} fieldKey="seconds" label="Delay (seconds)" idPrefix="delay" />
      <TextField
        config={config}
        patch={patch}
        fieldKey="until"
        label="Resume at (ISO date)"
        hint="e.g. 2026-08-01T09:00:00.000Z"
        idPrefix="delay"
        type="datetime-local"
      />
    </div>
  );
}

function LoopForm({ config, patch }: FormProps) {
  return (
    <div className="flex flex-col gap-4">
      <TextField
        config={config}
        patch={patch}
        fieldKey="sourcePath"
        label="Source path"
        hint="Dotted path to a real array in trigger payload / prior step outputs, e.g. triggerPayload.items."
        required
        idPrefix="loop"
      />
      <SelectField
        config={config}
        patch={patch}
        fieldKey="bodyNodeType"
        label="Body node type"
        hint="Runs this node type's executor once per item."
        required
        idPrefix="loop"
        options={ALL_NODE_TYPES}
      />
      <NumberField config={config} patch={patch} fieldKey="maxIterations" label="Max iterations" hint="Default 50." idPrefix="loop" />
      <JsonField config={config} patch={patch} fieldKey="bodyConfig" label="Body config" hint="Config object passed to the body node type, e.g. an EMAIL config." idPrefix="loop" />
    </div>
  );
}

function AiActionForm({ config, patch }: FormProps) {
  return (
    <div className="flex flex-col gap-4">
      <TextareaField
        config={config}
        patch={patch}
        fieldKey="prompt"
        label="Prompt"
        hint="Supports {{dotted.path}} interpolation against real trigger/step data."
        required
        idPrefix="ai-action"
        rows={5}
      />
      <SelectField config={config} patch={patch} fieldKey="personaType" label="Persona" idPrefix="ai-action" options={personaTypeSchema.options} />
      <JsonField
        config={config}
        patch={patch}
        fieldKey="outputSchema"
        label="Output schema"
        hint='Optional — forces structured output, e.g. {"score": "number", "reason": "string"}.'
        idPrefix="ai-action"
      />
    </div>
  );
}

function EmailForm({ config, patch }: FormProps) {
  return (
    <div className="flex flex-col gap-4">
      <TextField config={config} patch={patch} fieldKey="to" label="To" required idPrefix="email" type="email" />
      <TextField config={config} patch={patch} fieldKey="subject" label="Subject" required idPrefix="email" />
      <TextareaField config={config} patch={patch} fieldKey="body" label="Body" required idPrefix="email" rows={6} />
    </div>
  );
}

function SmsForm({ config, patch }: FormProps) {
  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs text-muted-foreground">
        Sends via this organization&apos;s connected Twilio account — connect one at Settings → Integrations.
      </p>
      <TextField config={config} patch={patch} fieldKey="to" label="To" required idPrefix="sms" hint="E.164 format, e.g. +15551234567." />
      <TextField config={config} patch={patch} fieldKey="from" label="From" required idPrefix="sms" hint="A phone number on your connected Twilio account." />
      <TextareaField config={config} patch={patch} fieldKey="body" label="Body" required idPrefix="sms" rows={4} />
    </div>
  );
}

function WebhookFields({ config, patch, idPrefix }: FormProps & { idPrefix: string }) {
  return (
    <>
      <TextField config={config} patch={patch} fieldKey="url" label="URL" required idPrefix={idPrefix} hint="Public http(s) URL — private/internal hosts are rejected." />
      <SelectField config={config} patch={patch} fieldKey="method" label="Method" idPrefix={idPrefix} options={httpMethodSchema.options} hint="Defaults to POST." />
      <JsonField config={config} patch={patch} fieldKey="headers" label="Headers" hint='Optional — e.g. {"X-Api-Key": "..."}.' idPrefix={idPrefix} />
      <JsonField config={config} patch={patch} fieldKey="body" label="Request body" hint="Optional — sent as JSON." idPrefix={idPrefix} />
    </>
  );
}

function WebhookForm({ config, patch }: FormProps) {
  return (
    <div className="flex flex-col gap-4">
      <WebhookFields config={config} patch={patch} idPrefix="webhook" />
    </div>
  );
}

function CustomApiForm({ config, patch }: FormProps) {
  return (
    <div className="flex flex-col gap-4">
      <WebhookFields config={config} patch={patch} idPrefix="custom-api" />
      <TextField
        config={config}
        patch={patch}
        fieldKey="secretKey"
        label="Secret key"
        hint="Optional — looked up in this org's Secrets Manager and injected as an outgoing header."
        idPrefix="custom-api"
      />
      <TextField config={config} patch={patch} fieldKey="secretHeaderName" label="Secret header name" hint='Defaults to "Authorization".' idPrefix="custom-api" />
    </div>
  );
}

const NOTIFICATION_TYPE_OPTIONS = Object.values(NotificationType);

function NotificationForm({ config, patch }: FormProps) {
  const notifyAllOwners = bool(config, "notifyAllOwners");
  return (
    <div className="flex flex-col gap-4">
      <TextField config={config} patch={patch} fieldKey="title" label="Title" required idPrefix="notification" />
      <TextareaField config={config} patch={patch} fieldKey="message" label="Message" required idPrefix="notification" />
      <SelectField config={config} patch={patch} fieldKey="type" label="Notification type" idPrefix="notification" options={NOTIFICATION_TYPE_OPTIONS} hint="Defaults to AUTOMATION_EVENT." />
      <CheckboxField config={config} patch={patch} fieldKey="notifyAllOwners" label="Notify all organization owners" idPrefix="notification" />
      {!notifyAllOwners && (
        <TextField config={config} patch={patch} fieldKey="recipientUserId" label="Recipient user id" required idPrefix="notification" />
      )}
    </div>
  );
}

const CRM_ACTIONS = [
  { value: "create_deal", label: "Create deal" },
  { value: "update_deal_stage", label: "Update deal stage" },
  { value: "create_contact", label: "Create contact" },
];

function CrmForm({ config, patch }: FormProps) {
  const action = str(config, "action") || "create_deal";
  return (
    <div className="flex flex-col gap-4">
      <SelectField config={config} patch={patch} fieldKey="action" label="Action" required idPrefix="crm" options={CRM_ACTIONS} />

      {action === "create_deal" && (
        <>
          <TextField config={config} patch={patch} fieldKey="name" label="Deal name" required idPrefix="crm" />
          <NumberField config={config} patch={patch} fieldKey="value" label="Value" idPrefix="crm" />
          <TextField config={config} patch={patch} fieldKey="companyId" label="Company id" idPrefix="crm" />
          <TextField config={config} patch={patch} fieldKey="contactId" label="Contact id" idPrefix="crm" />
          <TextField config={config} patch={patch} fieldKey="dealStageId" label="Pipeline stage id" hint="Falls back to this org's first pipeline stage." idPrefix="crm" />
        </>
      )}

      {action === "update_deal_stage" && (
        <>
          <TextField config={config} patch={patch} fieldKey="dealId" label="Deal id" required idPrefix="crm" />
          <TextField config={config} patch={patch} fieldKey="targetStageId" label="Target pipeline stage id" required idPrefix="crm" />
        </>
      )}

      {action === "create_contact" && (
        <>
          <TextField config={config} patch={patch} fieldKey="firstName" label="First name" required idPrefix="crm" />
          <TextField config={config} patch={patch} fieldKey="lastName" label="Last name" idPrefix="crm" />
          <TextField config={config} patch={patch} fieldKey="email" label="Email" required idPrefix="crm" type="email" />
          <TextField config={config} patch={patch} fieldKey="companyId" label="Company id" idPrefix="crm" />
          <TextField config={config} patch={patch} fieldKey="phone" label="Phone" idPrefix="crm" />
          <TextField config={config} patch={patch} fieldKey="jobTitle" label="Job title" idPrefix="crm" />
        </>
      )}
    </div>
  );
}

function ProposalForm({ config, patch }: FormProps) {
  return (
    <div className="flex flex-col gap-4">
      <TextField config={config} patch={patch} fieldKey="title" label="Title" required idPrefix="proposal" />
      <TextField config={config} patch={patch} fieldKey="dealId" label="Deal id" hint="Its notes are used as the brief when none is given below." idPrefix="proposal" />
      <TextField config={config} patch={patch} fieldKey="companyId" label="Company id" idPrefix="proposal" />
      <SelectField config={config} patch={patch} fieldKey="industry" label="Industry" idPrefix="proposal" options={documentIndustrySchema.options} />
      <SelectField config={config} patch={patch} fieldKey="pricingModel" label="Pricing model" idPrefix="proposal" options={pricingModelSchema.options} />
      <NumberField config={config} patch={patch} fieldKey="value" label="Value" idPrefix="proposal" />
      <TextareaField config={config} patch={patch} fieldKey="brief" label="Brief" hint="Required unless a linked deal has notes to draft from." idPrefix="proposal" rows={4} />
    </div>
  );
}

function ProjectForm({ config, patch }: FormProps) {
  return (
    <div className="flex flex-col gap-4">
      <TextField config={config} patch={patch} fieldKey="dealId" label="Deal id" hint="Converts this won deal to a project — real milestones + PM agent." idPrefix="project" />
      <TextField config={config} patch={patch} fieldKey="name" label="Project name" hint="Required only when no deal id is set." idPrefix="project" />
    </div>
  );
}

function DocumentForm({ config, patch }: FormProps) {
  return (
    <div className="flex flex-col gap-4">
      <SelectField config={config} patch={patch} fieldKey="kind" label="Document kind" required idPrefix="document" options={documentKindSchema.options} />
      <TextField config={config} patch={patch} fieldKey="docId" label="Document id" required idPrefix="document" />
      <SelectField config={config} patch={patch} fieldKey="format" label="Format" required idPrefix="document" options={["pdf", "docx"]} />
    </div>
  );
}

function ApprovalForm({ config, patch }: FormProps) {
  return (
    <div className="flex flex-col gap-4">
      <SelectField config={config} patch={patch} fieldKey="docKind" label="Document kind" required idPrefix="approval" options={documentKindSchema.options} />
      <TextField config={config} patch={patch} fieldKey="docId" label="Document id" required idPrefix="approval" />
    </div>
  );
}

function DatabaseForm({ config, patch }: FormProps) {
  return (
    <div className="flex flex-col gap-4">
      <SelectField config={config} patch={patch} fieldKey="model" label="Model" required idPrefix="database" options={queryableModelSchema.options} />
      <SelectField config={config} patch={patch} fieldKey="operation" label="Operation" required idPrefix="database" options={queryableOperationSchema.options} hint="Read-only." />
      <JsonField config={config} patch={patch} fieldKey="where" label="Where" hint='Optional — e.g. {"companyId": "..."}. organizationId is always forced by the executor.' idPrefix="database" />
      <JsonField config={config} patch={patch} fieldKey="select" label="Select" hint='Optional — e.g. {"id": true, "name": true}.' idPrefix="database" />
    </div>
  );
}

function FunctionForm({ config, patch }: FormProps) {
  return (
    <div className="flex flex-col gap-4">
      <SelectField config={config} patch={patch} fieldKey="functionName" label="Function" required idPrefix="function" options={internalFunctionNameSchema.options} />
      <JsonField config={config} patch={patch} fieldKey="args" label="Arguments" hint="Optional — e.g. {&quot;companyId&quot;: &quot;...&quot;}." idPrefix="function" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Panel shell
// ---------------------------------------------------------------------------

function formatZodIssues(error: z.ZodError): string[] {
  return error.issues.map((issue) => {
    const path = issue.path.join(".");
    return path ? `${path}: ${issue.message}` : issue.message;
  });
}

/**
 * Public entry point — a thin wrapper that just guards the null case and
 * remounts the real panel (via `key={step.id}`) on every step change. All
 * of this panel's editing state (name, config, the raw-JSON buffer, every
 * per-field JSON textarea) is local to that remount, so switching between
 * two nodes always starts from a clean, correct snapshot of the newly
 * selected step instead of leaking stale text from the previous one.
 */
export function NodePropertyPanel({ step, onClose, onSaved }: NodePropertyPanelProps) {
  if (!step) return null;
  return <NodePropertyPanelForm key={step.id} step={step} onClose={onClose} onSaved={onSaved} />;
}

function NodePropertyPanelForm({
  step,
  onClose,
  onSaved,
}: {
  step: WorkflowStepPanelData;
  onClose: () => void;
  onSaved?: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState(step.name);
  const [config, setConfig] = useState<ConfigRecord>(() => asConfigRecord(step.config));
  const [errors, setErrors] = useState<string[]>([]);
  const [rawText, setRawText] = useState(() => JSON.stringify(asConfigRecord(step.config), null, 2));
  const [rawError, setRawError] = useState<string | null>(null);

  useEffect(() => {
    function handleEscape(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [onClose]);

  const meta = NODE_TYPE_META[step.nodeType];
  const Icon = meta.icon;

  function patch(partial: ConfigRecord) {
    setConfig((prev) => {
      const next = { ...prev };
      for (const [key, value] of Object.entries(partial)) {
        if (value === undefined) delete next[key];
        else next[key] = value;
      }
      return next;
    });
  }

  function applyRawJson() {
    try {
      const parsed = JSON.parse(rawText);
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
        setRawError("Config must be a JSON object.");
        return;
      }
      setConfig(parsed as ConfigRecord);
      setRawError(null);
    } catch {
      setRawError("Invalid JSON.");
    }
  }

  function handleSave() {
    setErrors([]);

    if (name.trim() === "") {
      setErrors(["name: Give the step a name."]);
      return;
    }

    const schema = NODE_CONFIG_SCHEMAS[step.nodeType];
    const parsed = schema.safeParse(config);
    if (!parsed.success) {
      setErrors(formatZodIssues(parsed.error));
      return;
    }

    startTransition(async () => {
      const result = await updateWorkflowStepAction(step.id, { name: name.trim(), config: parsed.data as ConfigRecord });
      if (!result.ok) {
        setErrors([result.error ?? "Something went wrong."]);
        return;
      }
      router.refresh();
      onSaved?.();
    });
  }

  const hasStructuredForm = step.nodeType !== "TRIGGER";

  return (
    <motion.aside
      initial={{ x: 32, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      transition={{ duration: DURATIONS.fast }}
      className="glass-panel-strong fixed inset-y-0 right-0 z-40 flex w-full max-w-md flex-col border-l border-border shadow-elevated"
    >
      <div className="flex items-center justify-between gap-3 border-b border-border p-5">
        <div className="flex items-center gap-3">
          <span className="flex size-9 items-center justify-center rounded-lg bg-accent">
            <Icon className="size-4.5 text-foreground" />
          </span>
          <div>
            <p className="text-sm font-semibold text-foreground">{meta.label}</p>
            <Badge variant="outline" className="mt-0.5">
              {step.nodeType}
            </Badge>
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close panel">
          <X className="size-4" />
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto p-5">
        <div className="flex flex-col gap-4">
          <FormField label="Name" htmlFor="node-name" required>
            <Input id="node-name" value={name} onChange={(e) => setName(e.target.value)} />
          </FormField>

          {step.nodeType === "TRIGGER" && (
            <p className="text-sm text-muted-foreground">
              Trigger nodes have no per-node config — the workflow&apos;s trigger type and config are set at the workflow level.
            </p>
          )}

          {step.nodeType === "CONDITION" && <ConditionForm config={config} patch={patch} />}
          {step.nodeType === "DELAY" && <DelayForm config={config} patch={patch} />}
          {step.nodeType === "LOOP" && <LoopForm config={config} patch={patch} />}
          {step.nodeType === "AI_ACTION" && <AiActionForm config={config} patch={patch} />}
          {step.nodeType === "EMAIL" && <EmailForm config={config} patch={patch} />}
          {step.nodeType === "SMS" && <SmsForm config={config} patch={patch} />}
          {step.nodeType === "WEBHOOK" && <WebhookForm config={config} patch={patch} />}
          {step.nodeType === "CRM" && <CrmForm config={config} patch={patch} />}
          {step.nodeType === "PROPOSAL" && <ProposalForm config={config} patch={patch} />}
          {step.nodeType === "PROJECT" && <ProjectForm config={config} patch={patch} />}
          {step.nodeType === "APPROVAL" && <ApprovalForm config={config} patch={patch} />}
          {step.nodeType === "DOCUMENT" && <DocumentForm config={config} patch={patch} />}
          {step.nodeType === "NOTIFICATION" && <NotificationForm config={config} patch={patch} />}
          {step.nodeType === "DATABASE" && <DatabaseForm config={config} patch={patch} />}
          {step.nodeType === "FUNCTION" && <FunctionForm config={config} patch={patch} />}
          {step.nodeType === "CUSTOM_API" && <CustomApiForm config={config} patch={patch} />}

          {hasStructuredForm && (
            <details className="rounded-lg border border-border p-3">
              <summary className="cursor-pointer text-xs font-medium text-muted-foreground">Edit as raw JSON</summary>
              <div className="mt-3 flex flex-col gap-2">
                <textarea
                  value={rawText}
                  onChange={(e) => setRawText(e.target.value)}
                  rows={6}
                  className="w-full rounded-lg border border-input bg-transparent p-3 font-mono text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
                {rawError && <p className="text-xs text-destructive">{rawError}</p>}
                <Button type="button" variant="outline" size="sm" onClick={applyRawJson} className="self-start">
                  Apply JSON to form
                </Button>
              </div>
            </details>
          )}

          {errors.length > 0 && (
            <Alert variant="destructive">
              <AlertTriangle />
              <AlertTitle>Fix these before saving</AlertTitle>
              <AlertDescription>
                <ul className="list-disc pl-4">
                  {errors.map((e) => (
                    <li key={e}>{e}</li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          )}
        </div>
      </div>

      <div className="flex items-center justify-end gap-2 border-t border-border p-5">
        <Button variant="ghost" onClick={onClose} disabled={pending}>
          Cancel
        </Button>
        <Button onClick={handleSave} disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
      </div>
    </motion.aside>
  );
}
