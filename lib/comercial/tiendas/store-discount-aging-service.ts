/**
 * lib/comercial/tiendas/store-discount-aging-service.ts
 *
 * AGENTIK-STORES-DISCOUNTS-AGING-SOURCE-01 — Store Discount Aging Resolver
 *
 * Resolves real inventory aging per (storeId, referenceCode) from
 * InventoryTransfer records (SAG MOVIMIENTOS fuente 34/206).
 *
 * Decisions:
 *   D1: Uses LAST transfer INTO store (MAX documentDate)
 *   D2: Inter-store transfers reset aging in destination
 *   D3: Evaluation per reference (not per variant/FIFO)
 *   D4: No fallback to createdAtSag — missing = SIN_FECHA
 *
 * Architecture:
 *   - Batch query: one DB read per store (no N+1)
 *   - Uses warehouse-master for dual-code resolution (kaNlBodega + ssCodigo)
 *   - Pure facts — no policy, no tier, no percentage
 *   - Server-only (Prisma dependency)
 */

import "server-only";

import { prisma } from "@/lib/prisma";
import {
  STORE_SLUG_TO_PK,
  resolveStoreWarehouseCodes,
  isValidTransferDate,
  computeDaysFromDate,
  buildMissingFact,
} from "./store-discount-aging-types";

// Re-export types and helpers for consumers
export type {
  AgingSource,
  AgingConfidence,
  StoreDiscountAgingFact,
} from "./store-discount-aging-types";

export {
  STORE_SLUG_TO_PK,
  STORE_PK_TO_SLUG,
  resolveStoreWarehouseCodes,
  isValidTransferDate,
  computeDaysFromDate,
  buildMissingFact,
} from "./store-discount-aging-types";

// ── Batch loader ─────────────────────────────────────────────────────────────

/**
 * Load aging facts for a batch of references in a single store.
 *
 * One DB query — groups by referenceCode and takes MAX(documentDate).
 * References not found in any transfer get source=SIN_FECHA.
 */
export async function loadStoreDiscountAgingFacts(
  orgId: string,
  storeId: string,
  referenceCodes: string[],
): Promise<Map<string, import("./store-discount-aging-types").StoreDiscountAgingFact>> {
  const result = new Map<string, import("./store-discount-aging-types").StoreDiscountAgingFact>();
  if (referenceCodes.length === 0) return result;

  const pk = STORE_SLUG_TO_PK[storeId];
  if (!pk) {
    for (const ref of referenceCodes) {
      result.set(ref, buildMissingFact(ref, storeId));
    }
    return result;
  }

  const warehouseCodes = resolveStoreWarehouseCodes(pk);
  if (warehouseCodes.size === 0) {
    for (const ref of referenceCodes) {
      result.set(ref, buildMissingFact(ref, storeId));
    }
    return result;
  }

  const codes = [...warehouseCodes];
  const now = new Date();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = prisma as any;

  // Single batch query: get last transfer date and count per reference
  // Uses InventoryTransferLine joined to InventoryTransfer
  // Destination match on BOTH header-level and line-level codes
  const rows: Array<{
    referenceCode: string;
    lastTransferDate: Date | null;
    transferCount: bigint;
  }> = await db.$queryRaw`
    SELECT
      l."referenceCode",
      MAX(t."documentDate") AS "lastTransferDate",
      COUNT(DISTINCT t.id) AS "transferCount"
    FROM "InventoryTransferLine" l
    JOIN "InventoryTransfer" t ON l."inventoryTransferId" = t.id
    WHERE t."organizationId" = ${orgId}
      AND l."referenceCode" = ANY(${referenceCodes})
      AND (
        t."destinationWarehouseCode" = ANY(${codes})
        OR l."destinationWarehouseCode" = ANY(${codes})
      )
    GROUP BY l."referenceCode"
  `;

  // Build facts from query results
  for (const row of rows) {
    const lastDate = row.lastTransferDate;
    if (!isValidTransferDate(lastDate)) {
      result.set(row.referenceCode, buildMissingFact(row.referenceCode, storeId));
      continue;
    }

    const days = computeDaysFromDate(lastDate, now);

    result.set(row.referenceCode, {
      referenceCode: row.referenceCode,
      storeId,
      lastTransferDate: lastDate.toISOString(),
      daysInStore: days,
      source: "TRANSFER",
      confidence: "CONFIRMED",
      transferCount: Number(row.transferCount),
    });
  }

  // Fill missing refs with SIN_FECHA
  for (const ref of referenceCodes) {
    if (!result.has(ref)) {
      result.set(ref, buildMissingFact(ref, storeId));
    }
  }

  return result;
}
