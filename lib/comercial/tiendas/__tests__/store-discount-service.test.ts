/**
 * lib/comercial/tiendas/__tests__/store-discount-service.test.ts
 *
 * Unit tests for the store discount recommendation service.
 * Tests pure functions: resolveDiscountTier, computeDaysInStore.
 *
 * Run: npx tsx --test lib/comercial/tiendas/__tests__/store-discount-service.test.ts
 *
 * Sprint: AGENTIK-STORES-DISCOUNTS-TAB-01
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  resolveDiscountTier,
  computeDaysInStore,
  DISCOUNT_RULES,
  DISCOUNT_TIER_LABEL,
  DISCOUNT_TIER_COLOR,
  DISCOUNT_TIER_SORT_ORDER,
} from "../store-discount-types";

// ── resolveDiscountTier ─────────────────────────────────────────────────────

describe("resolveDiscountTier", () => {
  it("returns NONE for 0 days", () => {
    const r = resolveDiscountTier(0);
    assert.equal(r.tier, "NONE");
    assert.equal(r.percent, 0);
  });

  it("returns NONE for 89 days (boundary)", () => {
    const r = resolveDiscountTier(89);
    assert.equal(r.tier, "NONE");
    assert.equal(r.percent, 0);
  });

  it("returns TEN_PERCENT for 90 days (boundary)", () => {
    const r = resolveDiscountTier(90);
    assert.equal(r.tier, "TEN_PERCENT");
    assert.equal(r.percent, 10);
  });

  it("returns TEN_PERCENT for 179 days (boundary)", () => {
    const r = resolveDiscountTier(179);
    assert.equal(r.tier, "TEN_PERCENT");
    assert.equal(r.percent, 10);
  });

  it("returns THIRTY_PERCENT for 180 days (boundary)", () => {
    const r = resolveDiscountTier(180);
    assert.equal(r.tier, "THIRTY_PERCENT");
    assert.equal(r.percent, 30);
  });

  it("returns THIRTY_PERCENT for 269 days (boundary)", () => {
    const r = resolveDiscountTier(269);
    assert.equal(r.tier, "THIRTY_PERCENT");
    assert.equal(r.percent, 30);
  });

  it("returns FIFTY_PERCENT for 270 days (boundary)", () => {
    const r = resolveDiscountTier(270);
    assert.equal(r.tier, "FIFTY_PERCENT");
    assert.equal(r.percent, 50);
  });

  it("returns FIFTY_PERCENT for 364 days (boundary)", () => {
    const r = resolveDiscountTier(364);
    assert.equal(r.tier, "FIFTY_PERCENT");
    assert.equal(r.percent, 50);
  });

  it("returns SEVENTY_PERCENT for 365 days (boundary)", () => {
    const r = resolveDiscountTier(365);
    assert.equal(r.tier, "SEVENTY_PERCENT");
    assert.equal(r.percent, 70);
  });

  it("returns SEVENTY_PERCENT for 1000 days", () => {
    const r = resolveDiscountTier(1000);
    assert.equal(r.tier, "SEVENTY_PERCENT");
    assert.equal(r.percent, 70);
  });

  it("returns SIN_FECHA for null", () => {
    const r = resolveDiscountTier(null);
    assert.equal(r.tier, "SIN_FECHA");
    assert.equal(r.percent, 0);
  });
});

// ── computeDaysInStore ──────────────────────────────────────────────────────

describe("computeDaysInStore", () => {
  const now = new Date("2026-07-26T12:00:00.000Z");

  it("returns null for null entryDate", () => {
    assert.equal(computeDaysInStore(null, now), null);
  });

  it("returns null for empty string", () => {
    assert.equal(computeDaysInStore("", now), null);
  });

  it("returns null for invalid date", () => {
    assert.equal(computeDaysInStore("not-a-date", now), null);
  });

  it("returns 0 for same day", () => {
    assert.equal(computeDaysInStore("2026-07-26T00:00:00.000Z", now), 0);
  });

  it("returns 1 for yesterday", () => {
    assert.equal(computeDaysInStore("2026-07-25T12:00:00.000Z", now), 1);
  });

  it("returns 90 for 90 days ago", () => {
    const entry = new Date(now);
    entry.setDate(entry.getDate() - 90);
    assert.equal(computeDaysInStore(entry.toISOString(), now), 90);
  });

  it("returns 365 for exactly 1 year ago", () => {
    const entry = new Date(now);
    entry.setDate(entry.getDate() - 365);
    assert.equal(computeDaysInStore(entry.toISOString(), now), 365);
  });
});

// ── Discount tier constants ─────────────────────────────────────────────────

describe("Discount tier constants", () => {
  it("DISCOUNT_TIER_LABEL has all 6 tiers", () => {
    assert.equal(Object.keys(DISCOUNT_TIER_LABEL).length, 6);
    assert.equal(DISCOUNT_TIER_LABEL.NONE, "Sin descuento");
    assert.equal(DISCOUNT_TIER_LABEL.TEN_PERCENT, "10%");
    assert.equal(DISCOUNT_TIER_LABEL.SIN_FECHA, "Sin fecha");
  });

  it("DISCOUNT_TIER_COLOR has all 6 tiers", () => {
    assert.equal(Object.keys(DISCOUNT_TIER_COLOR).length, 6);
    assert.ok(DISCOUNT_TIER_COLOR.SEVENTY_PERCENT.startsWith("#"));
  });

  it("DISCOUNT_TIER_SORT_ORDER sorts highest discount first", () => {
    assert.ok(DISCOUNT_TIER_SORT_ORDER.SEVENTY_PERCENT < DISCOUNT_TIER_SORT_ORDER.FIFTY_PERCENT);
    assert.ok(DISCOUNT_TIER_SORT_ORDER.FIFTY_PERCENT < DISCOUNT_TIER_SORT_ORDER.THIRTY_PERCENT);
    assert.ok(DISCOUNT_TIER_SORT_ORDER.THIRTY_PERCENT < DISCOUNT_TIER_SORT_ORDER.TEN_PERCENT);
    assert.ok(DISCOUNT_TIER_SORT_ORDER.TEN_PERCENT < DISCOUNT_TIER_SORT_ORDER.NONE);
    assert.ok(DISCOUNT_TIER_SORT_ORDER.NONE < DISCOUNT_TIER_SORT_ORDER.SIN_FECHA);
  });
});

// ── DISCOUNT_RULES coverage ─────────────────────────────────────────────────

describe("DISCOUNT_RULES", () => {
  it("has 5 rules with no gaps", () => {
    assert.equal(DISCOUNT_RULES.length, 5);
    // First starts at 0
    assert.equal(DISCOUNT_RULES[0].minDays, 0);
    // Each rule's maxDays + 1 = next rule's minDays
    for (let i = 0; i < DISCOUNT_RULES.length - 1; i++) {
      assert.equal(DISCOUNT_RULES[i].maxDays + 1, DISCOUNT_RULES[i + 1].minDays);
    }
    // Last rule goes to Infinity
    assert.equal(DISCOUNT_RULES[DISCOUNT_RULES.length - 1].maxDays, Infinity);
  });

  it("percentages increase monotonically", () => {
    for (let i = 0; i < DISCOUNT_RULES.length - 1; i++) {
      assert.ok(DISCOUNT_RULES[i].percent <= DISCOUNT_RULES[i + 1].percent);
    }
  });
});

// ── Integration: tier resolution matches rules ──────────────────────────────

describe("Tier resolution matches DISCOUNT_RULES", () => {
  for (const rule of DISCOUNT_RULES) {
    it(`${rule.tier}: minDays=${rule.minDays} resolves correctly`, () => {
      const r = resolveDiscountTier(rule.minDays);
      assert.equal(r.tier, rule.tier);
      assert.equal(r.percent, rule.percent);
    });
    if (rule.maxDays !== Infinity) {
      it(`${rule.tier}: maxDays=${rule.maxDays} resolves correctly`, () => {
        const r = resolveDiscountTier(rule.maxDays);
        assert.equal(r.tier, rule.tier);
        assert.equal(r.percent, rule.percent);
      });
    }
  }
});
