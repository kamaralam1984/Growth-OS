/**
 * Static country reference table — real geographic reference data (each
 * country's approximate centroid), not business data. Used for country-level
 * map clustering/bubbles when a company has no precise geocoded lat/lng, and
 * for normalizing free-text "country" input in the Lead Finder filters.
 * Covers the countries this app's org-onboarding/business context most
 * commonly touches — not exhaustive of all 195 UN member states, but real
 * and accurate for every entry present.
 */
export interface CountryCentroid {
  code: string;
  name: string;
  lat: number;
  lng: number;
}

export const COUNTRY_CENTROIDS: CountryCentroid[] = [
  { code: "US", name: "United States", lat: 39.8, lng: -98.6 },
  { code: "CA", name: "Canada", lat: 56.1, lng: -106.3 },
  { code: "MX", name: "Mexico", lat: 23.6, lng: -102.6 },
  { code: "BR", name: "Brazil", lat: -14.2, lng: -51.9 },
  { code: "AR", name: "Argentina", lat: -38.4, lng: -63.6 },
  { code: "GB", name: "United Kingdom", lat: 55.4, lng: -3.4 },
  { code: "IE", name: "Ireland", lat: 53.4, lng: -8.2 },
  { code: "FR", name: "France", lat: 46.2, lng: 2.2 },
  { code: "DE", name: "Germany", lat: 51.2, lng: 10.4 },
  { code: "ES", name: "Spain", lat: 40.5, lng: -3.7 },
  { code: "PT", name: "Portugal", lat: 39.4, lng: -8.2 },
  { code: "IT", name: "Italy", lat: 41.9, lng: 12.6 },
  { code: "NL", name: "Netherlands", lat: 52.1, lng: 5.3 },
  { code: "BE", name: "Belgium", lat: 50.5, lng: 4.5 },
  { code: "CH", name: "Switzerland", lat: 46.8, lng: 8.2 },
  { code: "AT", name: "Austria", lat: 47.5, lng: 14.6 },
  { code: "SE", name: "Sweden", lat: 60.1, lng: 18.6 },
  { code: "NO", name: "Norway", lat: 60.5, lng: 8.5 },
  { code: "DK", name: "Denmark", lat: 56.3, lng: 9.5 },
  { code: "FI", name: "Finland", lat: 61.9, lng: 25.7 },
  { code: "PL", name: "Poland", lat: 51.9, lng: 19.1 },
  { code: "CZ", name: "Czech Republic", lat: 49.8, lng: 15.5 },
  { code: "RO", name: "Romania", lat: 45.9, lng: 24.9 },
  { code: "GR", name: "Greece", lat: 39.1, lng: 21.8 },
  { code: "UA", name: "Ukraine", lat: 48.4, lng: 31.2 },
  { code: "RU", name: "Russia", lat: 61.5, lng: 105.3 },
  { code: "TR", name: "Turkey", lat: 38.9, lng: 35.2 },
  { code: "AE", name: "United Arab Emirates", lat: 23.4, lng: 53.8 },
  { code: "SA", name: "Saudi Arabia", lat: 23.9, lng: 45.1 },
  { code: "QA", name: "Qatar", lat: 25.4, lng: 51.2 },
  { code: "KW", name: "Kuwait", lat: 29.3, lng: 47.5 },
  { code: "BH", name: "Bahrain", lat: 26.0, lng: 50.6 },
  { code: "OM", name: "Oman", lat: 21.5, lng: 55.9 },
  { code: "IL", name: "Israel", lat: 31.0, lng: 34.9 },
  { code: "EG", name: "Egypt", lat: 26.8, lng: 30.8 },
  { code: "ZA", name: "South Africa", lat: -30.6, lng: 22.9 },
  { code: "NG", name: "Nigeria", lat: 9.1, lng: 8.7 },
  { code: "KE", name: "Kenya", lat: -0.02, lng: 37.9 },
  { code: "MA", name: "Morocco", lat: 31.8, lng: -7.1 },
  { code: "IN", name: "India", lat: 20.6, lng: 78.9 },
  { code: "PK", name: "Pakistan", lat: 30.4, lng: 69.3 },
  { code: "BD", name: "Bangladesh", lat: 23.7, lng: 90.4 },
  { code: "CN", name: "China", lat: 35.9, lng: 104.2 },
  { code: "JP", name: "Japan", lat: 36.2, lng: 138.3 },
  { code: "KR", name: "South Korea", lat: 35.9, lng: 127.8 },
  { code: "SG", name: "Singapore", lat: 1.35, lng: 103.8 },
  { code: "MY", name: "Malaysia", lat: 4.2, lng: 101.9 },
  { code: "ID", name: "Indonesia", lat: -0.8, lng: 113.9 },
  { code: "TH", name: "Thailand", lat: 15.9, lng: 101.0 },
  { code: "VN", name: "Vietnam", lat: 14.1, lng: 108.3 },
  { code: "PH", name: "Philippines", lat: 12.9, lng: 121.8 },
  { code: "AU", name: "Australia", lat: -25.3, lng: 133.8 },
  { code: "NZ", name: "New Zealand", lat: -40.9, lng: 174.9 },
] as const;

export function getCountryCentroid(codeOrName: string): CountryCentroid | null {
  const q = codeOrName.trim().toLowerCase();
  return (
    COUNTRY_CENTROIDS.find((c) => c.code.toLowerCase() === q || c.name.toLowerCase() === q) ?? null
  );
}
