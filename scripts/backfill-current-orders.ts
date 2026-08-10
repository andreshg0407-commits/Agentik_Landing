/**
 * scripts/backfill-current-orders.ts
 *
 * AGENTIK-CURRENT-SAG-ORDER-INGESTION-01 — auditoría §1–§4 + backfill §6–§7
 * + pruebas §6/§7/§9 con datos reales.
 *
 * Fases:
 *   1. AUDIT  (read-only): fuente CURRENT vs local + ConnectorRun + ROOT_CAUSE
 *   2. BACKFILL (omitida con AUDIT_ONLY=1): runCurrentOrderIngestion desde el
 *      cutover exacto 2026-07-21 — idempotente, CURRENT-only
 *   3. PROOFS: sin gap ni overlap en el cutover, duplicados=0, headers
 *      con/sin líneas, huérfanas, y auditoría de cutover de otros módulos (§9)
 *
 * HISTORICAL (<= 2026-07-20) solo se LEE para validación. Jamás se escribe.
 *
 * Run (Mac): npx tsx --env-file=.env -r ./scripts/_mock-server-only.cjs \
 *              scripts/backfill-current-orders.ts
 *   AUDIT_ONLY=1  → solo fase 1 (cero escrituras)
 *   DRY_RUN=1     → fase 2 en dry-run (lee fuente, no escribe)
 */

const mockServerOnly = require("./_mock-server-only.cjs");
void mockServerOnly;

import * as fs from "node:fs";
import { prisma } from "@/lib/prisma";
import { getSagConnection, describeSagConnection } from "@/lib/connectors/pya/sag-source-router";
import { consultaSagJson } from "@/lib/connectors/pya/client";
import {
  runCurrentOrderIngestion,
  CURRENT_CUTOVER,
  CURRENT_CUTOVER_ISO,
} from "@/lib/connectors/adapters/sag-pya-soap/orders/current-order-ingestion";

const db = prisma as any;
const HIST_END_ISO = "2026-07-20";

async function localSnapshot(orgId: string) {
  const [headersCur, headersHist] = await Promise.all([
    db.customerOrderRecord.count({ where: { organizationId: orgId, orderDate: { gte: CURRENT_CUTOVER } } }),
    db.customerOrderRecord.count({ where: { organizationId: orgId, orderDate: { lt: CURRENT_CUTOVER } } }),
  ]);
  const linesCur = await db.customerOrderLine.count({
    where: { organizationId: orgId, order: { orderDate: { gte: CURRENT_CUTOVER } } },
  });
  const newest = await db.customerOrderRecord.findFirst({
    where: { organizationId: orgId }, orderBy: { orderDate: "desc" }, select: { orderDate: true },
  });
  const newestLine = await db.customerOrderRecord.findFirst({
    where: { organizationId: orgId, lines: { some: {} } }, orderBy: { orderDate: "desc" }, select: { orderDate: true },
  });
  const maxHist = await db.customerOrderRecord.findFirst({
    where: { organizationId: orgId, orderDate: { lt: CURRENT_CUTOVER } }, orderBy: { orderDate: "desc" }, select: { orderDate: true },
  });
  const minCur = await db.customerOrderRecord.findFirst({
    where: { organizationId: orgId, orderDate: { gte: CURRENT_CUTOVER } }, orderBy: { orderDate: "asc" }, select: { orderDate: true },
  });
  return {
    headersCur, headersHist, linesCur,
    newestOrder: newest?.orderDate?.toISOString().slice(0, 10) ?? null,
    newestLineOrder: newestLine?.orderDate?.toISOString().slice(0, 10) ?? null,
    maxHistorical: maxHist?.orderDate?.toISOString().slice(0, 10) ?? null,
    minCurrent: minCur?.orderDate?.toISOString().slice(0, 10) ?? null,
  };
}

async function main() {
  const org = await db.organization.findFirst({
    where: { slug: process.env.VALIDATE_ORG_SLUG ?? "castillitos" }, select: { id: true, slug: true },
  });
  if (!org) { console.log("✗ Organization not found"); process.exit(1); }
  const orgId = org.id;
  const report: Record<string, unknown> = { sprint: "CURRENT-SAG-ORDER-INGESTION-01", org: org.slug };
  console.log(`\n═══ CURRENT ORDER INGESTION · ${org.slug} · cutover=${CURRENT_CUTOVER_ISO} ═══`);
  console.log(`Fuente CURRENT: ${JSON.stringify(describeSagConnection("CURRENT"))}`);
  console.log(`Fuente HISTORICAL (solo referencia): ${JSON.stringify(describeSagConnection("HISTORICAL"))}`);

  // ══ §1 FUENTE CURRENT (read-only) ═══════════════════════════════════════
  const cfg = getSagConnection("CURRENT");
  const q = `SELECT COUNT(DISTINCT m.ka_nl_movimiento) AS orders, COUNT(DISTINCT m.ka_nl_tercero) AS customers, MIN(m.d_fecha_documento) AS mind, MAX(m.d_fecha_documento) AS maxd FROM MOVIMIENTOS m JOIN FUENTES f ON f.ka_ni_fuente = m.ka_ni_fuente WHERE m.sc_anulado = 'N' AND f.k_n_clase_fuente = 4 AND m.d_fecha_documento >= '${CURRENT_CUTOVER_ISO}'`;
  const r1: any[] = await consultaSagJson(cfg, q);
  const ql = `SELECT COUNT(*) AS c FROM MOVIMIENTOS_ITEMS mi JOIN MOVIMIENTOS m ON m.ka_nl_movimiento = mi.ka_nl_movimiento JOIN FUENTES f ON f.ka_ni_fuente = m.ka_ni_fuente WHERE m.sc_anulado = 'N' AND f.k_n_clase_fuente = 4 AND m.d_fecha_documento >= '${CURRENT_CUTOVER_ISO}'`;
  const r2: any[] = await consultaSagJson(cfg, ql);
  const src = {
    orders: Number(r1?.[0]?.orders ?? 0), customers: Number(r1?.[0]?.customers ?? 0),
    minDate: String(r1?.[0]?.mind ?? "").slice(0, 10), maxDate: String(r1?.[0]?.maxd ?? "").slice(0, 10),
    lines: Number(r2?.[0]?.c ?? 0),
  };
  console.log(`\n§1 CURRENT LUDISAM: CURRENT_ORDERS_SINCE_${CURRENT_CUTOVER_ISO}=${src.orders} · CUSTOMERS=${src.customers} · LINES=${src.lines} · MIN=${src.minDate} · MAX=${src.maxDate}`);

  // ══ §2 LOCAL BEFORE ═════════════════════════════════════════════════════
  const before = await localSnapshot(orgId);
  console.log(`\n§2 LOCAL BEFORE: headersCur=${before.headersCur} · linesCur=${before.linesCur} · newestOrder=${before.newestOrder} · newestLineOrder=${before.newestLineOrder}`);
  console.log(`  MISSING_CURRENT_HEADERS=${src.orders - before.headersCur} · MISSING_CURRENT_LINES=${src.lines - before.linesCur}`);
  console.log(`  FIRST/LAST_MISSING_ORDER_DATE=${before.headersCur === 0 ? `${src.minDate} → ${src.maxDate}` : "(parcial — ver detalle post-backfill)"}`);

  // ══ §3 CONNECTOR RUNS desde cutover ═════════════════════════════════════
  console.log(`\n§3 CONNECTOR RUNS (desde ${CURRENT_CUTOVER_ISO})`);
  for (const mod of ["movements", "orders", "order_lines"]) {
    const runs: Array<{ status: string; startedAt: Date; finishedAt: Date | null; rowsImported: number | null }> =
      await db.connectorRun.findMany({
        where: { module: mod, startedAt: { gte: CURRENT_CUTOVER } },
        orderBy: { startedAt: "desc" },
        select: { status: true, startedAt: true, finishedAt: true, rowsImported: true },
      });
    const tally = new Map<string, number>();
    for (const r of runs) tally.set(r.status, (tally.get(r.status) ?? 0) + 1);
    const last = runs[0];
    console.log(`  ${mod}: RUN_COUNT=${runs.length} · [${[...tally].map(([s, n]) => `${s}:${n}`).join(" ")}] · LAST=${last ? `${last.startedAt.toISOString().slice(0, 19)}→${last.finishedAt?.toISOString().slice(11, 19) ?? "…"} rows=${last.rowsImported ?? 0}` : "NUNCA"}`);
  }

  // ══ §4 ROOT CAUSE (evidenciada) ═════════════════════════════════════════
  const ordersRuns = await db.connectorRun.count({ where: { module: "orders", startedAt: { gte: CURRENT_CUTOVER } } });
  const ordersPartial = await db.connectorRun.count({ where: { module: "orders", startedAt: { gte: CURRENT_CUTOVER }, status: "PARTIAL" } });
  let rootCause: string;
  if (src.orders === 0) rootCause = "NO_GAP (fuente CURRENT sin pedidos post-cutover)";
  else if (before.headersCur > 0) rootCause = "PARTIAL (ya hay ingesta parcial — ver §2)";
  else if (ordersRuns === 0) rootCause = "ORDERS_MODULE_NOT_EXECUTED (cero ConnectorRun del módulo orders desde el cutover — el cron compartido SAG nunca ejecutó el módulo orders)";
  else if (ordersPartial === ordersRuns) rootCause = "ORDERS_ALL_PARTIAL (todas las corridas PARTIAL — el módulo corre pero falla parcialmente)";
  else rootCause = "CURRENT_CURSOR_STALE|CURRENT_QUERY_FILTER|ORDER_STORAGE_FAILURE (corre pero no persiste — ver tallies §3)";
  console.log(`\n§4 ROOT_CAUSE=${rootCause}`);

  Object.assign(report, { source: src, before, rootCause });

  // ══ §6 BACKFILL ═════════════════════════════════════════════════════════
  if (process.env.AUDIT_ONLY === "1") {
    console.log(`\nAUDIT_ONLY=1 — sin backfill.`);
  } else {
    const dryRun = process.env.DRY_RUN === "1";
    console.log(`\n§6 BACKFILL desde ${CURRENT_CUTOVER_ISO} (dryRun=${dryRun}) — CURRENT-only, idempotente`);
    const r = await runCurrentOrderIngestion({ organizationId: orgId, sinceDate: null, dryRun });
    console.log(`  headersRead=${r.headersRead} eligible=${r.headersEligible} rejectedPreCutover=${r.headersRejectedPreCutover} imported=${r.headersImported} errored=${r.headersErrored}`);
    console.log(`  range=${r.minOrderDate}→${r.maxOrderDate} · lines: created=${r.lines?.linesCreated ?? 0} updated=${r.lines?.linesUpdated ?? 0} errored=${r.lines?.linesErrored ?? 0} · ${r.durationMs}ms${r.error ? ` · ERROR=${r.error}` : ""}`);
    // G. rerun idempotente
    if (!dryRun) {
      const r2b = await runCurrentOrderIngestion({ organizationId: orgId, sinceDate: null });
      console.log(`  RERUN(G): imported=${r2b.headersImported} (upserts estables) · lines created=${r2b.lines?.linesCreated ?? 0} (esperado 0 nuevos)`);
      (report as any).rerun = { headersImported: r2b.headersImported, linesCreated: r2b.lines?.linesCreated ?? 0 };
    }
    (report as any).backfill = r;
  }

  // ══ §6/§7 PROOFS ════════════════════════════════════════════════════════
  const after = await localSnapshot(orgId);
  console.log(`\n§6–§7 PRUEBAS POST`);
  console.log(`  NEWEST_LOCAL_ORDER_AFTER=${after.newestOrder} · NEWEST_LOCAL_LINE_AFTER=${after.newestLineOrder}`);
  console.log(`  CUTOVER: maxHistorical=${after.maxHistorical} (esperado <= ${HIST_END_ISO}) · minCurrent=${after.minCurrent} (esperado >= ${CURRENT_CUTOVER_ISO})`);
  const overlap = after.maxHistorical !== null && after.maxHistorical >= CURRENT_CUTOVER_ISO;
  const gap = src.orders > 0 && after.headersCur === 0;
  console.log(`  CUTOVER_OVERLAP=${overlap ? "✗ SÍ (violación)" : "NO"} · CUTOVER_GAP_AFTER=${gap ? "✗ SÍ" : "NO"}`);
  // Duplicados (H/I)
  const dupHeaders: any[] = await db.$queryRawUnsafe(
    `SELECT "erpMovId", COUNT(*) c FROM "CustomerOrderRecord" WHERE "organizationId" = $1 GROUP BY "erpMovId" HAVING COUNT(*) > 1 LIMIT 5`, orgId);
  const dupLines: any[] = await db.$queryRawUnsafe(
    `SELECT "erpItemId", COUNT(*) c FROM "CustomerOrderLine" WHERE "organizationId" = $1 GROUP BY "erpItemId" HAVING COUNT(*) > 1 LIMIT 5`, orgId);
  console.log(`  DUPLICATE_HEADERS=${dupHeaders.length} · DUPLICATE_LINES=${dupLines.length}`);
  // Headers con/sin líneas (solo CURRENT)
  const curWithLines = await db.customerOrderRecord.count({
    where: { organizationId: orgId, orderDate: { gte: CURRENT_CUTOVER }, lines: { some: {} } } });
  const curNoLines = after.headersCur - curWithLines;
  console.log(`  CURRENT headers con líneas=${curWithLines} · sin líneas=${curNoLines} (verificar legitimidad de los sin-líneas contra ITEMS de la fuente)`);
  // Huérfanas: imposibles por FK — probado con conteo
  const orphan: any[] = await db.$queryRawUnsafe(
    `SELECT COUNT(*) c FROM "CustomerOrderLine" l LEFT JOIN "CustomerOrderRecord" o ON o.id = l."orderId" WHERE l."organizationId" = $1 AND o.id IS NULL`, orgId);
  console.log(`  ORPHAN_LINES=${Number(orphan?.[0]?.c ?? 0)}`);

  // ══ §9 CONTRATO CURRENT EN OTROS MÓDULOS (solo lectura, sin refactor) ═══
  console.log(`\n§9 CUTOVER EN OTROS MÓDULOS OPERACIONALES (audit-only)`);
  const modules: Array<{ name: string; table: string; dateCol: string }> = [
    { name: "store_sales(StoreSaleLineRecord)", table: "StoreSaleLineRecord", dateCol: "documentDate" },
    { name: "movements(SaleRecord)", table: "SaleRecord", dateCol: "saleDate" },
    { name: "orders(CustomerOrderRecord)", table: "CustomerOrderRecord", dateCol: "orderDate" },
  ];
  for (const m of modules) {
    try {
      const rows: any[] = await db.$queryRawUnsafe(
        `SELECT MAX(CASE WHEN "${m.dateCol}" < '${CURRENT_CUTOVER_ISO}' THEN "${m.dateCol}" END) AS histmax, MIN(CASE WHEN "${m.dateCol}" >= '${CURRENT_CUTOVER_ISO}' THEN "${m.dateCol}" END) AS curmin, COUNT(CASE WHEN "${m.dateCol}" >= '${CURRENT_CUTOVER_ISO}' THEN 1 END) AS curcount FROM "${m.table}" WHERE "organizationId" = $1`, orgId);
      const hm = rows?.[0]?.histmax ? String(rows[0].histmax).slice(0, 10) : "—";
      const cm = rows?.[0]?.curmin ? String(rows[0].curmin).slice(0, 10) : "—";
      const cc = Number(rows?.[0]?.curcount ?? 0);
      const status = cc > 0 ? "CURRENT_INGESTING" : "⚑ STOPS_BEFORE_CUTOVER";
      console.log(`  ${m.name}: HISTORICAL_MAX_DATE=${hm} · CURRENT_MIN_DATE=${cm} · CURRENT_INGESTION_STATUS=${status} (curRows=${cc})`);
    } catch (e) { console.log(`  ${m.name}: no auditable (${(e as Error).message.slice(0, 60)})`); }
  }
  console.log(`  (receivables/collections: territorio AR-TRUTH de Opus — excluido por regla del sprint)`);

  Object.assign(report, { after, dupHeaders: dupHeaders.length, dupLines: dupLines.length, curWithLines, curNoLines });
  fs.mkdirSync("scripts/out", { recursive: true });
  fs.writeFileSync("scripts/out/current-orders-ingestion.json", JSON.stringify(report, (_k, v) => typeof v === "bigint" ? Number(v) : v, 2));
  console.log(`\nJSON: scripts/out/current-orders-ingestion.json`);
  const ready = !overlap && !gap && dupHeaders.length === 0 && dupLines.length === 0 && (src.orders === 0 || after.headersCur > 0);
  console.log(`\n═══ ${ready ? "A. CURRENT_SAG_ORDER_INGESTION_READY" : "B. CURRENT_SAG_ORDER_INGESTION_BLOCKED — ver pruebas arriba"} ═══\n`);
  process.exit(0);
}

main();
