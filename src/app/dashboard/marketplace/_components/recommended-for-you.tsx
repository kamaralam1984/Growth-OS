import Link from "next/link";
import { Sparkles } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { isAnyAIProviderConfigured } from "@/lib/ai/fallback";
import { generateMarketplaceRecommendations } from "@/lib/marketplace/recommendations";

/**
 * Server component — computed inline on the catalog page load (no caching
 * layer yet; acceptable for a page loaded a handful of times a day, not a
 * high-QPS surface). Degrades to an honest "AI not connected" note when no
 * provider is configured — never fake recommendations. A generation
 * failure (e.g. all providers down) is caught and rendered as an honest
 * empty state too, never surfaced as a page-breaking error on a
 * best-effort feature.
 */
export async function RecommendedForYou({ organizationId }: { organizationId: string }) {
  if (!isAnyAIProviderConfigured()) {
    return (
      <Card glass className="border-dashed">
        <CardContent className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
          <Sparkles className="size-4" /> AI-powered recommendations need an AI provider connected — configure one to see picks tailored to your organization.
        </CardContent>
      </Card>
    );
  }

  let recommendations: Awaited<ReturnType<typeof generateMarketplaceRecommendations>> = [];
  try {
    recommendations = await generateMarketplaceRecommendations(organizationId);
  } catch (error) {
    console.error("[marketplace] recommendation generation failed:", error);
    return null; // best-effort feature — a failure here should never break the catalog page
  }

  if (recommendations.length === 0) return null;

  return (
    <Card glass>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles className="size-4 text-primary" /> Recommended for you
        </CardTitle>
        <CardDescription>AI-suggested, grounded in your organization&apos;s real industry, size, and installed listings.</CardDescription>
      </CardHeader>
      <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {recommendations.map(({ listing, reason }) => (
          <Link key={listing.id} href={listing.slug ? `/dashboard/marketplace/${listing.slug}` : "#"} className="flex flex-col gap-1 rounded-lg border border-border p-3 transition-colors hover:border-primary/40">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium text-foreground">{listing.name}</span>
              <Badge variant="outline" className="text-[10px]">
                {listing.category.replace(/_/g, " ")}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">{reason}</p>
          </Link>
        ))}
      </CardContent>
    </Card>
  );
}
