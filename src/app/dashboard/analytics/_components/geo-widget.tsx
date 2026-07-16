import Link from "next/link";

import { prisma } from "@/lib/prisma";
import { getCountryCentroid } from "@/lib/geo/country-centroids";
import { CompaniesMap } from "@/app/dashboard/companies/map/_components/companies-map";
import type { MapCompanyCluster, MapCountryBubble } from "@/app/dashboard/companies/map/_components/companies-map-inner";

// Same grid-bucket clustering as the full Map View page — rounding to 1
// decimal place groups pins within roughly ~11km of each other.
function clusterKey(lat: number, lng: number): string {
  return `${lat.toFixed(1)},${lng.toFixed(1)}`;
}

/** Compact reuse of the existing Leaflet company map (see /dashboard/companies/map) embedded directly on Analytics, not just linked to. */
export async function GeoWidget({ organizationId }: { organizationId: string }) {
  const [geocoded, ungeocodedByCountry] = await Promise.all([
    prisma.company.findMany({
      where: { organizationId, latitude: { not: null }, longitude: { not: null } },
      select: { id: true, name: true, industry: true, latitude: true, longitude: true },
    }),
    prisma.company.groupBy({
      by: ["headquartersCountry"],
      where: {
        organizationId,
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

  if (clusters.length === 0 && countryBubbles.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        No companies with a known location yet. Add a headquarters city/country on a Company Profile to see it here.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <CompaniesMap clusters={clusters} countryBubbles={countryBubbles} height={320} compact />
      <p className="text-xs text-muted-foreground">
        {totalPlotted} companies plotted ·{" "}
        <Link href="/dashboard/companies/map" className="text-primary hover:underline">
          Open full map
        </Link>
      </p>
    </div>
  );
}
