/**
 * POST /api/orgs/[orgSlug]/sales/import
 *
 * Accepts multipart/form-data with:
 *   file     – CSV file (required)
 *   grain    – "TRANSACTION" | "AGGREGATED"  (default: TRANSACTION)
 *   scopeType – "MONTH" | "RANGE" | "YEAR" | "ADHOC"  (default: MONTH)
 *   scopeKey  – period key e.g. "202403" (optional: derived from data if omitted)
 *
 * Returns:
 *   { ok: true, batchId, rowCount, importedCount, skippedCount, parseErrors }
 */

import { NextResponse }       from "next/server";
import Papa                   from "papaparse";
import { requireOrgAccess }   from "@/lib/auth/org-access";
import { importSalesRows }  from "@/lib/sales/import-service";
import { deriveScopeKey }   from "@/lib/sales/scope";
import { normalizeRows }                   from "@/lib/sales/normalize";
import { SaleGrain, SaleScopeType }        from "@prisma/client";
import type { RawSagRow }                  from "@/lib/sales/types";

export const runtime = "nodejs";
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

    // ── Parse grain / scope options ──────────────────────────────────────────
    const grainRaw     = (form.get("grain")     as string | null) ?? "TRANSACTION";
    const scopeTypeRaw = (form.get("scopeType") as string | null) ?? "MONTH";
    const scopeKeyRaw  = (form.get("scopeKey")  as string | null) ?? null;

    if (!Object.values(SaleGrain).includes(grainRaw as SaleGrain)) {
      return NextResponse.json({ error: `Invalid grain: ${grainRaw}` }, { status: 400 });
    }
    if (!Object.values(SaleScopeType).includes(scopeTypeRaw as SaleScopeType)) {
      return NextResponse.json({ error: `Invalid scopeType: ${scopeTypeRaw}` }, { status: 400 });
    }

    const grain     = grainRaw     as SaleGrain;
    const scopeType = scopeTypeRaw as SaleScopeType;

    // ── Read CSV ─────────────────────────────────────────────────────────────
    const csvText  = await file.text();
    const fileName = (file as File).name ?? undefined;

    const parsed = Papa.parse<Record<string, string>>(csvText, {
      header:           true,
      skipEmptyLines:   true,
      transformHeader:  h => h.trim().toLowerCase().replace(/\s+/g, "_"),
    });

    if (parsed.errors.length > 0) {
      const fatal = parsed.errors.filter(e => e.type === "Delimiter" || e.type === "Quotes");
      if (fatal.length > 0) {
        return NextResponse.json(
          { error: "CSV parse error", details: fatal.slice(0, 5) },
          { status: 422 }
        );
      }
    }

    const rows = parsed.data as unknown as RawSagRow[];

    if (rows.length === 0) {
      return NextResponse.json({ error: "Empty file" }, { status: 422 });
    }

    // ── Derive scopeKey if not provided ──────────────────────────────────────
    let scopeKey: string;
    try {
      scopeKey = scopeKeyRaw ?? deriveScopeKey(rows, scopeType);
    } catch (e) {
      return NextResponse.json(
        { error: (e as Error).message },
        { status: 422 }
      );
    }

    // ── Dry-run diagnostics (preview=1 skips DB write) ───────────────────────
    const isDryRun = new URL(req.url).searchParams.get("preview") === "1";

    if (isDryRun) {
      const { ok: normalized, errors: parseErrors } = normalizeRows(rows, organization.id, grain);
      const previewRows = normalized.slice(0, 10).map(r => ({
        saleDate:    r.saleDate.toISOString().slice(0, 10),
        sellerName:  r.sellerName,
        storeName:   r.storeName,
        productLine: r.productLine,
        channel:     r.channel,
        amount:      r.amount,
        txCount:     r.txCount,
        naturalKey:  r.naturalKey,
      }));
      const periodCounts: Record<string, { rows: number; total: number }> = {};
      for (const r of normalized) {
        const p = r.periodoAoMes ?? r.saleDate.toISOString().slice(0, 7).replace("-", "");
        if (!periodCounts[p]) periodCounts[p] = { rows: 0, total: 0 };
        periodCounts[p].rows++;
        periodCounts[p].total += r.amount;
      }
      return NextResponse.json({
        ok:           true,
        dryRun:       true,
        grain,
        scopeType,
        scopeKey,
        rowCount:     rows.length,
        normalizedCount: normalized.length,
        warnCount:    parseErrors.filter(e => e.severity === "warn").length,
        errorCount:   parseErrors.filter(e => e.severity === "error").length,
        periodCounts,
        previewRows,
        parseErrors:  parseErrors.slice(0, 50),
      });
    }

    // ── Run import ───────────────────────────────────────────────────────────
    const result = await importSalesRows(rows, {
      organizationId: organization.id,
      grain,
      scopeType,
      scopeKey,
      source:     "csv",
      fileName,
      importedBy: user.id,
    });

    // Compute per-period totals for diagnostics
    const { ok: normalized } = normalizeRows(rows, organization.id, grain);
    const periodTotals: Record<string, { rows: number; total: number }> = {};
    for (const r of normalized) {
      const p = r.periodoAoMes ?? r.saleDate.toISOString().slice(0, 7).replace("-", "");
      if (!periodTotals[p]) periodTotals[p] = { rows: 0, total: 0 };
      periodTotals[p].rows++;
      periodTotals[p].total += r.amount;
    }

    return NextResponse.json({
      ok:              true,
      batchId:         result.batchId,
      grain,
      scopeType,
      scopeKey,
      rowCount:        result.rowCount,
      importedCount:   result.importedCount,
      skippedCount:    result.skippedCount,
      replacedBatchId: result.replacedBatchId,
      periodTotals,
      previewRows: normalized.slice(0, 10).map(r => ({
        saleDate:    r.saleDate.toISOString().slice(0, 10),
        sellerName:  r.sellerName,
        storeName:   r.storeName,
        productLine: r.productLine,
        channel:     r.channel,
        amount:      r.amount,
        txCount:     r.txCount,
        naturalKey:  r.naturalKey,
      })),
      parseErrors: result.parseErrors.slice(0, 50),
    });
  } catch (e) {
    const msg = (e as Error).message;
    if (msg === "UNAUTHENTICATED") return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
    if (msg === "ACCESS_DENIED")   return NextResponse.json({ error: "Access denied" },   { status: 403 });
    if (msg === "ORG_NOT_FOUND")   return NextResponse.json({ error: "Org not found" },   { status: 404 });
    console.error("[sales/import]", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
