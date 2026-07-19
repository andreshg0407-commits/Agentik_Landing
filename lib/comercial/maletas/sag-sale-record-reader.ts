/**
 * lib/comercial/maletas/sag-sale-record-reader.ts
 *
 * SaleRecord-based transparency adapter.
 *
 * Purpose: inspect whether existing SaleRecord data can provide
 * commercial inventory signals (productCode, units, pendingOrders).
 *
 * CURRENT FINDING (audited 2026-05-23, castillitos):
 *   SaleRecord has 125,163 rows but ALL rows have:
 *     productCode = null
 *     productName = null
 *     units       = null
 *     productLine = "SAG" (constant — not LT/CS)
 *
 *   SaleRecord carries financial document headers (total amount, comprobante,
 *   tercero) but NOT product-level line items. The current SAG import brings in
 *   financial aggregates, not per-reference inventory data.
 *
 *   Result: readSagInventoryFromSaleRecord() returns null for castillitos.
 *   A non-null result requires product-level SAG imports with productCode populated.
 *
 * When productCode becomes available in SaleRecord, this adapter will derive:
 *   - pendingPDQty: sum of units from DISPATCH_REMISION records per productCode
 *   - description: from productName
 *   - line: from productLine when it maps to "LT" | "CS"
 *   - disponible: NOT derivable from sales records — always 0 until snapshot source exists
 *
 * Sprint: AGENTIK-COMERCIAL-MALETAS-SAG-DATA-AUDIT-01
 */

import { prisma }                 from "@/lib/prisma";
import type {
  RawAvailabilityRecord,
  CommercialCaseLine,
}                                 from "./maletas-types";
import {
  normalizeAvailabilityRecord,
  buildAvailabilityMap,
  buildPendingOrdersMap,
}                                 from "./maletas-normalizer";
import type { SagPrismaSnapshot } from "./sag-prisma-reader";

// ─── Audit result ─────────────────────────────────────────────────────────────

export interface SaleRecordAuditResult {
  totalRows:        number;
  rowsWithProduct:  number;
  families:         Array<{ family: string; count: number }>;
  /** true if enough product data exists to build a coverage snapshot */
  viable:           boolean;
  /** ISO timestamp of audit */
  auditedAt:        string;
}

const VALID_LINES = new Set<string>(["LT", "CS"]);

function isValidLine(v: unknown): v is CommercialCaseLine {
  return typeof v === "string" && VALID_LINES.has(v.toUpperCase());
}

// ─── Audit function ───────────────────────────────────────────────────────────

/**
 * Audit the SaleRecord table for this org.
 * Returns what data is available without returning a full snapshot.
 * Dev-only diagnostic — do not call in production paths.
 */
export async function auditSaleRecordForOrg(orgId: string): Promise<SaleRecordAuditResult> {
  const p = prisma as unknown as Record<string, unknown>;
  if (typeof p["saleRecord"] !== "object") {
    return { totalRows: 0, rowsWithProduct: 0, families: [], viable: false, auditedAt: new Date().toISOString() };
  }

  try {
    const [totalRows, rowsWithProduct, families] = await Promise.all([
      prisma.saleRecord.count({ where: { organizationId: orgId } }),
      prisma.saleRecord.count({ where: { organizationId: orgId, productCode: { not: null } } }),
      prisma.saleRecord.groupBy({
        by: ["sagDocumentFamily"],
        where: { organizationId: orgId },
        _count: { id: true },
      }),
    ]);

    const familyList = families.map(f => ({
      family: String(f.sagDocumentFamily),
      count:  f._count.id,
    }));

    const viable = rowsWithProduct > 0;

    if (process.env.NODE_ENV === "development") {
      console.log(
        "[sag-sale-record-reader] AUDIT | orgId:", orgId,
        "| totalRows:", totalRows,
        "| rowsWithProduct:", rowsWithProduct,
        "| viable:", viable,
      );
      if (!viable && totalRows > 0) {
        console.warn(
          "[sag-sale-record-reader] SaleRecord has", totalRows, "rows for", orgId,
          "but productCode=null on all rows.",
          "SAG import is financial-only (no product line items).",
          "CommercialCoverageSnapshot is the required inventory source.",
        );
      }
    }

    return { totalRows, rowsWithProduct, families: familyList, viable, auditedAt: new Date().toISOString() };
  } catch {
    return { totalRows: 0, rowsWithProduct: 0, families: [], viable: false, auditedAt: new Date().toISOString() };
  }
}

// ─── Snapshot builder ─────────────────────────────────────────────────────────

/**
 * Attempt to build a SagPrismaSnapshot from SaleRecord data.
 * Returns null if SaleRecord has no usable product-level data for this org.
 *
 * When viable:
 *   - Groups by productCode + productLine
 *   - DISPATCH_REMISION units → pendingPDQty (demand pressure)
 *   - disponible defaults to 0 (not inferrable from sales records)
 *
 * This is a fallback of last resort — CommercialCoverageSnapshot is authoritative.
 */
export async function readSagSnapshotFromSaleRecord(
  orgId: string,
): Promise<SagPrismaSnapshot | null> {
  const p = prisma as unknown as Record<string, unknown>;
  if (typeof p["saleRecord"] !== "object") return null;

  try {
    // Only rows with product data are useful
    const rows = await prisma.saleRecord.findMany({
      where: {
        organizationId: orgId,
        productCode:    { not: null },
      },
      select: {
        productCode:       true,
        productName:       true,
        productLine:       true,
        sagDocumentFamily: true,
        units:             true,
      },
    });

    if (rows.length === 0) {
      if (process.env.NODE_ENV === "development") {
        console.log("[sag-sale-record-reader] No rows with productCode for orgId:", orgId, "— SaleRecord path not viable.");
      }
      return null;
    }

    // Aggregate per (productCode × productLine)
    type Agg = { description: string; line: string; dispUnits: number; pdUnits: number };
    const byRef = new Map<string, Agg>();

    for (const row of rows) {
      if (!row.productCode) continue;
      const key = `${row.productCode.toUpperCase()}:${String(row.productLine ?? "").toUpperCase()}`;
      if (!byRef.has(key)) {
        byRef.set(key, {
          description: row.productName ?? row.productCode,
          line:        String(row.productLine ?? ""),
          dispUnits:   0,
          pdUnits:     0,
        });
      }
      const agg = byRef.get(key)!;
      const units = row.units ?? 0;
      // DISPATCH_REMISION = active demand pressure (analogous to PD)
      if (row.sagDocumentFamily === "DISPATCH_REMISION") {
        agg.pdUnits += Math.max(0, units);
      }
      // OFFICIAL_INVOICE reduces available stock (units shipped)
      // We don't have warehouse quantity here, so disponible stays 0
    }

    // Build availability records for refs with valid LT/CS lines
    const rawAvailability: RawAvailabilityRecord[] = [];

    for (const [refFull, agg] of byRef) {
      const refCode = refFull.split(":")[0] ?? refFull;
      const lineRaw = agg.line.toUpperCase();
      if (!isValidLine(lineRaw)) continue; // skip non LT/CS lines

      // disponible = 0 (not inferrable from SaleRecord — no warehouse data)
      const pedidos    = agg.pdUnits;
      const disponible = 0;
      const inventario = pedidos; // all we know is demand pressure

      rawAvailability.push(
        normalizeAvailabilityRecord({
          refCode,
          description: agg.description,
          inventario,
          pedidos,
          disponible,
        }),
      );
    }

    if (rawAvailability.length === 0) {
      if (process.env.NODE_ENV === "development") {
        console.log("[sag-sale-record-reader] No LT/CS refs found in productLine for orgId:", orgId);
      }
      return null;
    }

    const availabilityMap  = buildAvailabilityMap(rawAvailability);
    const pendingOrdersMap = buildPendingOrdersMap(availabilityMap);

    if (process.env.NODE_ENV === "development") {
      console.log(
        "[sag-sale-record-reader] FUENTE: sale_record |",
        `refs=${availabilityMap.size} | orgId:`, orgId,
      );
    }

    return {
      ltRows:          [],
      csRows:          [],
      availability:    availabilityMap,
      pendingOrdersMap,
      snapshotAt:      new Date().toISOString(),
      refCount:        availabilityMap.size,
    };
  } catch (err) {
    if (process.env.NODE_ENV === "development") {
      console.warn("[sag-sale-record-reader] Error:", err instanceof Error ? err.message : err);
    }
    return null;
  }
}
