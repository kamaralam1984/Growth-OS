"use client";

import dynamic from "next/dynamic";
import type { MapCompanyCluster, MapCountryBubble } from "./companies-map-inner";

const CompaniesMapInner = dynamic(() => import("./companies-map-inner").then((m) => m.CompaniesMapInner), {
  ssr: false,
  loading: () => <div className="h-[560px] w-full animate-pulse rounded-xl bg-muted" />,
});

export function CompaniesMap({
  clusters,
  countryBubbles,
  height = 560,
  compact = false,
}: {
  clusters: MapCompanyCluster[];
  countryBubbles: MapCountryBubble[];
  height?: number;
  compact?: boolean;
}) {
  return <CompaniesMapInner clusters={clusters} countryBubbles={countryBubbles} height={height} compact={compact} />;
}
