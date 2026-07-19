/**
 * lib/operational-map/runtime/runtime-lineage-audit.ts
 *
 * Runtime Lineage Audit — AGENTIK-SAG-LINEAGE-RESOLUTION-02
 *
 * INTERNAL ONLY: SUPER_ADMIN / AGENTIK_ADMIN
 *
 * Diagnostic: audits actual DB state for SAG comprobanteCode distribution
 * across SaleRecord, CollectionRecord, and SalesImportBatch.
 * Used to verify that runtime detection → SAG catalog resolution is working.
 *
 * Does NOT mutate anything. Safe to call at any time.
 */

import { prisma }             from "@/lib/prisma";
import { SAG_SOURCE_BY_CODE } from "@/lib/operational-map/source-catalog/sag-real-source-catalog";

export interface LineageAuditEntry {
  model:          string;
  comprobanteCode: string | null;
  rowCount:       number;
  catalogMatch:   string | null;   // sourceName if found
  missingReason:  string | null;
}

export interface LineageAuditReport {
  organizationId: string;
  entries:        LineageAuditEntry[];
  totalModels:    string[];
  totalCodes:     string[];
  matchedCodes:   string[];
  unmatchedCodes: string[];
  nullCodeModels: string[];
}

export async function runLineageAudit(organizationId: string): Promise<LineageAuditReport> {
  const entries: LineageAuditEntry[] = [];

  // ── SaleRecord ─────────────────────────────────────────────────────────────
  const saleByCode = await prisma.saleRecord.groupBy({
    by:      ["comprobanteCode"],
    where:   { organizationId },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    _count:  { id: true } as any,
    orderBy: { _count: { id: "desc" } },
  });

  for (const g of saleByCode) {
    const code  = g.comprobanteCode ?? null;
    const count = (g._count as Record<string, number>).id ?? 0;
    const match = code ? (SAG_SOURCE_BY_CODE[code] ?? null) : null;
    entries.push({
      model:           "SaleRecord",
      comprobanteCode: code,
      rowCount:        count,
      catalogMatch:    match ? `${match.codigoFuente} — ${match.nombreFuente}` : null,
      missingReason:   !code
        ? "comprobanteCode is null"
        : !match
          ? `Código ${code} no encontrado en SAG_SOURCE_BY_CODE`
          : null,
    });
  }

  // ── CollectionRecord ───────────────────────────────────────────────────────
  const collByCode = await prisma.collectionRecord.groupBy({
    by:      ["comprobanteCode"],
    where:   { organizationId },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    _count:  { id: true } as any,
    orderBy: { _count: { id: "desc" } },
  });

  for (const g of collByCode) {
    const code  = g.comprobanteCode ?? null;
    const count = (g._count as Record<string, number>).id ?? 0;
    const match = code ? (SAG_SOURCE_BY_CODE[code] ?? null) : null;
    entries.push({
      model:           "CollectionRecord",
      comprobanteCode: code,
      rowCount:        count,
      catalogMatch:    match ? `${match.codigoFuente} — ${match.nombreFuente}` : null,
      missingReason:   !code
        ? "comprobanteCode is null"
        : !match
          ? `Código ${code} no encontrado en SAG_SOURCE_BY_CODE`
          : null,
    });
  }

  // ── SalesImportBatch (scopeKey as proxy, no comprobanteCode) ───────────────
  const batchCount = await prisma.salesImportBatch.count({ where: { organizationId } });
  if (batchCount > 0) {
    entries.push({
      model:           "SalesImportBatch",
      comprobanteCode: null,
      rowCount:        batchCount,
      catalogMatch:    null,
      missingReason:   "SalesImportBatch no tiene comprobanteCode — usar SaleRecord como fuente primaria",
    });
  }

  // ── Summary ────────────────────────────────────────────────────────────────
  const allCodes       = [...new Set(entries.map(e => e.comprobanteCode).filter((c): c is string => c !== null))];
  const matchedCodes   = allCodes.filter(c => SAG_SOURCE_BY_CODE[c]);
  const unmatchedCodes = allCodes.filter(c => !SAG_SOURCE_BY_CODE[c]);
  const nullCodeModels = entries.filter(e => !e.comprobanteCode).map(e => e.model);
  const totalModels    = [...new Set(entries.map(e => e.model))];

  return {
    organizationId,
    entries,
    totalModels,
    totalCodes:    allCodes,
    matchedCodes,
    unmatchedCodes,
    nullCodeModels,
  };
}
