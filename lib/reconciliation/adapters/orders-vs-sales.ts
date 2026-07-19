/**
 * Orders vs Sales reconciliation adapter.
 *
 * Compares SaleRecord grouped by (sellerSlug, productLine, channel) across
 * two different import sources within the same period.
 *
 * Source identification: via SalesImportBatch.source joined through importBatchId.
 * If a source has no records for the period, all keys from the other side appear
 * as ONLY_IN_A or ONLY_IN_B accordingly.
 */

import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { reconcile } from "../engine";
import type { ReconResult, ReconSide } from "../types";

// ── fetchReconSide ────────────────────────────────────────────────────────────

export async function fetchReconSide(
  organizationId: string,
  period:         string,
  importSource:   string,    // "sag_pya" | "csv" | "all"
): Promise<ReconSide[]> {
  type RawRow = {
    key:          string;
    label:        string;
    amount:       number;
    rows:         string;
    seller_name:  string;
    product_line: string;
    channel:      string;
  };

  let rows: RawRow[];

  if (importSource === "all") {
    rows = await prisma.$queryRaw<RawRow[]>(Prisma.sql`
      SELECT
        sr."sellerSlug" || '|' || sr."productLine" || '|' || CAST(sr."channel" AS TEXT)       AS key,
        sr."sellerSlug" || ' / ' || sr."productLine" || ' / ' || CAST(sr."channel" AS TEXT)   AS label,
        SUM(sr."amount")::float8                    AS amount,
        CAST(COUNT(*) AS TEXT)                      AS rows,
        MAX(sr."sellerName")                        AS seller_name,
        sr."productLine"                            AS product_line,
        CAST(sr."channel" AS TEXT)                  AS channel
      FROM "SaleRecord" sr
      JOIN "SalesImportBatch" sib ON sib.id = sr."importBatchId"
      WHERE sr."organizationId" = ${organizationId}
        AND sr."periodoAoMes"   = ${period}
        AND sr."productLine"    NOT ILIKE 'Total %'
        AND sr."productLine"    NOT ILIKE 'Subtotal%'
      GROUP BY sr."sellerSlug", sr."productLine", sr."channel"
      ORDER BY amount DESC
    `);
  } else {
    rows = await prisma.$queryRaw<RawRow[]>(Prisma.sql`
      SELECT
        sr."sellerSlug" || '|' || sr."productLine" || '|' || CAST(sr."channel" AS TEXT)       AS key,
        sr."sellerSlug" || ' / ' || sr."productLine" || ' / ' || CAST(sr."channel" AS TEXT)   AS label,
        SUM(sr."amount")::float8                    AS amount,
        CAST(COUNT(*) AS TEXT)                      AS rows,
        MAX(sr."sellerName")                        AS seller_name,
        sr."productLine"                            AS product_line,
        CAST(sr."channel" AS TEXT)                  AS channel
      FROM "SaleRecord" sr
      JOIN "SalesImportBatch" sib ON sib.id = sr."importBatchId"
      WHERE sr."organizationId" = ${organizationId}
        AND sr."periodoAoMes"   = ${period}
        AND sr."productLine"    NOT ILIKE 'Total %'
        AND sr."productLine"    NOT ILIKE 'Subtotal%'
        AND sib."source"        = ${importSource}
      GROUP BY sr."sellerSlug", sr."productLine", sr."channel"
      ORDER BY amount DESC
    `);
  }

  return rows.map(r => ({
    key:    r.key,
    label:  r.label,
    amount: r.amount,
    rows:   Number(r.rows),
    meta: {
      sellerName:  r.seller_name,
      productLine: r.product_line,
      channel:     r.channel,
    },
  }));
}

// ── getAvailableSources ───────────────────────────────────────────────────────

export async function getAvailableSources(
  organizationId: string,
  period:         string,
): Promise<Array<{ source: string; batchCount: number; recordCount: number }>> {
  type RawRow = {
    source:       string;
    batch_count:  string;
    record_count: string;
  };

  const rows = await prisma.$queryRaw<RawRow[]>(Prisma.sql`
    SELECT
      sib."source"                         AS source,
      CAST(COUNT(DISTINCT sib.id) AS TEXT) AS batch_count,
      CAST(COUNT(sr.id)           AS TEXT) AS record_count
    FROM "SalesImportBatch" sib
    JOIN "SaleRecord" sr ON sr."importBatchId" = sib.id
    WHERE sib."organizationId" = ${organizationId}
      AND sr."periodoAoMes"    = ${period}
    GROUP BY sib."source"
    ORDER BY sib."source"
  `);

  return rows.map(r => ({
    source:      r.source,
    batchCount:  Number(r.batch_count),
    recordCount: Number(r.record_count),
  }));
}

// ── runOrdersVsSalesRecon ─────────────────────────────────────────────────────

export async function runOrdersVsSalesRecon(
  organizationId: string,
  period:         string,
  sourceAKey:     string,
  sourceBKey:     string,
): Promise<ReconResult> {
  const [sideA, sideB] = await Promise.all([
    fetchReconSide(organizationId, period, sourceAKey),
    fetchReconSide(organizationId, period, sourceBKey),
  ]);

  return reconcile(sideA, sideB, {
    reconType:    "orders_vs_sales",
    scope:        `period:${period}`,
    sourceALabel: sourceAKey === "all" ? "Todas las fuentes (A)" : sourceAKey,
    sourceBLabel: sourceBKey === "all" ? "Todas las fuentes (B)" : sourceBKey,
  });
}
