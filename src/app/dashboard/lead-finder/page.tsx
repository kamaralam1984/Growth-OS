import { Container } from "@/components/ui/container";
import { requireActiveMembership } from "../_lib/require-membership";
import { DiscoveryPanel } from "../_components/discovery-panel";
import { SavedSearchesPanel } from "../_components/saved-searches-panel";
import { RecommendationsPanel } from "../_components/recommendations-panel";
import { listRecentSearches, listSavedSearches, listSuggestedSearches } from "../_lib/saved-search-actions";
import { getRecentRecommendations } from "@/lib/recommendations";
import { searchLeads, saveDiscoveredLeads } from "./actions";

export default async function LeadFinderPage() {
  const { membership } = await requireActiveMembership("/dashboard/lead-finder");
  const [recentSearches, savedSearches, recommendations, suggestedSearches] = await Promise.all([
    listRecentSearches("lead"),
    listSavedSearches("lead"),
    getRecentRecommendations(membership.organizationId),
    listSuggestedSearches("lead"),
  ]);

  return (
    <main className="py-8">
      <Container className="flex flex-col gap-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Lead Finder</h1>
          <p className="text-sm text-muted-foreground">
            Real, live web-search-powered lead discovery — your Sales agent searches the web, never invents a
            company. Review the results and save the ones worth pursuing straight into your pipeline.
          </p>
        </div>

        <RecommendationsPanel initialRecommendations={recommendations} />

        <DiscoveryPanel
          kind="lead"
          placeholder="e.g. mid-size manufacturing companies in Texas"
          searchAction={searchLeads}
          saveAction={saveDiscoveredLeads}
          saveLabel="Save as leads"
          recentSearches={recentSearches}
          suggestedSearches={suggestedSearches}
        />

        <SavedSearchesPanel searches={savedSearches} />
      </Container>
    </main>
  );
}
