import { Container } from "@/components/ui/container";
import { requireActiveMembership } from "../_lib/require-membership";
import { DiscoveryPanel } from "../_components/discovery-panel";
import { SavedSearchesPanel } from "../_components/saved-searches-panel";
import { listRecentSearches, listSavedSearches, listSuggestedSearches } from "../_lib/saved-search-actions";
import { searchClients, saveDiscoveredClients } from "./actions";

export default async function ClientFinderPage() {
  await requireActiveMembership("/dashboard/client-finder");
  const [recentSearches, savedSearches, suggestedSearches] = await Promise.all([
    listRecentSearches("client"),
    listSavedSearches("client"),
    listSuggestedSearches("client"),
  ]);

  return (
    <main className="py-8">
      <Container className="flex flex-col gap-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Client Finder</h1>
          <p className="text-sm text-muted-foreground">
            Real, live web-search-powered ideal-client discovery — describe your ideal customer profile and your
            Sales agent searches the web for real companies that fit, never invented ones.
          </p>
        </div>

        <DiscoveryPanel
          kind="client"
          placeholder="e.g. boutique hotels in Dubai looking for digital marketing"
          searchAction={searchClients}
          saveAction={saveDiscoveredClients}
          saveLabel="Save as clients"
          recentSearches={recentSearches}
          suggestedSearches={suggestedSearches}
        />

        <SavedSearchesPanel searches={savedSearches} />
      </Container>
    </main>
  );
}
