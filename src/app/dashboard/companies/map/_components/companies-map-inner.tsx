"use client";

import Link from "next/link";
import { MapContainer, TileLayer, Marker, CircleMarker, Popup } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

const markerIcon = L.icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

export interface MapCompanyCluster {
  lat: number;
  lng: number;
  companies: Array<{ id: string; name: string; industry: string | null }>;
}

export interface MapCountryBubble {
  country: string;
  lat: number;
  lng: number;
  count: number;
}

export function CompaniesMapInner({
  clusters,
  countryBubbles,
  height = 560,
  compact = false,
}: {
  clusters: MapCompanyCluster[];
  countryBubbles: MapCountryBubble[];
  /** Map height in pixels — defaults to the full Map View page's 560px. */
  height?: number;
  /** Smaller zoom/marker footprint for embedding on dense pages like Analytics. */
  compact?: boolean;
}) {
  return (
    <MapContainer
      center={[20, 0]}
      zoom={compact ? 1 : 2}
      style={{ height: `${height}px`, width: "100%", borderRadius: "0.75rem" }}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      {countryBubbles.map((bubble) => (
        <CircleMarker
          key={bubble.country}
          center={[bubble.lat, bubble.lng]}
          radius={Math.min((compact ? 4 : 6) + Math.sqrt(bubble.count) * (compact ? 3 : 4), compact ? 28 : 40)}
          pathOptions={{ color: "#6366f1", fillColor: "#6366f1", fillOpacity: 0.25, weight: 1 }}
        >
          <Popup>
            <strong>{bubble.country}</strong>
            <br />
            {bubble.count} compan{bubble.count === 1 ? "y" : "ies"} (country-level, no precise pin yet)
          </Popup>
        </CircleMarker>
      ))}

      {clusters.map((cluster, i) => (
        <Marker key={i} position={[cluster.lat, cluster.lng]} icon={markerIcon}>
          <Popup>
            <div className="flex flex-col gap-1">
              {cluster.companies.length > 1 && (
                <strong>
                  {cluster.companies.length} companies near here
                </strong>
              )}
              {cluster.companies.slice(0, 10).map((c) => (
                <Link key={c.id} href={`/dashboard/companies/${c.id}`} className="text-primary hover:underline">
                  {c.name}
                  {c.industry ? ` — ${c.industry}` : ""}
                </Link>
              ))}
            </div>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
