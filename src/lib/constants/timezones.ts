import ct from "countries-and-timezones";

/**
 * Real, complete country + IANA timezone data — from the `countries-and-
 * timezones` package (itself built from the IANA tz database), not a
 * hand-curated subset like COMMON_COUNTRIES in onboarding.ts. Used by the
 * registration form's Country/Timezone pickers so every real country and
 * every real timezone is selectable, not just a curated handful.
 */

export interface CountryOption {
  code: string;
  name: string;
}

export interface TimezoneOption {
  name: string;
  label: string;
}

export interface TimezoneGroup {
  countryName: string;
  timezones: TimezoneOption[];
}

export const ALL_COUNTRIES: CountryOption[] = Object.values(ct.getAllCountries())
  .map((country) => ({ code: country.id, name: country.name }))
  .sort((a, b) => a.name.localeCompare(b.name));

/**
 * Grouped by the timezone's most relevant real country (getCountryForTimezone
 * — geographically primary, e.g. "Europe/Zurich" groups under Switzerland
 * even though Germany/Liechtenstein also observe it). Alias zones (e.g. old
 * links kept only for backward compatibility) are excluded so the list isn't
 * cluttered with duplicate offsets under the same name.
 */
export const TIMEZONE_GROUPS: TimezoneGroup[] = (() => {
  const byCountry = new Map<string, TimezoneOption[]>();

  for (const tz of Object.values(ct.getAllTimezones())) {
    if (tz.aliasOf) continue;
    const country = ct.getCountryForTimezone(tz.name);
    const countryName = country?.name ?? "Other";
    const label = `${tz.name.replace(/_/g, " ")} (UTC${tz.utcOffsetStr})`;
    const bucket = byCountry.get(countryName);
    if (bucket) bucket.push({ name: tz.name, label });
    else byCountry.set(countryName, [{ name: tz.name, label }]);
  }

  return [...byCountry.entries()]
    .map(([countryName, timezones]) => ({
      countryName,
      timezones: timezones.sort((a, b) => a.name.localeCompare(b.name)),
    }))
    .sort((a, b) => a.countryName.localeCompare(b.countryName));
})();
