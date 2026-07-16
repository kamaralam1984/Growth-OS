import { describe, expect, it } from "vitest";

import { computeTax, resolveTaxRule } from "./tax-rates";

describe("resolveTaxRule", () => {
  it("resolves India's real 18% GST rate with reverse-charge NOT applied when the buyer has no tax id", () => {
    expect(resolveTaxRule("IN", false)).toEqual({ ruleType: "GST", ratePercent: 18, reverseCharge: false });
  });

  it("zero-rates India GST via reverse charge when the buyer supplies a valid tax id", () => {
    expect(resolveTaxRule("IN", true)).toEqual({ ruleType: "GST", ratePercent: 0, reverseCharge: true });
  });

  it("resolves the UK's real 20% VAT rate", () => {
    expect(resolveTaxRule("GB", false)).toEqual({ ruleType: "VAT", ratePercent: 20, reverseCharge: false });
  });

  it("is case-insensitive on the country code", () => {
    expect(resolveTaxRule("gb", false)).toEqual({ ruleType: "VAT", ratePercent: 20, reverseCharge: false });
  });

  it("never applies reverse charge to a country not marked reverse-charge-eligible, even with a tax id", () => {
    // AE (UAE VAT) is deliberately NOT reverse-charge-eligible in the real table.
    expect(resolveTaxRule("AE", true)).toEqual({ ruleType: "VAT", ratePercent: 5, reverseCharge: false });
  });

  it("falls back to NONE/0% for a country not in the real table", () => {
    expect(resolveTaxRule("ZZ", false)).toEqual({ ruleType: "NONE", ratePercent: 0, reverseCharge: false });
  });

  it("falls back to NONE/0% for a null/undefined country rather than guessing", () => {
    expect(resolveTaxRule(null, false)).toEqual({ ruleType: "NONE", ratePercent: 0, reverseCharge: false });
    expect(resolveTaxRule(undefined, false)).toEqual({ ruleType: "NONE", ratePercent: 0, reverseCharge: false });
  });

  it("deliberately models US sales tax as NONE/0% rather than fabricating a national rate", () => {
    expect(resolveTaxRule("US", false)).toEqual({ ruleType: "NONE", ratePercent: 0, reverseCharge: false });
  });
});

describe("computeTax", () => {
  it("computes real 18% GST on a 10000-cent (100.00) India subtotal", () => {
    expect(computeTax(10000, "IN", false)).toEqual({
      taxableCents: 10000,
      taxCents: 1800,
      totalCents: 11800,
      ratePercent: 18,
      ruleType: "GST",
      reverseCharge: false,
    });
  });

  it("zero-rates the same India subtotal under reverse charge", () => {
    expect(computeTax(10000, "IN", true)).toEqual({
      taxableCents: 10000,
      taxCents: 0,
      totalCents: 10000,
      ratePercent: 0,
      ruleType: "GST",
      reverseCharge: true,
    });
  });

  it("rounds tax to the nearest cent so totals always sum exactly", () => {
    // 333 * 0.19 = 63.27 -> rounds to 63
    const result = computeTax(333, "DE", false);
    expect(result.taxCents).toBe(63);
    expect(result.totalCents).toBe(333 + 63);
  });

  it("returns zero tax for an untaxed/unrecognized country", () => {
    expect(computeTax(50000, "US", false)).toEqual({
      taxableCents: 50000,
      taxCents: 0,
      totalCents: 50000,
      ratePercent: 0,
      ruleType: "NONE",
      reverseCharge: false,
    });
  });

  it("handles a zero subtotal without dividing by zero or throwing", () => {
    expect(computeTax(0, "GB", false)).toEqual({
      taxableCents: 0,
      taxCents: 0,
      totalCents: 0,
      ratePercent: 20,
      ruleType: "VAT",
      reverseCharge: false,
    });
  });
});
