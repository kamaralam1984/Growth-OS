import Link from "next/link";
import { ArrowLeft, Map as MapIcon } from "lucide-react";

import { Container } from "@/components/ui/container";
import { Card, CardContent } from "@/components/ui/card";
import { prisma } from "@/lib/prisma";
import { requireActiveMembership } from "@/app/dashboard/_lib/require-membership";
import { getCountryCentroid } from "@/lib/geo/country-centroids";
import { CompaniesMap } from "./_components/companies-map";
import type { MapCompanyCluster, MapCountryBubble } from "./_components/companies-map-inner";

// Simple grid-bucket clustering — no extra clustering library. Rounding to 1
// decimal place groups pins within roughly ~11km of each other, which is
// plenty coarse for company-count clusters at this scale.
function clusterKey(lat: number, lng: number): string {
  return `${lat.toFixed(1)},${lng.toFixed(1)}`;
}

export default async function CompaniesMapPage() {
  const { membership } = await requireActiveMembership("/dashboard/companies/map");

  const [geocoded, ungeocodedByCountry] = await Promise.all([
    prisma.company.findMany({
      where: { organizationId: membership.organizationId, latitude: { not: null }, longitude: { not: null } },
      select: { id: true, name: true, industry: true, latitude: true, longitude: true },
    }),
    prisma.company.groupBy({
      by: ["headquartersCountry"],
      where: {
        organizationId: membership.organizationId,
        headquartersCountry: { not: null },
        OR: [{ latitude: null }, { longitude: null }],
      },
      _count: { headquartersCountry: true },
    }),
  ]);

  const clusterMap = new Map<string, MapCompanyCluster>();
  for (const company of geocoded) {
    const lat = company.latitude!;
    const lng = company.longitude!;
    const key = clusterKey(lat, lng);
    const existing = clusterMap.get(key);
    if (existing) {
      existing.companies.push({ id: company.id, name: company.name, industry: company.industry });
    } else {
      clusterMap.set(key, { lat, lng, companies: [{ id: company.id, name: company.name, industry: company.industry }] });
    }
  }
  const clusters = [...clusterMap.values()];

  const countryBubbles: MapCountryBubble[] = ungeocodedByCountry
    .map((g) => {
      const centroid = g.headquartersCountry ? getCountryCentroid(g.headquartersCountry) : null;
      if (!centroid) return null;
      return { country: centroid.name, lat: centroid.lat, lng: centroid.lng, count: g._count.headquartersCountry };
    })
    .filter((b): b is MapCountryBubble => b !== null);

  const totalPlotted = geocoded.length + countryBubbles.reduce((sum, b) => sum + b.count, 0);

  return (
    <main className="py-8">
      <Container className="flex flex-col gap-6">
        <Link
          href="/dashboard/companies"
          className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" /> Back to Companies
        </Link>

        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight text-foreground">
            <MapIcon className="size-5 text-primary" /> Map View
          </h1>
          <p className="text-sm text-muted-foreground">
            {geocoded.length} companies pinned precisely (geocoded via OpenStreetMap), {countryBubbles.length} more
            countries shown as bubbles for companies with a known country but no precise address yet —{" "}
            {totalPlotted} companies plotted in total.
          </p>
        </div>

        {clusters.length === 0 && countryBubbles.length === 0 ? (
          <Card glass>
            <CardContent className="p-8 text-center text-sm text-muted-foreground">
              No companies with a known location yet. Add a headquarters city/country on a Company Profile to see it
              here.
            </CardContent>
          </Card>
        ) : (
          <CompaniesMap clusters={clusters} countryBubbles={countryBubbles} />
        )}
      </Container>
    </main>
  );
}
