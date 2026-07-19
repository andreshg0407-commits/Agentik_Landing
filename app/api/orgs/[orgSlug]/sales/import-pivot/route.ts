/**
 * POST /api/orgs/[orgSlug]/sales/import-pivot
 *
 * Accepts a Castillitos pivot-style Excel (.xlsx) or CSV file,
 * unpivots it into flat RawSagRow[], then feeds those rows into the
 * existing importSalesRows() pipeline unchanged.
 *
 * multipart/form-data fields:
 *   file          – .xlsx or .csv (required)
 *   sellerOverride – string (optional, overrides auto-detected seller)
 *   defaultCanal   – string (optional, default "tienda")
 *   scopeType      – MONTH | RANGE | YEAR | ADHOC  (default MONTH)
 *   scopeKey       – YYYYMM (optional, derived from data if omitted)
 *   preview        – "1" to dry-run without DB write
 *
 * Returns the same shape as /sales/import plus pivot-specific diagnostics:
 *   { ok, pivotDiagnostics: { seller, linesDetected, producedRows, skippedRows, warnings }, ...importResult }
 */

import { NextResponse }           from "next/server";
import { requireOrgAccess }       from "@/lib/auth/org-access";
import { parsePivotCsv, parsePivotXlsx } from "@/lib/sales/pivot-parser";
import { importSalesRows }        from "@/lib/sales/import-service";
import { deriveScopeKey }         from "@/lib/sales/scope";
import { normalizeRows }          from "@/lib/sales/normalize";
import { getDocumentFamilyMap }   from "@/lib/sales/sag-document-type";
import { prisma }                 from "@/lib/prisma";
import { SaleGrain, SaleScopeType } from "@prisma/client";

export const runtime    = "nodejs";
export const maxDuration = 60;

export async function POST(
  req: Request,
  { params }: { params: { orgSlug: string } }
) {
  try {
    const { user, organization } = await requireOrgAccess(params.orgSlug);

    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof Blob)) {
      return NextResponse.json({ error: "Missing file" }, { status: 400 });
    }

    const fileName       = (file as File).name ?? "upload";
    const sellerOverride = (form.get("sellerOverride") as string | null) ?? undefined;
    const defaultCanal   = (form.get("defaultCanal")   as string | null) ?? "tienda";
    const scopeTypeRaw   = (form.get("scopeType")      as string | null) ?? "MONTH";
    const scopeKeyRaw    = (form.get("scopeKey")        as string | null) ?? null;
    const connectorId    = (form.get("connectorId")     as string | null) ?? undefined;
    const isDryRun       = new URL(req.url).searchParams.get("preview") === "1";

    // Look up connector config to extract documentFamilyMap for source classification
    let connectorConfig: Record<string, unknown> | undefined;
    if (connectorId) {
      const connector = await prisma.connector.findFirst({
        where: { id: connectorId, organizationId: organization.id },
        select: { config: true },
      });
      connectorConfig = connector?.config as Record<string, unknown> | undefined;
    }

    if (!Object.values(SaleScopeType).includes(scopeTypeRaw as SaleScopeType)) {
      return NextResponse.json({ error: `Invalid scopeType: ${scopeTypeRaw}` }, { status: 400 });
    }
    const scopeType = scopeTypeRaw as SaleScopeType;

    // ── Parse pivot file ──────────────────────────────────────────────────────
    const isXlsx = /\.(xlsx|xls|ods)$/i.test(fileName);
    let pivotResult;

    if (isXlsx) {
      const buf = Buffer.from(await file.arrayBuffer());
      pivotResult = parsePivotXlsx(buf, { sellerOverride, defaultCanal });
    } else {
      const text = await file.text();
      pivotResult = parsePivotCsv(text, { sellerOverride, defaultCanal });
    }

    const pivotDiagnostics = {
      seller:           pivotResult.seller,
      sellerSourceRow:  pivotResult.sellerSourceRow,
      sellerSourceCol:  pivotResult.sellerSourceCol,
      sheetName:        pivotResult.sheetName,
      linesDetected:    pivotResult.linesDetected,
      colHeaderRowIdx:  pivotResult.colHeaderRowIdx,
      lineGroupRowIdx:  pivotResult.lineGroupRowIdx,
      detectedPairs:    pivotResult.detectedPairs,
      totalRawRows:     pivotResult.totalRawRows,
      producedRows:     pivotResult.producedRows,
      skippedRows:      pivotResult.skippedRows,
      sampleRows:       pivotResult.sampleRows,
      firstRowsPreview: pivotResult.firstRowsPreview,
      warnings:         pivotResult.warnings,
    };

    if (pivotResult.rows.length === 0) {
      return NextResponse.json({
        ok:    false,
        error: "Pivot parser produced 0 rows. Check the file format and review warnings.",
        pivotDiagnostics,
      }, { status: 422 });
    }

    // ── Derive scopeKey ───────────────────────────────────────────────────────
    let scopeKey: string;
    try {
      scopeKey = scopeKeyRaw ?? deriveScopeKey(pivotResult.rows, scopeType);
    } catch (e) {
      return NextResponse.json(
        { error: (e as Error).message, pivotDiagnostics },
        { status: 422 }
      );
    }

    // ── Dry-run: return diagnostics without writing ───────────────────────────
    if (isDryRun) {
      const documentFamilyMap = getDocumentFamilyMap(connectorConfig);
      const { ok: normalized, errors: parseErrors } =
        normalizeRows(pivotResult.rows, organization.id, SaleGrain.TRANSACTION, documentFamilyMap);

      return NextResponse.json({
        ok:             true,
        dryRun:         true,
        scopeType,
        scopeKey,
        normalizedCount: normalized.length,
        parseErrors:    parseErrors.slice(0, 50),
        pivotDiagnostics,
      });
    }

    // ── Import ────────────────────────────────────────────────────────────────
    const result = await importSalesRows(pivotResult.rows, {
      organizationId: organization.id,
      grain:          SaleGrain.TRANSACTION,
      scopeType,
      scopeKey,
      source:         "pivot-csv",
      fileName,
      importedBy:     user.id,
      connectorConfig,
    });

    return NextResponse.json({
      ok:              true,
      batchId:         result.batchId,
      scopeType,
      scopeKey,
      rowCount:        result.rowCount,
      importedCount:   result.importedCount,
      skippedCount:    result.skippedCount,
      replacedBatchId: result.replacedBatchId,
      parseErrors:     result.parseErrors.slice(0, 50),
      pivotDiagnostics,
    });

  } catch (e) {
    const msg = (e as Error).message;
    if (msg === "UNAUTHENTICATED") return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
    if (msg === "ACCESS_DENIED")   return NextResponse.json({ error: "Access denied" },   { status: 403 });
    if (msg === "ORG_NOT_FOUND")   return NextResponse.json({ error: "Org not found" },   { status: 404 });
    console.error("[sales/import-pivot]", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
