"use client";

import dynamic from "next/dynamic";

const CompanyMapInner = dynamic(() => import("./company-map-inner").then((m) => m.CompanyMapInner), {
  ssr: false,
  loading: () => <div className="h-[220px] w-full animate-pulse rounded-xl bg-muted" />,
});

export function CompanyMap({ lat, lng, name, label }: { lat: number; lng: number; name: string; label?: string }) {
  return <CompanyMapInner lat={lat} lng={lng} name={name} label={label} />;
}
