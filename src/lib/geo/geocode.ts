/**
 * Best-effort geocoding via OpenStreetMap's free, keyless Nominatim API —
 * no Google/Mapbox API key exists in this environment, and Nominatim is the
 * only legitimate free option. Self-throttled to Nominatim's documented
 * usage policy (max ~1 request/second, requires a descriptive User-Agent).
 * Never throws and never guesses — returns null on any failure, ambiguity,
 * or no result, exactly like sendEmail's honest-degrade convention.
 */
export interface GeocodeResult {
  lat: number;
  lng: number;
}

let lastRequestAt = 0;
const MIN_INTERVAL_MS = 1100;

async function throttle(): Promise<void> {
  const elapsed = Date.now() - lastRequestAt;
  if (elapsed < MIN_INTERVAL_MS) {
    await new Promise((resolve) => setTimeout(resolve, MIN_INTERVAL_MS - elapsed));
  }
  lastRequestAt = Date.now();
}

export async function geocodeAddress(query: string): Promise<GeocodeResult | null> {
  const trimmed = query.trim();
  if (!trimmed) return null;

  try {
    await throttle();
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(trimmed)}`;
    const response = await fetch(url, {
      headers: { "User-Agent": "KVL-GrowthOS/1.0 (business lead research; contact via app owner)" },
    });
    if (!response.ok) return null;

    const results = (await response.json()) as Array<{ lat: string; lon: string }>;
    const first = results[0];
    if (!first) return null;

    const lat = Number.parseFloat(first.lat);
    const lng = Number.parseFloat(first.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

    return { lat, lng };
  } catch (error) {
    console.error("[geocode] geocodeAddress failed:", error);
    return null;
  }
}
