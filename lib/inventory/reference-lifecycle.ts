/**
 * lib/inventory/reference-lifecycle.ts
 *
 * COMERCIAL-INVENTORY-LIFECYCLE-AND-WAREHOUSE-INTELLIGENCE-02 — FASEs 2, 3, 4
 *
 * Reference lifecycle state engine.
 *
 * The commercial lifecycle of a product reference is determined by:
 *   lastRelevantActivityAt = max(lastModifiedAt, lastSaleDate)
 *
 * NOT by createdAt. NOT by Prisma updatedAt.
 *
 * Data sources:
 *   lastModifiedAt → ProductEntity.lastModifiedSag (dd_fecha_ult_modificacion)
 *   lastSaleDate   → ProductEntity.lastSaleSag     (d_ultima_venta)
 *
 * No Prisma. No React. No server-only. Pure logic.
 */

import {
  isCommercialTextileWarehouse,
  isCommercialAvailableImportWarehouse,
  isExcludedWarehouse,
} from "./warehouse-master";

// ── Types ───────────────────────────────────────────────────────────────────

export type ReferenceLifecycleState =
  | "ACTIVE"
  | "LOW_ACTIVITY"
  | "DORMANT"
  | "ARCHIVE_REVIEW"
  | "NO_ACTIVITY_DATA";

export type ActivityRecencyBucket =
  | "0_30"
  | "31_90"
  | "91_180"
  | "181_365"
  | "OVER_365";

export type InventoryAgeBucket = ActivityRecencyBucket;

export interface LifecycleInput {
  lastModifiedAt: Date | null;
  lastSaleDate: Date | null;
}

export interface LifecycleResult {
  lastRelevantActivityAt: Date | null;
  inactivityDays: number | null;
  lifecycleState: ReferenceLifecycleState;
  activityRecencyBucket: ActivityRecencyBucket | null;
}

/** Dormant reference record for review vault */
export interface DormantReferenceRecord {
  productId: string;
  reference: string;
  description: string | null;
  line: string | null;
  group: string | null;
  subgroup: string | null;
  available: number;
  warehouseBreakdown: { warehouseId: string; ssCodigo: string | null; ssNombre: string | null; qty: number }[];
  lastModifiedAt: Date | null;
  lastSaleDate: Date | null;
  lastRelevantActivityAt: Date | null;
  inactivityDays: number | null;
  lifecycleState: ReferenceLifecycleState;
  reason: string;
  dataQualityFlags: string[];
}

/** Derived intelligence fields for reference analysis (FASE 4) */
export interface ReferenceActivityIntelligence {
  daysSinceLastSale: number | null;
  daysSinceLastModification: number | null;
  daysSinceLastRelevantActivity: number | null;
  commercialActivityScore: number;
  inventoryFreshness: "FRESH" | "AGING" | "STALE" | "UNKNOWN";
  commercialEligibility: "ELIGIBLE" | "INELIGIBLE" | "REVIEW";
  inventoryAgeBucket: InventoryAgeBucket | null;
  activityRecencyBucket: ActivityRecencyBucket | null;
}

// ── Constants ───────────────────────────────────────────────────────────────

/** 0–180 days = ACTIVE */
export const REFERENCE_ACTIVE_WINDOW_DAYS = 180;

/** 181–365 days = LOW_ACTIVITY */
export const REFERENCE_LOW_ACTIVITY_WINDOW_DAYS = 365;

/** >365 days = DORMANT. Beyond 730 days (2 years) = ARCHIVE_REVIEW */
export const REFERENCE_ARCHIVE_REVIEW_DAYS = 730;

// ── Core lifecycle resolution ───────────────────────────────────────────────

/**
 * Resolve the last relevant commercial activity date.
 * Takes the most recent between lastModifiedAt and lastSaleDate.
 * Ignores createdAt. Ignores Prisma updatedAt.
 */
export function resolveLastRelevantActivity(input: LifecycleInput): Date | null {
  const { lastModifiedAt, lastSaleDate } = input;
  if (!lastModifiedAt && !lastSaleDate) return null;
  if (!lastModifiedAt) return lastSaleDate;
  if (!lastSaleDate) return lastModifiedAt;
  return lastModifiedAt > lastSaleDate ? lastModifiedAt : lastSaleDate;
}

/**
 * Compute the lifecycle state for a reference.
 *
 * States:
 *   ACTIVE         — activity within last 180 days
 *   LOW_ACTIVITY   — activity between 181–365 days ago
 *   DORMANT        — activity between 366–730 days ago
 *   ARCHIVE_REVIEW — no activity for >730 days (extreme dormancy)
 *   NO_ACTIVITY_DATA — no dates available at all
 *
 * @param now - current date (injectable for testing)
 */
export function resolveLifecycleState(
  input: LifecycleInput,
  now: Date = new Date(),
): LifecycleResult {
  const lastRelevantActivityAt = resolveLastRelevantActivity(input);

  if (!lastRelevantActivityAt) {
    return {
      lastRelevantActivityAt: null,
      inactivityDays: null,
      lifecycleState: "NO_ACTIVITY_DATA",
      activityRecencyBucket: null,
    };
  }

  const diffMs = now.getTime() - lastRelevantActivityAt.getTime();
  const inactivityDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  let lifecycleState: ReferenceLifecycleState;
  if (inactivityDays <= REFERENCE_ACTIVE_WINDOW_DAYS) {
    lifecycleState = "ACTIVE";
  } else if (inactivityDays <= REFERENCE_LOW_ACTIVITY_WINDOW_DAYS) {
    lifecycleState = "LOW_ACTIVITY";
  } else if (inactivityDays <= REFERENCE_ARCHIVE_REVIEW_DAYS) {
    lifecycleState = "DORMANT";
  } else {
    lifecycleState = "ARCHIVE_REVIEW";
  }

  return {
    lastRelevantActivityAt,
    inactivityDays,
    lifecycleState,
    activityRecencyBucket: classifyRecencyBucket(inactivityDays),
  };
}

// ── Bucket classification ───────────────────────────────────────────────────

export function classifyRecencyBucket(days: number): ActivityRecencyBucket {
  if (days <= 30) return "0_30";
  if (days <= 90) return "31_90";
  if (days <= 180) return "91_180";
  if (days <= 365) return "181_365";
  return "OVER_365";
}

// ── Intelligence fields (FASE 4) ────────────────────────────────────────────

export function computeActivityIntelligence(
  input: LifecycleInput,
  now: Date = new Date(),
): ReferenceActivityIntelligence {
  const { lastModifiedAt, lastSaleDate } = input;
  const lastRelevant = resolveLastRelevantActivity(input);
  const lifecycle = resolveLifecycleState(input, now);

  const daysSince = (d: Date | null): number | null => {
    if (!d) return null;
    return Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
  };

  const daysSinceLastRelevantActivity = daysSince(lastRelevant);

  // commercialActivityScore: 100 = just active, 0 = extremely dormant
  let commercialActivityScore = 0;
  if (daysSinceLastRelevantActivity !== null) {
    commercialActivityScore = Math.max(0, Math.min(100,
      Math.round(100 - (daysSinceLastRelevantActivity / REFERENCE_ARCHIVE_REVIEW_DAYS) * 100),
    ));
  }

  // inventoryFreshness derived from lifecycle state
  let inventoryFreshness: ReferenceActivityIntelligence["inventoryFreshness"];
  switch (lifecycle.lifecycleState) {
    case "ACTIVE": inventoryFreshness = "FRESH"; break;
    case "LOW_ACTIVITY": inventoryFreshness = "AGING"; break;
    case "DORMANT":
    case "ARCHIVE_REVIEW": inventoryFreshness = "STALE"; break;
    default: inventoryFreshness = "UNKNOWN"; break;
  }

  // commercialEligibility: quick classification (full check is isCommerciallyEligibleReference)
  let commercialEligibility: ReferenceActivityIntelligence["commercialEligibility"];
  if (lifecycle.lifecycleState === "ACTIVE") {
    commercialEligibility = "ELIGIBLE";
  } else if (lifecycle.lifecycleState === "LOW_ACTIVITY") {
    commercialEligibility = "REVIEW";
  } else {
    commercialEligibility = "INELIGIBLE";
  }

  return {
    daysSinceLastSale: daysSince(lastSaleDate),
    daysSinceLastModification: daysSince(lastModifiedAt),
    daysSinceLastRelevantActivity,
    commercialActivityScore,
    inventoryFreshness,
    commercialEligibility,
    inventoryAgeBucket: daysSinceLastRelevantActivity !== null
      ? classifyRecencyBucket(daysSinceLastRelevantActivity)
      : null,
    activityRecencyBucket: daysSinceLastRelevantActivity !== null
      ? classifyRecencyBucket(daysSinceLastRelevantActivity)
      : null,
  };
}

// ── Commercial eligibility (FASE 2) — 7 conditions ─────────────────────────

export interface CommercialEligibilityInput {
  lifecycleState: ReferenceLifecycleState;
  productLine: string | null;
  status: string | null;
  totalPositiveStock: number;
  warehouseIds: string[];
  hasActiveOP: boolean;
  hasPendingOrders: boolean;
}

export interface CommercialEligibilityResult {
  eligible: boolean;
  reasons: string[];
}

/**
 * Full commercial eligibility check with 7 conditions.
 *
 * A reference is commercially eligible when ALL of:
 *   1. lifecycleState is ACTIVE or LOW_ACTIVITY
 *   2. productLine is commercial (not "5" = import-only line in Castillitos context)
 *   3. status is not "archived"
 *   4. totalPositiveStock > 0 in at least one commercial warehouse
 *   5. At least one warehouseId is a commercial warehouse (textile or available-import)
 *   6. No warehouse is EXCLUDED
 *   7. No critical data conflict (dates alone are insufficient — stock must exist)
 *
 * References with LOW_ACTIVITY + stock + commercial warehouse are still eligible
 * (they're aging but sellable). DORMANT and ARCHIVE_REVIEW are not.
 */
export function isCommerciallyEligibleReference(
  input: CommercialEligibilityInput,
): CommercialEligibilityResult {
  const reasons: string[] = [];

  // 1. Lifecycle must be ACTIVE or LOW_ACTIVITY
  if (input.lifecycleState !== "ACTIVE" && input.lifecycleState !== "LOW_ACTIVITY") {
    reasons.push(`Lifecycle ${input.lifecycleState} — not commercially active`);
  }

  // 2. Product line must be commercial (not import-only "5")
  if (input.productLine === "5") {
    reasons.push("Product line 5 (import-only) — not textile commercial");
  }

  // 3. Not archived
  if (input.status === "archived") {
    reasons.push("Product archived");
  }

  // 4. Must have positive stock
  if (input.totalPositiveStock <= 0) {
    reasons.push("No positive stock in any warehouse");
  }

  // 5. At least one commercial warehouse (textile or available-import)
  const hasCommercialWarehouse = input.warehouseIds.some(
    wh => isCommercialTextileWarehouse(wh) || isCommercialAvailableImportWarehouse(wh),
  );
  if (!hasCommercialWarehouse) {
    reasons.push("No stock in commercial warehouses (only production/staging/containers)");
  }

  // 6. No EXCLUDED warehouse should be the only source
  const allExcluded = input.warehouseIds.length > 0 &&
    input.warehouseIds.every(wh => isExcludedWarehouse(wh));
  if (allExcluded) {
    reasons.push("All stock in excluded warehouses");
  }

  // 7. Stock must exist — dates alone are insufficient
  if (input.totalPositiveStock <= 0 && !input.hasActiveOP && !input.hasPendingOrders) {
    // Only add if not already covered by condition 4
    if (!reasons.some(r => r.startsWith("No positive stock"))) {
      reasons.push("No stock, no active OP, no pending orders — commercially inert");
    }
  }

  return {
    eligible: reasons.length === 0,
    reasons,
  };
}

// ── Legacy compatibility shim ───────────────────────────────────────────────

/**
 * Simple lifecycle-only eligibility check.
 * @deprecated Use isCommerciallyEligibleReference() for full 7-condition check.
 */
export function isEligibleForCommercialInventory(
  lifecycleState: ReferenceLifecycleState,
): boolean {
  return lifecycleState === "ACTIVE" || lifecycleState === "LOW_ACTIVITY";
}
