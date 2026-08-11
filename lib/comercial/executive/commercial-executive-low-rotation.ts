/**
 * lib/comercial/executive/commercial-executive-low-rotation.ts
 *
 * Thin canonical query: low-rotation imported products.
 *
 * Sprint: AGENTIK-COMMERCIAL-MOBILE-EXECUTIVE-B01
 *
 * BUSINESS LAW:
 *   "Referencias que lleven más de 8 meses sin registrar recompra
 *    o reingreso desde China y aún tengan inventario."
 *
 * IMPORTANT: Uses 8 CALENDAR MONTHS, NOT a fixed 240-day threshold.
 *
 * Reuses existing import-intelligence-service — no duplicate engine.
 *
 * EVIDENCE RESOLUTION (B01.1):
 *   Uses MAX(lastReceiptDate, lastPurchaseDate) — whichever is most recent.
 *   Both raw dates preserved in LowRotationImportItem for audit.
 *   Source tag reflects which date was selected as MAX.
 *   When both are null → UNAVAILABLE → SIN_FECHA_DE_ACTIVIDAD_IMPORTACION (never LOW_ROTATION)
 */

import type {
  ImportSupplyIntelligenceItem,
} from "../importaciones/import-types";

import type {
  LowRotationImportItem,
  LowRotationStatus,
  ImportActivitySource,
} from "./commercial-executive-types";

// ── Calendar month boundary ─────────────────────────────────────────────────

/**
 * Returns the date that is exactly N calendar months before `asOf`.
 *
 * NOT a fixed day count. 8 calendar months before 2026-08-11 = 2025-12-11.
 *
 * END-OF-MONTH CLAMPING (B01.1):
 *   Oct 31 - 8mo → Feb 28 (or Feb 29 in leap year), NOT Mar 3.
 *   Uses UTC to avoid timezone-induced day drift.
 */
export function calendarMonthsAgo(asOf: Date, months: number): Date {
  const year = asOf.getUTCFullYear();
  const month = asOf.getUTCMonth();
  const day = asOf.getUTCDate();

  const targetMonth = month - months;
  const d = new Date(Date.UTC(year, targetMonth, 1));

  // Clamp day to last day of target month
  const lastDayOfTarget = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, lastDayOfTarget));

  return d;
}

// ── Main query ──────────────────────────────────────────────────────────────

export interface LowRotationQueryParams {
  asOf?: Date;
  monthsWithoutActivity?: number;
}

/**
 * Filters import intelligence items into low-rotation classification.
 *
 * Consumes already-computed items from buildImportSupplyIntelligence().
 * No duplicate DB queries or engine runs.
 */
export function getLowRotationImportedProducts(
  items: ImportSupplyIntelligenceItem[],
  params?: LowRotationQueryParams,
): LowRotationImportItem[] {
  const asOf = params?.asOf ?? new Date();
  const months = params?.monthsWithoutActivity ?? 8;
  const cutoff = calendarMonthsAgo(asOf, months);

  return items
    .filter(i => i.remaining > 0)
    .map(i => classifyLowRotation(i, cutoff, asOf))
    .sort((a, b) => {
      // Sort: LOW_ROTATION first, then by monthsSinceLastActivity desc
      const statusOrder: Record<LowRotationStatus, number> = {
        LOW_ROTATION: 0,
        SIN_FECHA_DE_ACTIVIDAD_IMPORTACION: 1,
        NORMAL: 2,
        SIN_STOCK: 3,
      };
      const diff = statusOrder[a.rotationStatus] - statusOrder[b.rotationStatus];
      if (diff !== 0) return diff;
      return (b.monthsSinceLastActivity ?? 999) - (a.monthsSinceLastActivity ?? 999);
    });
}

// ── Classification ──────────────────────────────────────────────────────────

function classifyLowRotation(
  item: ImportSupplyIntelligenceItem,
  cutoff: Date,
  asOf: Date,
): LowRotationImportItem {
  // Raw evidence dates
  const receiptDate = item.lastEntryDate ?? null;
  const purchaseDate = item.lastPurchaseSag ?? null;

  // MAX(receipt, purchase) — whichever is most recent
  const { resolvedDate, resolvedSource } = resolveMaxActivityDate(receiptDate, purchaseDate);

  let rotationStatus: LowRotationStatus;
  let monthsSinceLastActivity: number | null = null;

  if (item.remaining <= 0) {
    rotationStatus = "SIN_STOCK";
  } else if (resolvedSource === "UNAVAILABLE") {
    rotationStatus = "SIN_FECHA_DE_ACTIVIDAD_IMPORTACION";
  } else if (resolvedDate) {
    const activityDate = new Date(resolvedDate);
    monthsSinceLastActivity = monthsBetween(activityDate, asOf);

    if (activityDate < cutoff) {
      rotationStatus = "LOW_ROTATION";
    } else {
      rotationStatus = "NORMAL";
    }
  } else {
    rotationStatus = "SIN_FECHA_DE_ACTIVIDAD_IMPORTACION";
  }

  return {
    reference: item.reference,
    description: item.description,
    currentInventory: item.remaining,
    lastImportActivityDate: resolvedDate,
    lastImportActivitySource: resolvedSource,
    monthsSinceLastActivity,
    inventoryValue: item.capitalInmovilizado,
    lastSaleDate: item.lastSaleSag,
    sales90d: estimateSales90d(item),
    sales180d: item.salesTotal6m,
    rotationStatus,
    costo: item.costo,
    lastReceiptDate: receiptDate,
    lastPurchaseDate: purchaseDate,
  };
}

/**
 * Resolves import activity date using MAX(receipt, purchase).
 *
 * B01.1: Both dates are considered equally. The most recent wins.
 * Source tag reflects which date was selected.
 */
function resolveMaxActivityDate(
  receiptDate: string | null,
  purchaseDate: string | null,
): { resolvedDate: string | null; resolvedSource: ImportActivitySource } {
  if (!receiptDate && !purchaseDate) {
    return { resolvedDate: null, resolvedSource: "UNAVAILABLE" };
  }
  if (!purchaseDate) {
    return { resolvedDate: receiptDate, resolvedSource: "SAG_RECEIPT_C1_C2" };
  }
  if (!receiptDate) {
    return { resolvedDate: purchaseDate, resolvedSource: "SAG_LAST_PURCHASE" };
  }
  // Both exist — take the most recent
  if (receiptDate >= purchaseDate) {
    return { resolvedDate: receiptDate, resolvedSource: "SAG_RECEIPT_C1_C2" };
  }
  return { resolvedDate: purchaseDate, resolvedSource: "SAG_LAST_PURCHASE" };
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function monthsBetween(from: Date, to: Date): number {
  return (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth());
}

/**
 * Estimate 90-day sales from 180-day sales (half, rounded).
 * When monthly breakdown is available, this should use actual 90d window.
 */
function estimateSales90d(item: ImportSupplyIntelligenceItem): number {
  return Math.round(item.salesTotal6m / 2);
}
