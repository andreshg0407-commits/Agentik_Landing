/**
 * lib/operational-map/runtime/runtime-source-lineage-detector.ts
 *
 * Runtime Source Lineage Detector — AGENTIK-RUNTIME-SOURCE-LINEAGE-01
 *                                   AGENTIK-SAG-LINEAGE-RESOLUTION-02
 *
 * INTERNAL ONLY: SUPER_ADMIN / AGENTIK_ADMIN
 *
 * Enriches a detected runtime source with precise SAG/CRM provenance:
 *   - Which SAG document codes (comprobanteCode) are in SaleRecord
 *   - Which import batches/files contributed the data
 *   - Catalog cross-reference (SAG_SOURCE_BY_CODE)
 *   - Date range of available data
 *   - What's still pending DBA confirmation
 *   - primarySagSource: the dominant SAG code (resolved via runtime-source-resolution.ts)
 *
 * This turns "SaleRecord — 125,163 filas" into:
 *   "FE — FACTURA ELECTRÓNICA DE VENTA / OFICIAL / F1 / batch CSV 202403 / tabla pendiente DBA"
 */

import { prisma }                    from "@/lib/prisma";
import { SAG_SOURCE_BY_CODE }        from "@/lib/operational-map/source-catalog/sag-real-source-catalog";
import type { SagRealSource }        from "@/lib/operational-map/source-catalog/sag-real-source-catalog";
import {
  resolvePrimarySagSourceCode,
  isResolvedSource,
}                                    from "./runtime-source-resolution";
import type { SagSourceResolution }  from "./runtime-source-resolution";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface LineageBatch {
  id:           string;
  fileName:     string | null;
  importedAt:   string;      // ISO date string
  rowCount:     number;
  status:       string;
  scopeKey:     string;
}

export interface LineageSourceCodeGroup {
  code:          string;                  // e.g. "FE"
  rowCount:      number;
  sagSourceType: "OFICIAL" | "REMISION";  // Fuente 1 / Fuente 2
  docFamily:     string;                  // e.g. "OFFICIAL_INVOICE"
  catalogMatch:  SagRealSource | null;
}

export interface RuntimeSourceLineage {
  provider:              "sag" | "crm" | "bank" | "agentik";
  runtimeModel:          string;
  rowCount:              number;
  // ── Primary SAG source — resolved dominant code ──────────────────────────
  primarySagSource:      SagSourceResolution | null;
  // SAG document code breakdown (null for non-SAG models)
  sourceCodeGroups:      LineageSourceCodeGroup[];
  // Primary/canonical SAG codes detected
  sourceCodes:           string[];
  sourceNames:           string[];
  classifications:       string[];
  fuente:                "F1" | "F2" | "mixed" | "unknown";
  // Import batch provenance
  batches:               LineageBatch[];
  // Temporal range
  dateRange: {
    earliest: string | null;
    latest:   string | null;
  };
  // Inferred filters for DBA
  inferredFilters:       string[];
  // Catalog matches
  catalogMatches:        SagRealSource[];
  // What still needs DBA confirmation
  missingConfirmations:  string[];
  // 0–100 confidence in lineage accuracy
  confidence:            number;
}

// ─── Model-specific lineage extractors ────────────────────────────────────────

async function getSaleRecordLineage(
  organizationId: string,
): Promise<RuntimeSourceLineage> {
  // 1. Total row count
  const rowCount = await prisma.saleRecord.count({ where: { organizationId } });

  // 2. Resolve primary SAG source (dominant code by row count)
  const primarySagSource = await resolvePrimarySagSourceCode(organizationId, "SaleRecord");

  // 3. Group by comprobanteCode + sagSourceType + sagDocumentFamily
  const byCode = await prisma.saleRecord.groupBy({
    by:    ["comprobanteCode", "sagSourceType", "sagDocumentFamily"] as ["comprobanteCode", "sagSourceType", "sagDocumentFamily"],
    where: { organizationId },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    _count: { id: true } as any,
    orderBy: { _count: { id: "desc" } },
  });

  const sourceCodeGroups: LineageSourceCodeGroup[] = byCode.map(g => {
    const code = g.comprobanteCode ?? "UNKNOWN";
    return {
      code,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      rowCount:      (g._count as any).id ?? 0,
      sagSourceType: g.sagSourceType as "OFICIAL" | "REMISION",
      docFamily:     g.sagDocumentFamily as string,
      catalogMatch:  SAG_SOURCE_BY_CODE[code] ?? null,
    };
  });

  // 4. Batches — get distinct importBatchIds and their metadata
  const batchLinks = await prisma.saleRecord.findMany({
    where:   { organizationId },
    select:  { importBatchId: true },
    distinct: ["importBatchId"],
  });
  const batchIds = batchLinks.map(b => b.importBatchId);

  const batches: LineageBatch[] = [];
  if (batchIds.length > 0) {
    const batchRows = await prisma.salesImportBatch.findMany({
      where:   { id: { in: batchIds } },
      orderBy: { importedAt: "desc" },
      take:    10,
    });
    for (const b of batchRows) {
      batches.push({
        id:         b.id,
        fileName:   b.fileName,
        importedAt: b.importedAt.toISOString(),
        rowCount:   b.rowCount,
        status:     b.status,
        scopeKey:   b.scopeKey,
      });
    }
  }

  // 5. Date range
  const earliest = await prisma.saleRecord.findFirst({
    where:   { organizationId },
    orderBy: { saleDate: "asc" },
    select:  { saleDate: true },
  });
  const latest = await prisma.saleRecord.findFirst({
    where:   { organizationId },
    orderBy: { saleDate: "desc" },
    select:  { saleDate: true },
  });

  // 6. Derived summaries
  const sourceCodes   = [...new Set(sourceCodeGroups.map(g => g.code).filter(c => c !== "UNKNOWN"))];
  const sourceNames   = sourceCodeGroups
    .filter(g => g.catalogMatch)
    .map(g => g.catalogMatch!.nombreFuente)
    .filter((v, i, arr) => arr.indexOf(v) === i);
  const classifications = sourceCodeGroups
    .filter(g => g.catalogMatch)
    .map(g => g.catalogMatch!.clasificacion)
    .filter((v, i, arr) => arr.indexOf(v) === i);
  const catalogMatches  = sourceCodeGroups.map(g => g.catalogMatch).filter((m): m is SagRealSource => m !== null);

  const hasOficial  = sourceCodeGroups.some(g => g.sagSourceType === "OFICIAL");
  const hasRemision = sourceCodeGroups.some(g => g.sagSourceType === "REMISION");
  const fuente: RuntimeSourceLineage["fuente"] =
    hasOficial && hasRemision ? "mixed" : hasOficial ? "F1" : hasRemision ? "F2" : "unknown";

  // 7. Inferred filters
  const inferredFilters: string[] = [];
  if (hasOficial)  inferredFilters.push("sagSourceType = OFICIAL (Fuente 1)");
  if (hasRemision) inferredFilters.push("sagSourceType = REMISION (Fuente 2)");
  if (sourceCodes.length > 0) inferredFilters.push(`comprobanteCode IN (${sourceCodes.slice(0, 5).join(", ")})`);

  // 8. Missing confirmations
  const missingConfirmations: string[] = [];
  const unmatched = sourceCodeGroups.filter(g => !g.catalogMatch && g.code !== "UNKNOWN");
  if (unmatched.length > 0) missingConfirmations.push(`Códigos sin catálogo: ${unmatched.map(g => g.code).join(", ")}`);
  const pendingTable = catalogMatches.filter(m => !m.tablaSagConfirmada);
  if (pendingTable.length > 0) missingConfirmations.push("Tabla SAG real pendiente confirmar con DBA");
  missingConfirmations.push("Query/campos exactos pendiente confirmar con DBA");

  // 9. Confidence: incorporate primarySagSource confidence when resolved
  let confidence = 50;
  if (catalogMatches.length > 0)    confidence += 20;
  if (batches.length > 0)           confidence += 15;
  if (sourceCodes.length > 0)       confidence += 10;
  if (rowCount > 1000)              confidence += 5;
  if (isResolvedSource(primarySagSource)) confidence = Math.max(confidence, primarySagSource.confidence);
  confidence = Math.min(100, confidence);

  return {
    provider:          "sag",
    runtimeModel:      "SaleRecord",
    rowCount,
    primarySagSource,
    sourceCodeGroups,
    sourceCodes,
    sourceNames,
    classifications,
    fuente,
    batches,
    dateRange: {
      earliest: earliest?.saleDate.toISOString() ?? null,
      latest:   latest?.saleDate.toISOString()   ?? null,
    },
    inferredFilters,
    catalogMatches,
    missingConfirmations,
    confidence,
  };
}

async function getSalesImportBatchLineage(
  organizationId: string,
): Promise<RuntimeSourceLineage> {
  const batchList = await prisma.salesImportBatch.findMany({
    where:   { organizationId },
    orderBy: { importedAt: "desc" },
    take:    10,
  });

  const rowCount     = batchList.reduce((s, b) => s + b.rowCount, 0);
  const lineageBatches: LineageBatch[] = batchList.map(b => ({
    id:         b.id,
    fileName:   b.fileName,
    importedAt: b.importedAt.toISOString(),
    rowCount:   b.rowCount,
    status:     b.status,
    scopeKey:   b.scopeKey,
  }));

  const earliest = batchList.length > 0 ? batchList[batchList.length - 1].importedAt : null;
  const latest   = batchList.length > 0 ? batchList[0].importedAt : null;

  // SalesImportBatch is the container — resolve primary source from SaleRecord
  // (the batch is evidence the data entered via CSV; actual document codes are in SaleRecord)
  const saleRecordPrimary = await resolvePrimarySagSourceCode(organizationId, "SaleRecord");

  const missingConfirmations = [
    "Tabla SAG real pendiente confirmar con DBA",
    "Importado via CSV histórico — no es conexión ODBC directa",
  ];

  return {
    provider:          "sag",
    runtimeModel:      "SalesImportBatch",
    rowCount:          batchList.length,        // batch count
    primarySagSource:  saleRecordPrimary,        // resolved from SaleRecord codes
    sourceCodeGroups:  [],                       // batch model has no comprobanteCode
    sourceCodes:       [],
    sourceNames:       ["CSV Import SAG"],
    classifications:   ["CSV"],
    fuente:            isResolvedSource(saleRecordPrimary) ? saleRecordPrimary.fuente : "unknown",
    batches:           lineageBatches,
    dateRange: {
      earliest: earliest?.toISOString() ?? null,
      latest:   latest?.toISOString()   ?? null,
    },
    inferredFilters:       [`source = csv (${batchList.length} lotes)`, `total rows: ~${rowCount}`],
    catalogMatches:        isResolvedSource(saleRecordPrimary) ? [saleRecordPrimary.catalogMatch] : [],
    missingConfirmations,
    confidence:            isResolvedSource(saleRecordPrimary) ? Math.min(saleRecordPrimary.confidence, 70) : 60,
  };
}

async function getCollectionRecordLineage(
  organizationId: string,
): Promise<RuntimeSourceLineage> {
  const rowCount = await prisma.collectionRecord.count({ where: { organizationId } });

  // Resolve primary SAG source for cobros
  const primarySagSource = await resolvePrimarySagSourceCode(organizationId, "CollectionRecord");

  const byCode = await prisma.collectionRecord.groupBy({
    by:    ["comprobanteCode"],
    where: { organizationId },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    _count: { id: true } as any,
    orderBy: { _count: { id: "desc" } },
  });

  const sourceCodeGroups: LineageSourceCodeGroup[] = byCode.map(g => {
    const code = g.comprobanteCode ?? "UNKNOWN";
    return {
      code,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      rowCount:      (g._count as any).id ?? 0,
      sagSourceType: "OFICIAL" as const,
      docFamily:     "COLLECTION",
      catalogMatch:  SAG_SOURCE_BY_CODE[code] ?? null,
    };
  });

  const sourceCodes    = [...new Set(sourceCodeGroups.map(g => g.code).filter(c => c !== "UNKNOWN"))];
  const sourceNames    = sourceCodeGroups.filter(g => g.catalogMatch).map(g => g.catalogMatch!.nombreFuente).filter((v, i, a) => a.indexOf(v) === i);
  const catalogMatches = sourceCodeGroups.map(g => g.catalogMatch).filter((m): m is SagRealSource => m !== null);

  const earliest = await prisma.collectionRecord.findFirst({ where: { organizationId }, orderBy: { collectionDate: "asc" }, select: { collectionDate: true } });
  const latest   = await prisma.collectionRecord.findFirst({ where: { organizationId }, orderBy: { collectionDate: "desc" }, select: { collectionDate: true } });

  let confidence = catalogMatches.length > 0 ? 75 : 55;
  if (isResolvedSource(primarySagSource)) confidence = Math.max(confidence, primarySagSource.confidence);

  return {
    provider:          "sag",
    runtimeModel:      "CollectionRecord",
    rowCount,
    primarySagSource,
    sourceCodeGroups,
    sourceCodes,
    sourceNames,
    classifications:   ["OFICIAL"],
    fuente:            "F1",
    batches:           [],
    dateRange: {
      earliest: earliest?.collectionDate.toISOString() ?? null,
      latest:   latest?.collectionDate.toISOString()   ?? null,
    },
    inferredFilters:       sourceCodes.length > 0 ? [`comprobanteCode IN (${sourceCodes.slice(0, 5).join(", ")})`] : [],
    catalogMatches,
    missingConfirmations:  ["Tabla SAG real pendiente confirmar con DBA"],
    confidence,
  };
}

// ─── Generic lineage for other models ─────────────────────────────────────────

function genericLineage(model: string, provider: "sag" | "crm" | "bank" | "agentik", rowCount: number): RuntimeSourceLineage {
  return {
    provider,
    runtimeModel: model,
    rowCount,
    primarySagSource:     null,
    sourceCodeGroups:     [],
    sourceCodes:          [],
    sourceNames:          [model],
    classifications:      [],
    fuente:               "unknown",
    batches:              [],
    dateRange:            { earliest: null, latest: null },
    inferredFilters:      [],
    catalogMatches:       [],
    missingConfirmations: ["Sin código fuente SAG. Tabla/query pendiente confirmar con DBA."],
    confidence:           50,
  };
}

// ─── Main entry point ─────────────────────────────────────────────────────────

/**
 * Detects precise SAG/CRM lineage for a specific runtime model.
 * Returns null if model is not supported or has no lineage data.
 */
export async function detectSourceLineage(
  organizationId: string,
  runtimeModel:   string,
  provider:       "sag" | "crm" | "bank" | "agentik",
  rowCount:       number,
): Promise<RuntimeSourceLineage | null> {
  if (rowCount === 0) return null;

  try {
    switch (runtimeModel) {
      case "SaleRecord":         return await getSaleRecordLineage(organizationId);
      case "SalesImportBatch":   return await getSalesImportBatchLineage(organizationId);
      case "CollectionRecord":   return await getCollectionRecordLineage(organizationId);
      // Other models: generic lineage (no SAG code breakdown available)
      case "CRMQuote":
      case "CRMQuoteLine":
      case "CustomerProfile":
      case "PaymentRecord":
      case "BankMovement":
      case "BankSyncSession":
      case "CommercialCoverageSnapshot":
      case "FinancialRuntimeSnapshot":
      case "ReconciliationSession":
      case "OperationalReservation":
        return genericLineage(runtimeModel, provider, rowCount);
      default:
        return null;
    }
  } catch {
    return null;
  }
}
