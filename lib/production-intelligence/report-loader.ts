/**
 * report-loader.ts
 *
 * CASTILLITOS-REPORTS-DATA-INTEGRATION-01
 * Server-side data loader for Production Intelligence.
 *
 * Reads from ProductionOrder + ProductionOrderLine (Prisma) and maps to
 * SagProductionRecord[] for the production engine.
 *
 * Mapping:
 *   ProductionOrder.sourceCode → docType (always "OP" for production orders)
 *   ProductionOrder.warehouseCode → bodega
 *   ProductionOrderLine.referenceCode → reference
 *   SubLinea → inferred from line mapping (same as availability)
 *   SubGrupo → inferred from description via inferProductType()
 *
 * server-only — uses Prisma directly.
 */

import "server-only";

import { prisma } from "@/lib/prisma";
import { inferProductType } from "@/lib/comercial/maletas/sag-inventory-adapter";
import type { SagProductionRecord, SagProductionDocType } from "./production-types";

// ── Source code to doc type mapping ──────────────────────────────────────────

const SOURCE_TO_DOCTYPE: Record<string, SagProductionDocType> = {
  OP: "OP",
  CN: "CN",
  PC: "PC",
  EC: "EC",
  ET: "ET",
  T1: "T1",
  T2: "T2",
  Y1: "Y1",
};

// ── Line inference from description ──────────────────────────────────────────
// ProductionOrderLine has no explicit line field; infer from product name.

function inferSubLinea(productName: string, referenceCode?: string): string {
  // 1. Try reference code prefix first (most reliable)
  if (referenceCode) {
    const ref = referenceCode.toUpperCase();
    if (ref.startsWith("L-") || ref.startsWith("L ")) return "LATIN KIDS";
    if (ref.startsWith("C-") || ref.startsWith("C ") || ref.startsWith("CP-") || ref.startsWith("CT-") || ref.startsWith("CA-")) return "CASTILLITOS";
  }
  // 2. Fall back to product name keywords
  const upper = productName.toUpperCase();
  if (upper.includes("LATIN")) return "LATIN KIDS";
  if (upper.includes("CASTILLITOS")) return "CASTILLITOS";
  if (upper.includes("IMPORT")) return "IMPORTACION";
  return "OTRO";
}

// ── Load production records from open orders ─────────────────────────────────

/**
 * Loads open ProductionOrders with their lines and maps to
 * SagProductionRecord[] for buildProductionReport().
 *
 * Uses two separate queries (orders + lines) instead of include to avoid
 * query timeout on large datasets. Castillitos has 3,352 open OPs with
 * 56K+ lines — a single include query exceeds Neon's 30s query_timeout.
 *
 * Uses `prisma as any` + try/catch for graceful degradation when the
 * ProductionOrder table doesn't exist yet.
 */
export async function loadProductionRecords(
  organizationId: string,
): Promise<{ records: SagProductionRecord[] }> {
  const db = prisma as any;

  try {
    // Two separate queries to avoid query timeout on large datasets.
    // include: { lines: true } with 3,352 orders + 56K lines exceeds 30s.
    const orders = await db.productionOrder.findMany({
      where: {
        organizationId,
        isClosed: false,
      },
      select: {
        id: true,
        erpMovId: true,
        sourceCode: true,
        documentNumber: true,
        documentDate: true,
        warehouseCode: true,
        isClosed: true,
      },
      orderBy: { documentDate: "asc" },
    });

    if (orders.length === 0) return { records: [] };

    const orderIds = orders.map((o: any) => o.id as string);
    const lines = await db.productionOrderLine.findMany({
      where: { productionOrderId: { in: orderIds } },
      select: {
        productionOrderId: true,
        referenceCode: true,
        productName: true,
        quantityOrdered: true,
      },
    });

    // Index lines by order ID for fast lookup
    const linesByOrder = new Map<string, typeof lines>();
    for (const line of lines) {
      const list = linesByOrder.get(line.productionOrderId) ?? [];
      list.push(line);
      linesByOrder.set(line.productionOrderId, list);
    }

    const records: SagProductionRecord[] = [];

    for (const order of orders) {
      const docType = SOURCE_TO_DOCTYPE[order.sourceCode] ?? "OP";
      const fechaDocumento = order.documentDate
        ? order.documentDate.toISOString()
        : new Date().toISOString();

      const orderLines = linesByOrder.get(order.id) ?? [];
      for (const line of orderLines) {
        const productName = line.productName ?? line.referenceCode;
        records.push({
          movimientoId: String(order.erpMovId),
          docType,
          fuente: 33, // default OP fuente
          reference: line.referenceCode,
          description: productName,
          subLinea: inferSubLinea(productName, line.referenceCode),
          subGrupo: inferProductType(productName),
          bodega: order.warehouseCode ?? "04",
          cantidad: line.quantityOrdered,
          fechaDocumento,
          cerrado: order.isClosed,
          opNumero: order.documentNumber,
        });
      }
    }

    return { records };
  } catch (err) {
    // Log the real error to surface timeouts and other issues
    console.error("[report-loader] loadProductionRecords failed:", (err as Error).message);
    // Graceful degradation — return empty records so downstream engines
    // run with zero production data instead of crashing the page.
    return { records: [] };
  }
}
