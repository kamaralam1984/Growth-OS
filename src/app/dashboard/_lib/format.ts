/**
 * Formats a real number as currency using the organization's configured
 * currency (Organization.currency), falling back to USD if unset or
 * invalid — never fabricates an exchange rate or a different number, only
 * the display formatting varies.
 */
export function formatCurrency(value: number, currencyCode?: string | null): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: currencyCode || "USD",
      maximumFractionDigits: 0,
    }).format(value);
  } catch {
    return new Intl.NumberFormat(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
  }
}
