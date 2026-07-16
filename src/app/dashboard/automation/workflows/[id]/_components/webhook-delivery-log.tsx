import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { formatRelativeTime } from "@/lib/utils";
import { listWebhookDeliveries } from "@/lib/workflows/webhooks";
import type { WebhookDelivery, WebhookDirection } from "@/generated/prisma/client";
import { RetryDeliveryButton } from "./retry-delivery-button";

const DIRECTION_VARIANT: Record<WebhookDirection, "outline" | "secondary"> = {
  INCOMING: "outline",
  OUTGOING: "secondary",
};

const DIRECTION_LABEL: Record<WebhookDirection, string> = {
  INCOMING: "IN",
  OUTGOING: "OUT",
};

function payloadPreview(payload: unknown): string {
  const json = JSON.stringify(payload);
  if (!json) return "—";
  return json.length > 80 ? `${json.slice(0, 80)}…` : json;
}

/**
 * Real delivery history for a single Webhook — every row is an actual
 * WebhookDelivery the receiver/sender path
 * (src/lib/workflows/webhooks.ts's recordWebhookDelivery) wrote, nothing
 * simulated. Matches the run-history table's badge/JSON-details visual
 * convention (src/app/dashboard/automation/workflows/[id]/runs/page.tsx)
 * rather than inventing a new one, but uses a relative timestamp — this is a
 * live delivery feed, not a historical trace.
 */
export async function WebhookDeliveryLog({
  webhookId,
  organizationId,
  canManage,
}: {
  webhookId: string;
  organizationId: string;
  canManage: boolean;
}) {
  const deliveries = await listWebhookDeliveries(webhookId, organizationId);

  if (deliveries.length === 0) {
    return (
      <Card glass>
        <CardContent className="p-6 text-center text-sm text-muted-foreground">
          No deliveries recorded yet for this webhook.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
            <th className="py-2 pr-4">Direction</th>
            <th className="py-2 pr-4">Status</th>
            <th className="py-2 pr-4">HTTP</th>
            <th className="py-2 pr-4">Attempt</th>
            <th className="py-2 pr-4">Payload</th>
            <th className="py-2 pr-4">Error</th>
            <th className="py-2 pr-4">When</th>
            <th className="py-2">Actions</th>
          </tr>
        </thead>
        <tbody>
          {deliveries.map((delivery: WebhookDelivery) => (
            <tr key={delivery.id} className="border-b border-border/60 align-top">
              <td className="py-3 pr-4">
                <Badge variant={DIRECTION_VARIANT[delivery.direction]}>{DIRECTION_LABEL[delivery.direction]}</Badge>
              </td>
              <td className="py-3 pr-4">
                <Badge variant={delivery.success ? "accent" : "default"}>
                  {delivery.success ? "SUCCESS" : "FAILED"}
                </Badge>
              </td>
              <td className="py-3 pr-4 text-muted-foreground">{delivery.statusCode ?? "—"}</td>
              <td className="py-3 pr-4 text-muted-foreground">{delivery.attempt}</td>
              <td className="max-w-xs py-3 pr-4">
                <details>
                  <summary className="cursor-pointer text-xs text-muted-foreground">
                    {payloadPreview(delivery.payload)}
                  </summary>
                  <pre className="mt-2 overflow-x-auto rounded-lg bg-muted p-3 text-xs">
                    {JSON.stringify(delivery.payload, null, 2)}
                  </pre>
                </details>
              </td>
              <td className="max-w-xs py-3 pr-4 text-red-500">{delivery.error ?? ""}</td>
              <td className="py-3 pr-4 whitespace-nowrap text-muted-foreground">
                {formatRelativeTime(delivery.createdAt)}
              </td>
              <td className="py-3">
                {canManage && !delivery.success && delivery.direction === "OUTGOING" && (
                  <RetryDeliveryButton deliveryId={delivery.id} />
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
