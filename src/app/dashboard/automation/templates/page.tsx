import Link from "next/link";
import {
  Workflow as WorkflowIcon,
  UserPlus,
  FileCheck,
  Receipt,
  Rocket,
  Handshake,
  BarChart3,
  Sparkles,
  Users,
  LifeBuoy,
  Star,
} from "lucide-react";

import { Container } from "@/components/ui/container";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { requireActiveMembership } from "../../_lib/require-membership";
import { listAutomationTemplates } from "@/lib/workflows/templates";
import { InstallTemplateButton } from "./_components/install-template-button";

const ICONS: Record<string, typeof WorkflowIcon> = {
  "user-plus": UserPlus,
  "file-check": FileCheck,
  receipt: Receipt,
  rocket: Rocket,
  handshake: Handshake,
  "bar-chart": BarChart3,
  sparkles: Sparkles,
  users: Users,
  "life-buoy": LifeBuoy,
};

export default async function AutomationTemplatesPage() {
  const { membership } = await requireActiveMembership("/dashboard/automation/templates");
  const canManage = membership.role === "OWNER" || membership.role === "ADMIN";

  const templates = await listAutomationTemplates();
  const categories = Array.from(new Set(templates.map((t) => t.category))).sort();

  return (
    <main className="py-8">
      <Container className="flex flex-col gap-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight text-foreground">
              <WorkflowIcon className="size-5" /> Automation Templates
            </h1>
            <p className="text-sm text-muted-foreground">
              Prebuilt workflow blueprints. Installing one creates a real, editable DRAFT Workflow in{" "}
              <Link href="/dashboard/automation" className="font-medium text-primary hover:underline">
                Automation
              </Link>{" "}
              — review its steps and activate it when you&apos;re ready.
            </p>
          </div>
        </div>

        {categories.map((category) => (
          <div key={category} className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{category}</h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {templates
                .filter((t) => t.category === category)
                .map((template) => {
                  const Icon = ICONS[template.icon ?? ""] ?? WorkflowIcon;
                  return (
                    <Card key={template.id} glass>
                      <CardHeader>
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <Icon className="size-4 text-muted-foreground" />
                            <CardTitle className="text-base">{template.name}</CardTitle>
                          </div>
                          {template.popular && (
                            <Badge variant="accent" className="gap-1">
                              <Star className="size-3" /> Popular
                            </Badge>
                          )}
                        </div>
                        <CardDescription className="line-clamp-4">{template.description}</CardDescription>
                      </CardHeader>
                      <CardContent className="flex items-center justify-between gap-2">
                        <Badge variant="outline">{template.triggerType}</Badge>
                        {canManage && <InstallTemplateButton templateId={template.id} templateName={template.name} />}
                      </CardContent>
                    </Card>
                  );
                })}
            </div>
          </div>
        ))}
      </Container>
    </main>
  );
}
