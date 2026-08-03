/**
 * lib/comercial/tiendas/store-discount-aging-types.ts
 *
 * AGENTIK-STORES-DISCOUNTS-AGING-SOURCE-01 — Pure types & helpers
 *
 * Client-safe: NO "server-only" import.
 * Types, constants, and pure functions used by the aging service and tests.
 */

import { resolveWarehouseByPk } from "@/lib/inventory/warehouse-master";

// ── Types ────────────────────────────────────────────────────────────────────

export type AgingSource = "TRANSFER" | "SIN_FECHA";
export type AgingConfidence = "CONFIRMED" | "MISSING";

export interface StoreDiscountAgingFact {
  referenceCode: string;
  storeId: string;
  lastTransferDate: string | null;
  daysInStore: number | null;
  source: AgingSource;
  confidence: AgingConfidence;
  transferCount: number;
}

// ── Store slug ↔ kaNlBodega mapping ──────────────────────────────────────────

/**
 * Canonical storeId (slug) → kaNlBodega mapping.
 * Mirrors CANONICAL_STORE_IDENTITY in store-distribution-service.ts.
 */
export const STORE_SLUG_TO_PK: Record<string, string> = {
  centro:     "31",
  san_diego:  "11",
  gran_plaza: "32",
  caldas:     "39",
};

export const STORE_PK_TO_SLUG: Record<string, string> = Object.fromEntries(
  Object.entries(STORE_SLUG_TO_PK).map(([slug, pk]) => [pk, slug]),
);

// ── Warehouse code resolution ────────────────────────────────────────────────

/**
 * Resolve ALL warehouse codes that identify a given store in transfer records.
 * Transfer records use both kaNlBodega AND ssCodigo inconsistently,
 * so we must match on both.
 */
export function resolveStoreWarehouseCodes(storeKaNlBodega: string): Set<string> {
  const codes = new Set<string>();
  const wh = resolveWarehouseByPk(storeKaNlBodega);
  if (!wh) return codes;
  codes.add(wh.kaNlBodega);
  codes.add(wh.ssCodigo);
  return codes;
}

// ── Date validation ──────────────────────────────────────────────────────────

export function isValidTransferDate(date: Date | null | undefined): date is Date {
  if (!date) return false;
  const ts = date.getTime();
  if (isNaN(ts)) return false;
  // Reject future dates (> 1 day tolerance for timezone)
  if (ts > Date.now() + 86_400_000) return false;
  return true;
}

// ── Days calculation ─────────────────────────────────────────────────────────

export function computeDaysFromDate(transferDate: Date, now: Date): number {
  const diffMs = now.getTime() - transferDate.getTime();
  return Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
}

// ── Missing fact builder ─────────────────────────────────────────────────────

export function buildMissingFact(referenceCode: string, storeId: string): StoreDiscountAgingFact {
  return {
    referenceCode,
    storeId,
    lastTransferDate: null,
    daysInStore: null,
    source: "SIN_FECHA",
    confidence: "MISSING",
    transferCount: 0,
  };
}
