/**
 * Real current-weather lookup for the WEATHER dashboard widget, via the
 * OpenWeatherMap Current Weather API. Gated behind WEATHER_API_KEY using the
 * same "only register what's configured" convention as
 * src/lib/outreach/email-provider.ts (RESEND_API_KEY/EMAIL_SERVER) and the
 * OAuth providers in src/auth.ts — no fetch is even attempted without a key,
 * and no fabricated temperature/condition is ever returned on failure.
 */

export type WeatherResult =
  | { ok: true; tempC: number; condition: string; city: string; iconCode?: string }
  | { ok: false; reason: "not_configured" | "fetch_failed" };

interface OpenWeatherMapResponse {
  main: { temp: number };
  weather: Array<{ description: string; icon: string }>;
  name: string;
}

export async function getWeather(city: string): Promise<WeatherResult> {
  const apiKey = process.env.WEATHER_API_KEY;
  if (!apiKey) return { ok: false, reason: "not_configured" };

  try {
    const url = `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(city)}&appid=${apiKey}&units=metric`;
    const response = await fetch(url);
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      console.error(`[weather] OpenWeatherMap rejected the request for "${city}" (HTTP ${response.status}): ${body.slice(0, 200)}`);
      return { ok: false, reason: "fetch_failed" };
    }

    const data = (await response.json()) as OpenWeatherMapResponse;
    return {
      ok: true,
      tempC: data.main.temp,
      condition: data.weather[0]?.description ?? "Unknown",
      city: data.name || city,
      iconCode: data.weather[0]?.icon,
    };
  } catch (error) {
    console.error(`[weather] Fetch failed for "${city}":`, error);
    return { ok: false, reason: "fetch_failed" };
  }
}
