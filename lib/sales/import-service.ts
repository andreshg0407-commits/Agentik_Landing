/**
 * Sales import service.
 *
 * Strategy: replace-by-scope.
 * When a batch arrives with the same (organizationId, scopeType, scopeKey) as
 * an existing DONE batch, the old records are deleted and the old batch is
 * marked SUPERSEDED before the new records are inserted.
 *
 * Uniqueness is also enforced at the DB level via
 *   @@unique([organizationId, naturalKey])
 * so a re-import of the same row in a different batch (e.g. ADHOC) is caught
 * as a conflict and handled gracefully (skipOnConflict).
 */

import { prisma } from "@/lib/prisma";
import { SaleGrain, SaleScopeType } from "@prisma/client";
import { normalizeRows } from "./normalize";
import { generateSalesAlerts } from "./alert-engine";
import { generateSourceAlerts } from "./source-alerts";
import { runSourceDedup, persistDedupResults } from "./source-dedup";
import { getDocumentFamilyMap, type SagDocumentFamilyMap } from "./sag-document-type";
import type { RawSagRow, ParseError, NormalizedSale } from "./types";
export { deriveScopeKey } from "./scope";

export interface ImportOptions {
  organizationId: string;
  grain:          SaleGrain;
  scopeType:      SaleScopeType;
  /** For MONTH: "YYYYMM"; YEAR: "YYYY"; RANGE: "YYYY-MM-DD:YYYY-MM-DD"; ADHOC: cuid */
  scopeKey:       string;
  source?:        string;  // defaults to "csv"
  fileName?:      string;
  importedBy?:    string;  // userId
  /**
   * Connector config blob. When present, documentFamilyMap is extracted to
   * classify each row's sagDocumentFamily at import time.
   * Pass the Connector.config JSON from the calling route.
   */
  connectorConfig?: Record<string, unknown>;
}

export interface ImportResult {
  batchId:      string;
  rowCount:     number;
  importedCount: number;
  skippedCount: number;
  parseErrors:  ParseError[];
  replacedBatchId: string | null;
}

export async function importSalesRows(
  rows:    RawSagRow[],
  options: ImportOptions
): Promise<ImportResult> {
  const {
    organizationId,
    grain,
    scopeType,
    scopeKey,
    source        = "csv",
    fileName,
    importedBy,
    connectorConfig,
  } = options;

  // 1. Normalize ─────────────────────────────────────────────────────────────
  // Extract the document-family map from connector config (may be empty when
  // not yet configured — all rows default to sagDocumentFamily = OTHER).
  const documentFamilyMap: SagDocumentFamilyMap = getDocumentFamilyMap(connectorConfig);
  const { ok: normalized, errors: parseErrors } = normalizeRows(rows, organizationId, grain, documentFamilyMap, fileName);

  // 2. Create batch record (PROCESSING) ──────────────────────────────────────
  const batch = await prisma.salesImportBatch.create({
    data: {
      organizationId,
      source,
      grain,
      scopeType,
      scopeKey,
      fileName,
      importedBy,
      status:   "PROCESSING",
      rowCount: rows.length,
    },
  });

  // 3. Replace-by-scope: supersede any previous DONE batch for this scope ────
  let replacedBatchId: string | null = null;

  if (scopeType !== SaleScopeType.ADHOC) {
    const previous = await prisma.salesImportBatch.findFirst({
      where: {
        organizationId,
        scopeType,
        scopeKey,
        status: "DONE",
        id: { not: batch.id },
      },
      orderBy: { importedAt: "desc" },
      select: { id: true },
    });

    if (previous) {
      replacedBatchId = previous.id;
      // Delete old records first (FK: importBatchId)
      await prisma.saleRecord.deleteMany({
        where: { importBatchId: previous.id },
      });
      // Mark old batch SUPERSEDED
      await prisma.salesImportBatch.update({
        where: { id: previous.id },
        data: {
          status:            "SUPERSEDED",
          replacedByBatchId: batch.id,
        },
      });
    }
  }

  // 4. Insert new records (skipDuplicates handles cross-batch naturalKey collisions) ─
  let importedCount = 0;
  let skippedCount  = parseErrors.filter(e => e.severity === "warn").length;

  if (normalized.length > 0) {
    const payload = normalized.map(n => ({
      organizationId,
      importBatchId:   batch.id,
      grain:           n.grain,
      saleDate:        n.saleDate,
      periodoAoMes:    n.periodoAoMes,
      sellerCode:      n.sellerCode,
      sellerSlug:      n.sellerSlug,
      sellerName:      n.sellerName,
      storeCode:       n.storeCode,
      storeSlug:       n.storeSlug,
      storeName:       n.storeName,
      productLine:     n.productLine,
      brand:           n.brand,
      productCode:     n.productCode,
      productName:     n.productName,
      zone:            n.zone,
      channel:         n.channel,
      comprobanteCode:     n.comprobanteCode,
      comprobante:         n.comprobante,
      sagSourceType:       n.sagSourceType,
      sourceDocumentStage: n.sourceDocumentStage,
      sourceInferredFrom:  n.sourceInferredFrom,
      customerNit:         n.customerNit,
      customerName:    n.customerName,
      amount:          n.amount,
      currency:        n.currency,
      units:           n.units,
      txCount:         n.txCount,
      naturalKey:      n.naturalKey,
      rawJson:         n.rawJson as object,
    }));

    const result = await prisma.saleRecord.createMany({
      data:           payload,
      skipDuplicates: true,
    });

    importedCount = result.count;
    skippedCount += normalized.length - result.count;
  }

  // 5. Finalise batch ────────────────────────────────────────────────────────
  await prisma.salesImportBatch.update({
    where: { id: batch.id },
    data: {
      status:        "DONE",
      importedCount,
      skippedCount,
      errorJson:     parseErrors.length > 0 ? (parseErrors as object[]) : undefined,
    },
  });

  // 6. Generate business alerts — one run per distinct period in the batch ────
  // Extract all YYYYMM periods from the normalized rows so this works for
  // MONTH, RANGE, YEAR, and ADHOC scopes alike.
  const periods = extractPeriods(normalized);
  for (const p of periods) {
    // 6a. Persist dedup results FIRST — source-alerts reads from SourceMatchRecord
    runSourceDedup(organizationId, p, p)
      .then(summary => persistDedupResults(organizationId, p, summary))
      .catch(e => {
        console.error(`[source-dedup] persistDedupResults failed for ${p}:`, e);
      });

    // 6b. Sales KPI alerts
    generateSalesAlerts(organizationId, p).catch(e => {
      console.error(`[alert-engine] generateSalesAlerts failed for ${p}:`, e);
    });

    // 6c. Source-aware alerts (F2 share, orphan escalation)
    generateSourceAlerts(organizationId, p).catch(e => {
      console.error(`[source-alerts] generateSourceAlerts failed for ${p}:`, e);
    });
  }

  return {
    batchId:         batch.id,
    rowCount:        rows.length,
    importedCount,
    skippedCount,
    parseErrors,
    replacedBatchId,
  };
}

// ── Extract distinct YYYYMM periods from normalized rows ──────────────────────

function extractPeriods(rows: NormalizedSale[]): string[] {
  const set = new Set<string>();
  for (const r of rows) {
    const p = r.periodoAoMes
      ?? r.saleDate.toISOString().slice(0, 7).replace("-", "");
    if (/^\d{6}$/.test(p)) set.add(p);
  }
  return [...set].sort();
}
