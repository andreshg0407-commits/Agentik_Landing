/**
 * scripts/reconcile-imports-05a2r1-sales.ts
 *
 * Section C: Reconcile sales for 5 references against SAG vw_agentik_ventas.
 *
 * Compares CustomerOrderLine aggregates against SAG for:
 * - 34852-3, 34852-2, 3747-5, 3747-17, 34831-8
 *
 * Per-reference per-window (6M, 8M, 12M):
 * - unidades netas
 * - ventas netas (revenue)
 * - documentos distintos
 * - ultima venta
 *
 * Usage: bun run scripts/reconcile-imports-05a2r1-sales.ts
 */

import { consultaSagJson } from "@/lib/connectors/pya/client";
import { getSagConnection } from "@/lib/connectors/pya/sag-source-router";
import { prisma } from "@/lib/prisma";
import { subtractCalendarMonths, nowBogota } from "@/lib/comercial/importaciones/calendar-months";

const REFS = ["34852-3", "34852-2", "3747-5", "3747-17", "34831-8"];
const ORG_SLUG = "castillitos";

async function main() {
  console.log("=== IMPORTS 05A2R1 — Sales Reconciliation ===\n");

  // 1. Get org ID
  const org = await (prisma as any).organization.findFirst({ where: { slug: ORG_SLUG } });
  if (!org) { console.error("Org not found"); process.exit(1); }
  const orgId = org.id;

  // 2. Compute anchored cutoffs
  const today = nowBogota();
  const cutoff6m = subtractCalendarMonths(today, 6);
  const cutoff8m = subtractCalendarMonths(today, 8);
  const cutoff12m = subtractCalendarMonths(today, 12);

  console.log(`Today (Bogota): ${today.toISOString().split("T")[0]}`);
  console.log(`Cutoff 6M: ${cutoff6m.toISOString().split("T")[0]}`);
  console.log(`Cutoff 8M: ${cutoff8m.toISOString().split("T")[0]}`);
  console.log(`Cutoff 12M: ${cutoff12m.toISOString().split("T")[0]}\n`);

  // 3. Query SAG vw_agentik_ventas
  const escaped = REFS.map(r => `'${r}'`).join(",");
  const sagQuery = `
    SELECT CODIGO_PRODUCTO, ID_DOCUMENTO, NUMERO_DOCUMENTO, TIPO_DOCUMENTO,
           ESTADO_DOCUMENTO, FECHA_DOCUMENTO, CANTIDAD, VALOR_TOTAL
    FROM vw_agentik_ventas
    WHERE CODIGO_PRODUCTO IN (${escaped})
      AND ESTADO_DOCUMENTO <> 'ANULADO'
  `;

  console.log("Querying SAG vw_agentik_ventas...");
  let sagRows: any[] = [];
  try {
    const config = getSagConnection("CURRENT");
    sagRows = await consultaSagJson(config, sagQuery);
    console.log(`SAG returned ${sagRows.length} rows\n`);
  } catch (err) {
    console.error("SAG query failed:", err);
    console.log("RULING: IMPORTS_SALES_SOURCE_MISMATCH — cannot verify without SAG\n");
    process.exit(1);
  }

  // 4. Query CustomerOrderLine (Neon)
  console.log("Querying CustomerOrderLine (Neon)...");
  const neonLines = await (prisma as any).customerOrderLine.findMany({
    where: {
      organizationId: orgId,
      referenceCode: { in: REFS },
      order: { status: "FACTURADO" },
    },
    select: {
      referenceCode: true,
      quantity: true,
      unitValue: true,
      order: { select: { orderDate: true, sourceCode: true } },
    },
  });
  console.log(`Neon returned ${neonLines.length} lines\n`);

  // 5. Aggregate both sources per ref per window
  interface Agg {
    unitsNet: number;
    revenueNet: number;
    docs: Set<string>;
    lastDate: string | null;
  }

  function emptyAgg(): Agg { return { unitsNet: 0, revenueNet: 0, docs: new Set(), lastDate: null }; }

  for (const ref of REFS) {
    console.log(`─── ${ref} ───`);

    // SAG aggregation
    const sagForRef = sagRows.filter((r: any) => r.CODIGO_PRODUCTO === ref);
    const sagAgg: Record<string, Agg> = { "6M": emptyAgg(), "8M": emptyAgg(), "12M": emptyAgg(), "ALL": emptyAgg() };

    for (const row of sagForRef) {
      const fecha = String(row.FECHA_DOCUMENTO ?? "").substring(0, 10);
      const qty = Number(row.CANTIDAD ?? 0);
      const valor = Number(row.VALOR_TOTAL ?? 0);
      const docId = String(row.NUMERO_DOCUMENTO ?? row.ID_DOCUMENTO ?? "");
      const dt = new Date(fecha);

      sagAgg.ALL.unitsNet += qty;
      sagAgg.ALL.revenueNet += valor;
      sagAgg.ALL.docs.add(docId);
      if (!sagAgg.ALL.lastDate || fecha > sagAgg.ALL.lastDate) sagAgg.ALL.lastDate = fecha;

      if (dt >= cutoff6m) { sagAgg["6M"].unitsNet += qty; sagAgg["6M"].revenueNet += valor; sagAgg["6M"].docs.add(docId); if (!sagAgg["6M"].lastDate || fecha > sagAgg["6M"].lastDate) sagAgg["6M"].lastDate = fecha; }
      if (dt >= cutoff8m) { sagAgg["8M"].unitsNet += qty; sagAgg["8M"].revenueNet += valor; sagAgg["8M"].docs.add(docId); if (!sagAgg["8M"].lastDate || fecha > sagAgg["8M"].lastDate) sagAgg["8M"].lastDate = fecha; }
      if (dt >= cutoff12m) { sagAgg["12M"].unitsNet += qty; sagAgg["12M"].revenueNet += valor; sagAgg["12M"].docs.add(docId); if (!sagAgg["12M"].lastDate || fecha > sagAgg["12M"].lastDate) sagAgg["12M"].lastDate = fecha; }
    }

    // Neon aggregation
    const neonForRef = neonLines.filter((l: any) => l.referenceCode === ref);
    const neonAgg: Record<string, Agg> = { "6M": emptyAgg(), "8M": emptyAgg(), "12M": emptyAgg(), "ALL": emptyAgg() };

    for (const line of neonForRef) {
      const dt = new Date(line.order.orderDate);
      const qty = Number(line.quantity ?? 0);
      const uv = Number(line.unitValue ?? 0);
      const revenue = Math.abs(qty) * uv * (qty >= 0 ? 1 : -1);
      const fecha = dt.toISOString().split("T")[0];
      const docId = line.order.sourceCode ?? "";

      neonAgg.ALL.unitsNet += qty;
      neonAgg.ALL.revenueNet += revenue;
      neonAgg.ALL.docs.add(docId);
      if (!neonAgg.ALL.lastDate || fecha > neonAgg.ALL.lastDate) neonAgg.ALL.lastDate = fecha;

      if (dt >= cutoff6m) { neonAgg["6M"].unitsNet += qty; neonAgg["6M"].revenueNet += revenue; neonAgg["6M"].docs.add(docId); if (!neonAgg["6M"].lastDate || fecha > neonAgg["6M"].lastDate) neonAgg["6M"].lastDate = fecha; }
      if (dt >= cutoff8m) { neonAgg["8M"].unitsNet += qty; neonAgg["8M"].revenueNet += revenue; neonAgg["8M"].docs.add(docId); if (!neonAgg["8M"].lastDate || fecha > neonAgg["8M"].lastDate) neonAgg["8M"].lastDate = fecha; }
      if (dt >= cutoff12m) { neonAgg["12M"].unitsNet += qty; neonAgg["12M"].revenueNet += revenue; neonAgg["12M"].docs.add(docId); if (!neonAgg["12M"].lastDate || fecha > neonAgg["12M"].lastDate) neonAgg["12M"].lastDate = fecha; }
    }

    for (const window of ["6M", "8M", "12M", "ALL"] as const) {
      const sag = sagAgg[window];
      const neon = neonAgg[window];
      const unitDiff = neon.unitsNet - sag.unitsNet;
      const revDiff = neon.revenueNet - sag.revenueNet;
      const docsDiff = neon.docs.size - sag.docs.size;
      const match = Math.abs(unitDiff) < 2 && Math.abs(docsDiff) < 2;

      console.log(`  ${window}: SAG units=${sag.unitsNet} rev=$${Math.round(sag.revenueNet)} docs=${sag.docs.size} last=${sag.lastDate ?? "-"}`);
      console.log(`        NEON units=${neon.unitsNet} rev=$${Math.round(neon.revenueNet)} docs=${neon.docs.size} last=${neon.lastDate ?? "-"}`);
      console.log(`        DIFF units=${unitDiff} rev=$${Math.round(revDiff)} docs=${docsDiff} → ${match ? "MATCH" : "MISMATCH"}`);
    }
    console.log();
  }

  console.log("=== Reconciliation complete ===");
  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
