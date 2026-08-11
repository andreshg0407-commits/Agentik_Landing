/**
 * lib/tenant/billing-preview.ts
 *
 * Monthly billing preview — period-aware, multi-currency, integer cents.
 *
 * Sprint: AGENTIK-TENANT-MODULE-ENTITLEMENTS-BILLING-01
 *
 * Resolves billing truth for a specific month using:
 *   entitlement billing period ∩ commercial term effective period
 *
 * NOT current TenantModule.enabled alone — historical months use historical state.
 *
 * Multi-currency: if mixed currencies, items are grouped per currency.
 * DO NOT sum across currencies.
 *
 * V1 BILLING LAW:
 *   - NO daily proration.
 *   - NO mid-month heuristic. MID_MONTH_HEURISTIC_AFTER = false.
 *   - ACCESS can be activated any day. BILLING starts on an explicit month boundary.
 *   - A module is billable for a month if its billing-effective period OVERLAPS
 *     with the billing month [periodStart, periodEnd).
 *   - Overlap test: entitlement.effectiveFrom < periodEnd AND
 *     (entitlement.effectiveTo is null OR entitlement.effectiveTo > periodStart).
 *   - Same overlap test for commercial term effective period.
 *
 * This is a READ-ONLY preview — no charges, invoices, or payment processing.
 */

import type { ModuleKey } from "./modules";
import { getModuleCatalogEntry } from "./module-catalog";
import {
  getEntitlements,
  type CommercialTerm,
  type EntitlementPeriod,
  type ModuleEntitlement,
} from "./module-entitlements";

// ── Types ────────────────────────────────────────────────────────────────────

export interface BillingLineItem {
  moduleKey:                  ModuleKey;
  moduleName:                 string;
  monthlyPriceCents:          number;
  currency:                   string;
  commercialTermEffectiveFrom: string;
  commercialTermEffectiveTo:   string | null;
  entitlementEffectiveFrom:    string;
  entitlementEffectiveTo:      string | null;
}

export interface CurrencySubtotal {
  currency:      string;
  subtotalCents: number;
  itemCount:     number;
}

export interface BillingPreview {
  organizationId:    string;
  /** YYYY-MM period string. */
  period:            string;
  /** ISO date string for period start (first day of month). */
  periodStart:       string;
  /** ISO date string for period end (first day of next month). */
  periodEnd:         string;
  /** Line items for each billable module in this period. */
  lineItems:         BillingLineItem[];
  /** Subtotals grouped by currency. Never sums across currencies. */
  subtotals:         CurrencySubtotal[];
  /** True if line items span more than one currency. */
  hasMixedCurrencies: boolean;
  /** Total active billable module count. */
  activeModuleCount: number;
}

// ── Month-boundary overlap helpers ──────────────────────────────────────────

/**
 * Returns true if a period [effectiveFrom, effectiveTo) overlaps with
 * the billing month [monthStart, monthEnd).
 *
 * No mid-month heuristic. Pure interval overlap.
 */
function periodsOverlap(
  effectiveFrom: string,
  effectiveTo: string | null,
  monthStart: Date,
  monthEnd: Date,
): boolean {
  const from = new Date(effectiveFrom).getTime();
  const to = effectiveTo ? new Date(effectiveTo).getTime() : Infinity;
  return from < monthEnd.getTime() && to > monthStart.getTime();
}

/**
 * Find the commercial term whose effective period overlaps with the billing month.
 * Returns the LAST matching term (most recent) if multiple overlap.
 */
function findTermForMonth(
  terms: CommercialTerm[],
  monthStart: Date,
  monthEnd: Date,
): CommercialTerm | null {
  // terms are ordered by effectiveFrom ASC — take the last overlapping one
  let best: CommercialTerm | null = null;
  for (const t of terms) {
    if (periodsOverlap(t.effectiveFrom, t.effectiveTo, monthStart, monthEnd)) {
      best = t;
    }
  }
  return best;
}

/**
 * Find the entitlement period that overlaps with the billing month.
 * Returns the LAST matching period if multiple overlap.
 */
function findPeriodForMonth(
  periods: EntitlementPeriod[],
  monthStart: Date,
  monthEnd: Date,
): EntitlementPeriod | null {
  let best: EntitlementPeriod | null = null;
  for (const p of periods) {
    if (periodsOverlap(p.effectiveFrom, p.effectiveTo, monthStart, monthEnd)) {
      best = p;
    }
  }
  return best;
}

// ── Preview generation ───────────────────────────────────────────────────────

/**
 * Generates a monthly billing preview for an organization.
 *
 * Resolves truth for the specified period using entitlement periods
 * and commercial terms that overlap the billing month boundary.
 *
 * @param organizationId  The org's DB id.
 * @param period          YYYY-MM string (e.g. "2026-08"). Defaults to current month.
 */
export async function generateBillingPreview(
  organizationId: string,
  period?: string,
): Promise<BillingPreview> {
  const entitlements = await getEntitlements(organizationId);
  return buildPreviewFromEntitlements(organizationId, entitlements, period);
}

/**
 * Pure function: builds preview from already-loaded entitlements.
 *
 * Uses explicit month-boundary overlap — NO mid-month heuristic.
 */
export function buildPreviewFromEntitlements(
  organizationId: string,
  entitlements: ModuleEntitlement[],
  period?: string,
): BillingPreview {
  const now = new Date();
  const periodStr = period ?? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const [yearStr, monthStr] = periodStr.split("-");
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10) - 1; // 0-indexed

  const periodStart = new Date(year, month, 1);
  const periodEnd = new Date(year, month + 1, 1);

  const lineItems: BillingLineItem[] = [];

  for (const ent of entitlements) {
    const catalogEntry = getModuleCatalogEntry(ent.moduleKey);
    if (!catalogEntry || !catalogEntry.sellable) continue;

    // Was there an active entitlement period overlapping this month?
    const activePeriod = findPeriodForMonth(ent.entitlementPeriods, periodStart, periodEnd);
    if (!activePeriod) continue;

    // Was there a commercial term effective overlapping this month?
    const effectiveTerm = findTermForMonth(ent.termHistory, periodStart, periodEnd);
    if (!effectiveTerm) continue;

    lineItems.push({
      moduleKey:                   ent.moduleKey,
      moduleName:                  catalogEntry.name,
      monthlyPriceCents:           effectiveTerm.monthlyPriceCents,
      currency:                    effectiveTerm.currency,
      commercialTermEffectiveFrom: effectiveTerm.effectiveFrom,
      commercialTermEffectiveTo:   effectiveTerm.effectiveTo,
      entitlementEffectiveFrom:    activePeriod.effectiveFrom,
      entitlementEffectiveTo:      activePeriod.effectiveTo,
    });
  }

  // Group subtotals by currency — NEVER sum across currencies
  const byCurrency = new Map<string, { total: number; count: number }>();
  for (const item of lineItems) {
    const existing = byCurrency.get(item.currency) ?? { total: 0, count: 0 };
    existing.total += item.monthlyPriceCents;
    existing.count += 1;
    byCurrency.set(item.currency, existing);
  }

  const subtotals: CurrencySubtotal[] = [];
  for (const [currency, data] of byCurrency.entries()) {
    subtotals.push({
      currency,
      subtotalCents: data.total,
      itemCount:     data.count,
    });
  }

  const currencies = new Set(lineItems.map(i => i.currency));

  return {
    organizationId,
    period:             periodStr,
    periodStart:        periodStart.toISOString(),
    periodEnd:          periodEnd.toISOString(),
    lineItems,
    subtotals,
    hasMixedCurrencies: currencies.size > 1,
    activeModuleCount:  lineItems.length,
  };
}

// ── Display helpers ──────────────────────────────────────────────────────────

/** Formats cents as currency string: (4900, "USD") → "$49.00", (4900, "COP") → "COP 49.00" */
export function formatCents(cents: number, currency: string): string {
  const major = Math.floor(cents / 100);
  const minor = cents % 100;
  const formatted = `${major}.${String(minor).padStart(2, "0")}`;
  if (currency === "USD") return `$${formatted}`;
  return `${currency} ${formatted}`;
}
