/**
 * Post-import Comparativo Año/Mes validation tool.
 * Queries the DB directly and prints a table you can compare against Excel.
 *
 * Usage:
 *   npx tsx scripts/check-comparativo.ts <orgSlug> <startYYYYMM> [endYYYYMM]
 *
 * Example:
 *   npx tsx scripts/check-comparativo.ts castillitos 202401 202412
 *   npx tsx scripts/check-comparativo.ts castillitos 202403
 *
 * Output:
 *   - Comparativo table (current vs prior year, growth %)
 *   - YTD totals
 *   - Per-seller subtotals for the range
 *   - Seller × period breakdown for spot-checking
 */

import { prisma }                   from "../lib/prisma";
import {
  getComparativoAnoMes,
  getParticipacionVendedor,
  getPedidosResumidos,
}                                   from "../lib/sales/reports";

// ── CLI args ──────────────────────────────────────────────────────────────────

const [orgSlug, startArg, endArg] = process.argv.slice(2);

if (!orgSlug || !startArg) {
  console.error("Usage: npx tsx scripts/check-comparativo.ts <orgSlug> <startYYYYMM> [endYYYYMM]");
  process.exit(1);
}

if (!/^\d{6}$/.test(startArg) || (endArg && !/^\d{6}$/.test(endArg))) {
  console.error("Periods must be YYYYMM (e.g. 202403)");
  process.exit(1);
}

const start = startArg;
const end   = endArg ?? startArg;

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  // Resolve org
  const org = await prisma.organization.findUnique({
    where:  { slug: orgSlug },
    select: { id: true, name: true },
  });
  if (!org) {
    console.error(`Org not found: ${orgSlug}`);
    process.exit(1);
  }

  console.log("\n═══════════════════════════════════════════════════════════");
  console.log(`  COMPARATIVO AÑO/MES — ${org.name}`);
  console.log(`  Period: ${start} → ${end}`);
  console.log("═══════════════════════════════════════════════════════════\n");

  // ── 1. Comparativo Año/Mes ────────────────────────────────────────────────

  const comparativo = await getComparativoAnoMes(org.id, start, end);

  if (comparativo.length === 0) {
    console.log("  ⚠  No data found. Import a CSV first.\n");
    await prisma.$disconnect();
    return;
  }

  console.log("── Comparativo mensual ──────────────────────────────────────");
  console.log(
    "  PERIOD".padEnd(10),
    "CURRENT".padStart(18),
    "PRIOR YEAR".padStart(18),
    "GROWTH %".padStart(10),
    "TX".padStart(8)
  );
  console.log("  " + "─".repeat(66));

  let ytdCurrent  = 0;
  let ytdPrior    = 0;

  for (const row of comparativo) {
    ytdCurrent += row.totalAmount;
    ytdPrior   += row.prevYearAmount ?? 0;

    const growth = row.pctChange != null
      ? `${row.pctChange > 0 ? "+" : ""}${row.pctChange.toFixed(1)}%`
      : "—";
    const growthColored =
      row.pctChange == null  ? growth
      : row.pctChange >= 0   ? `+${row.pctChange.toFixed(1)}%`
      :                         `${row.pctChange.toFixed(1)}%`;

    console.log(
      `  ${row.periodo}`.padEnd(10),
      fmtCOP(row.totalAmount).padStart(18),
      (row.prevYearAmount != null ? fmtCOP(row.prevYearAmount) : "—").padStart(18),
      growthColored.padStart(10),
      (row.txCount != null ? String(row.txCount) : "—").padStart(8)
    );
  }

  console.log("  " + "─".repeat(66));
  const ytdGrowth = ytdPrior > 0
    ? `${((ytdCurrent - ytdPrior) / ytdPrior * 100).toFixed(1)}%`
    : "—";
  console.log(
    "  YTD".padEnd(10),
    fmtCOP(ytdCurrent).padStart(18),
    fmtCOP(ytdPrior).padStart(18),
    ytdGrowth.padStart(10)
  );
  console.log();

  // ── 2. Participación Vendedor ─────────────────────────────────────────────

  const participacion = await getParticipacionVendedor(org.id, start, end);

  console.log("── Participación vendedor ────────────────────────────────────");
  console.log(
    "  SELLER".padEnd(25),
    "AMOUNT".padStart(18),
    "SHARE".padStart(8),
    "TX".padStart(8)
  );
  console.log("  " + "─".repeat(61));

  for (const row of participacion) {
    console.log(
      `  ${truncate(row.sellerName, 24)}`.padEnd(25),
      fmtCOP(row.totalAmount).padStart(18),
      `${row.share.toFixed(1)}%`.padStart(8),
      (row.txCount != null ? String(row.txCount) : "—").padStart(8)
    );
  }
  console.log();

  // ── 3. Pedidos Resumidos (first 20 rows) ──────────────────────────────────

  const pedidos = await getPedidosResumidos(org.id, start, end);

  console.log("── Pedidos resumidos (top 20 by amount) ─────────────────────");
  console.log(
    "  PERIOD".padEnd(9),
    "SELLER".padEnd(18),
    "STORE".padEnd(16),
    "LINE".padEnd(12),
    "CH".padEnd(14),
    "AMOUNT".padStart(16),
    "AVG TICKET".padStart(12)
  );
  console.log("  " + "─".repeat(97));

  for (const row of pedidos.slice(0, 20)) {
    console.log(
      `  ${row.periodo}`.padEnd(9),
      truncate(row.sellerName, 17).padEnd(18),
      truncate(row.storeName, 15).padEnd(16),
      truncate(row.productLine, 11).padEnd(12),
      row.channel.padEnd(14),
      fmtCOP(row.totalAmount).padStart(16),
      (row.avgTicket != null ? fmtCOP(row.avgTicket) : "—").padStart(12)
    );
  }
  if (pedidos.length > 20) {
    console.log(`  … ${pedidos.length - 20} more rows`);
  }
  console.log();

  // ── 4. Spot-check: raw DB counts ─────────────────────────────────────────

  const rawCounts: Array<{ periodo: string; cnt: bigint; total: string }> =
    await prisma.$queryRaw`
      SELECT
        sr."periodoAoMes"            AS periodo,
        COUNT(*)                     AS cnt,
        CAST(SUM(sr.amount) AS TEXT) AS total
      FROM   "SaleRecord" sr
      WHERE  sr."organizationId" = ${org.id}
        AND  sr."periodoAoMes" IS NOT NULL
        AND  sr."periodoAoMes" BETWEEN ${start} AND ${end}
      GROUP  BY sr."periodoAoMes"
      ORDER  BY sr."periodoAoMes"
    `;

  console.log("── Raw DB row counts (cross-check) ──────────────────────────");
  for (const r of rawCounts) {
    console.log(`  ${r.periodo}  ${String(r.cnt).padStart(6)} records   ${fmtCOP(Number(r.total))}`);
  }
  console.log();

  // ── 5. Validation checklist ───────────────────────────────────────────────

  console.log("── Validation checklist ─────────────────────────────────────");
  console.log("  Compare these values against your Excel outputs:\n");
  console.log("  □ YTD total matches Excel grand total for the same period.");
  console.log("  □ Each month's total matches the corresponding Excel tab/row.");
  console.log("  □ Seller shares sum to 100% and match Excel's ranking.");
  console.log("  □ Row counts match Excel row counts (after removing headers).");
  console.log("  □ Prior-year column is populated (requires last year's import).");
  console.log();
  console.log("  Common mismatch causes:");
  console.log("  • Double-counting: same file imported twice → check batchId, run");
  console.log("    again with same scopeKey to trigger replacement.");
  console.log("  • Missing prior-year data: import last year's CSV with matching");
  console.log("    scopeKey to populate prevYearAmount.");
  console.log("  • Seller name drift: SAG sometimes exports code (V001) instead");
  console.log("    of name — different slugs = different rows, totals split.");
  console.log("  • Channel OTRO: rows not matched to a channel enum; add raw");
  console.log("    value to CHANNEL_MAP in lib/sales/normalize.ts.");
  console.log("  • Amount format: COP and USD mixed in same file — check rawJson");
  console.log("    of suspicious rows in the DB.\n");

  await prisma.$disconnect();
}

main().catch(e => {
  console.error(e);
  prisma.$disconnect();
  process.exit(1);
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtCOP(n: number): string {
  return new Intl.NumberFormat("es-CO", {
    style: "currency", currency: "COP",
    minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(n);
}

function truncate(s: string, len: number): string {
  return s.length > len ? s.slice(0, len - 1) + "…" : s;
}
