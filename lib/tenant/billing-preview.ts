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
import type { CommercialAgreementFull } from "./commercial-agreement-types";
import { getAgreementForMonth } from "./commercial-agreement-service";

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

/** Bundle line item — emitted ONCE when a CUSTOM_BUNDLE agreement is active. */
export interface BundleBillingLineItem {
  agreementId:        string;
  agreementType:      string;
  monthlyPriceCents:  number;
  currency:           string;
  includedModuleKeys: ModuleKey[];
  note:               string | null;
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
  /** Bundle line item — present when CUSTOM_BUNDLE is active for this period. */
  bundleLineItem:    BundleBillingLineItem | null;
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
  const now = new Date();
  const periodStr = period ?? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  const [entitlements, agreement] = await Promise.all([
    getEntitlements(organizationId),
    getAgreementForMonth(organizationId, periodStr),
  ]);

  return buildPreviewFromEntitlements(organizationId, entitlements, periodStr, agreement);
}

/**
 * Pure function: builds preview from already-loaded entitlements.
 *
 * Uses explicit month-boundary overlap — NO mid-month heuristic.
 *
 * BUNDLE BILLING PRECEDENCE (Sprint AGENTIK-CUSTOM-COMMERCIAL-AGREEMENTS-01):
 *   1. If a CUSTOM_BUNDLE agreement overlaps this period:
 *      - Emit ONE bundleLineItem with the agreement's fixed monthly price.
 *      - SUPPRESS individual charges for module keys covered by the bundle.
 *      - Individually bill active modules OUTSIDE the bundle normally.
 *   2. If no agreement: sum individual TenantModuleCommercialTerm prices.
 *
 * CRITICAL: Bundle-covered module commercial terms are NEVER mutated.
 * The individual TenantModuleCommercialTerm retains its real price.
 * Suppression happens only in billing preview output — not in data.
 * BUNDLE_MODULE_PRICE_MUTATED = false (enforced by design).
 */
export function buildPreviewFromEntitlements(
  organizationId: string,
  entitlements: ModuleEntitlement[],
  period?: string,
  agreement?: CommercialAgreementFull | null,
): BillingPreview {
  const now = new Date();
  const periodStr = period ?? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const [yearStr, monthStr] = periodStr.split("-");
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10) - 1; // 0-indexed

  const periodStart = new Date(year, month, 1);
  const periodEnd = new Date(year, month + 1, 1);

  // Determine which modules are covered by an active bundle agreement
  const coveredByBundle = new Set<string>();
  let bundleLineItem: BundleBillingLineItem | null = null;

  if (agreement && agreement.agreementType === "CUSTOM_BUNDLE") {
    for (const m of agreement.modules) {
      coveredByBundle.add(m.moduleKey);
    }
    bundleLineItem = {
      agreementId:        agreement.id,
      agreementType:      agreement.agreementType,
      monthlyPriceCents:  agreement.monthlyPriceCents,
      currency:           agreement.currency,
      includedModuleKeys: agreement.modules.map(m => m.moduleKey as ModuleKey),
      note:               agreement.note,
    };
  }

  const lineItems: BillingLineItem[] = [];

  for (const ent of entitlements) {
    const catalogEntry = getModuleCatalogEntry(ent.moduleKey);
    if (!catalogEntry || !catalogEntry.sellable) continue;

    // Skip individual billing for modules covered by the bundle
    if (coveredByBundle.has(ent.moduleKey)) continue;

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

  // Include bundle price in subtotals
  if (bundleLineItem) {
    const existing = byCurrency.get(bundleLineItem.currency) ?? { total: 0, count: 0 };
    existing.total += bundleLineItem.monthlyPriceCents;
    existing.count += 1;
    byCurrency.set(bundleLineItem.currency, existing);
  }

  // Include individual (non-covered) line items
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

  const allCurrencies = new Set<string>();
  if (bundleLineItem) allCurrencies.add(bundleLineItem.currency);
  for (const item of lineItems) allCurrencies.add(item.currency);

  return {
    organizationId,
    period:             periodStr,
    periodStart:        periodStart.toISOString(),
    periodEnd:          periodEnd.toISOString(),
    lineItems,
    bundleLineItem,
    subtotals,
    hasMixedCurrencies: allCurrencies.size > 1,
    activeModuleCount:  lineItems.length + (bundleLineItem ? bundleLineItem.includedModuleKeys.length : 0),
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
