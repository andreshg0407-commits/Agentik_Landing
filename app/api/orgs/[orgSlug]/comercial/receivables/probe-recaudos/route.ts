/**
 * POST /api/orgs/[orgSlug]/comercial/receivables/probe-recaudos
 *
 * AGENTIK-RECEIVABLES-AR-TRUTH-01 — Section 1
 * Diagnostic probe for dbo.vw_agentik_recaudos on SAG.
 *
 * Returns: ROW_COUNT, field names, sample rows, MIN/MAX dates,
 * distinct customers, null counts — everything needed to confirm
 * the canonical AR view exists and has usable data.
 *
 * Requires SUPER_ADMIN. Read-only. No mutations.
 */

import { requireCommercialAccess } from "@/lib/auth/org-access";
import { consultaSagJson } from "@/lib/connectors/pya/client";
import { getSagConnection, describeSagConnection } from "@/lib/connectors/pya/sag-source-router";
import type { SagSource } from "@/lib/connectors/pya/sag-source-router";
import { NextResponse } from "next/server";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ orgSlug: string }> },
) {
  const { orgSlug } = await params;
  const { membership } = await requireCommercialAccess(orgSlug);

  if (membership.role !== "SUPER_ADMIN") {
    return NextResponse.json(
      { error: "Requires SUPER_ADMIN" },
      { status: 403 },
    );
  }

  const body = await req.json().catch(() => ({}));
  const source: SagSource = body.source === "HISTORICAL" ? "HISTORICAL" : "CURRENT";
  const sampleLimit = typeof body.sampleLimit === "number" ? Math.min(body.sampleLimit, 20) : 5;

  const connectionInfo = describeSagConnection(source);
  const config = getSagConnection(source);

  const results: Record<string, unknown> = {
    source,
    database: connectionInfo.database,
    probeStartedAt: new Date().toISOString(),
  };

  // ── Step 1: Try SELECT TOP 5 to confirm view exists and discover fields ──
  try {
    const sampleRows = await consultaSagJson(
      config,
      `SELECT TOP ${sampleLimit} * FROM vw_agentik_recaudos`,
    );

    results.viewExists = true;
    results.sampleRowCount = sampleRows.length;
    results.fields = sampleRows.length > 0 ? Object.keys(sampleRows[0]) : [];
    results.sampleRows = sampleRows;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    results.viewExists = false;
    results.viewError = message;

    // If the view doesn't exist, try the dbo-prefixed version
    try {
      const sampleRows2 = await consultaSagJson(
        config,
        `SELECT TOP ${sampleLimit} * FROM dbo.vw_agentik_recaudos`,
      );
      results.viewExistsWithDbo = true;
      results.sampleRowCount = sampleRows2.length;
      results.fields = sampleRows2.length > 0 ? Object.keys(sampleRows2[0]) : [];
      results.sampleRows = sampleRows2;
    } catch (err2: unknown) {
      results.viewExistsWithDbo = false;
      results.viewErrorWithDbo = err2 instanceof Error ? err2.message : String(err2);
    }
  }

  // ── Step 2: If view exists, get row count ────────────────────────────────
  if (results.viewExists || results.viewExistsWithDbo) {
    const viewName = results.viewExists ? "vw_agentik_recaudos" : "dbo.vw_agentik_recaudos";

    try {
      const countRows = await consultaSagJson(
        config,
        `SELECT COUNT(*) AS total FROM ${viewName}`,
      );
      results.totalRowCount = countRows[0]?.total ?? countRows[0]?.Total ?? null;
    } catch (err: unknown) {
      results.countError = err instanceof Error ? err.message : String(err);
    }

    // ── Step 3: Check for sc_cobrar_pagar = 'C' ─────────────────────────────
    try {
      const cRows = await consultaSagJson(
        config,
        `SELECT TOP 3 * FROM ${viewName} WHERE sc_cobrar_pagar = 'C'`,
      );
      results.hasCobrarPagar = true;
      results.cobrarPagarCSampleCount = cRows.length;
      results.cobrarPagarCSample = cRows;
    } catch {
      // Field might not exist or have different name
      results.hasCobrarPagar = false;
    }

    // ── Step 4: Distinct field analysis ──────────────────────────────────────
    // Try common date/amount/document fields for diagnostics
    const diagnosticQueries = [
      {
        key: "dateRange",
        sql: `SELECT MIN(Fecha_Documento) AS min_date, MAX(Fecha_Documento) AS max_date FROM ${viewName}`,
      },
      {
        key: "distinctCustomers",
        sql: `SELECT COUNT(DISTINCT Nit_Tercero) AS distinct_customers FROM ${viewName}`,
      },
      {
        key: "distinctRecaudos",
        sql: `SELECT COUNT(DISTINCT Numero_Documento) AS distinct_recaudos FROM ${viewName}`,
      },
      {
        key: "nullCustomerIds",
        sql: `SELECT COUNT(*) AS null_nits FROM ${viewName} WHERE Nit_Tercero IS NULL`,
      },
      {
        key: "nullDocumentRefs",
        sql: `SELECT COUNT(*) AS null_docs FROM ${viewName} WHERE Numero_Documento IS NULL`,
      },
      {
        key: "nullAmounts",
        sql: `SELECT COUNT(*) AS null_amounts FROM ${viewName} WHERE Valor_Pagado IS NULL`,
      },
    ];

    const diagnostics: Record<string, unknown> = {};
    for (const dq of diagnosticQueries) {
      try {
        const rows = await consultaSagJson(config, dq.sql);
        diagnostics[dq.key] = rows[0] ?? null;
      } catch (err: unknown) {
        diagnostics[dq.key] = {
          error: err instanceof Error ? err.message : String(err),
        };
      }
    }
    results.diagnostics = diagnostics;

    // ── Step 5: Check for Documento_pagado (applied invoice) field ──────────
    try {
      const appliedRows = await consultaSagJson(
        config,
        `SELECT TOP 5 Numero_Documento, Documento_pagado, Valor_Pagado, Nit_Tercero FROM ${viewName} WHERE Documento_pagado IS NOT NULL`,
      );
      results.hasDocumentoPagado = true;
      results.appliedInvoiceSample = appliedRows;
    } catch {
      results.hasDocumentoPagado = false;
    }
  }

  results.probeFinishedAt = new Date().toISOString();

  return NextResponse.json(results);
}
