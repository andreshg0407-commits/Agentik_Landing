/**
 * _data-trust-audit.ts
 *
 * CASTILLITOS-DATA-TRUST-AUDIT-01 — Full data freshness and coverage audit.
 *
 * Queries every data source used by the executive dashboard to determine:
 *   - Last sync date
 *   - Record count
 *   - Date range (oldest / newest)
 *   - Coverage gaps
 *   - Freshness (days since last data)
 *
 * READ-ONLY. No writes. No side effects.
 *
 * Usage: npx dotenv-cli -e .env -- npx tsx scripts/_data-trust-audit.ts
 */

import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";

const ORG = "cmmpwstuf000dp5y58kj1daaj";
const NOW = new Date();

const B = (s: string) => `\x1b[1m${s}\x1b[0m`;
const G = (s: string) => `\x1b[32m${s}\x1b[0m`;
const R = (s: string) => `\x1b[31m${s}\x1b[0m`;
const Y = (s: string) => `\x1b[33m${s}\x1b[0m`;
const D = (s: string) => `\x1b[2m${s}\x1b[0m`;

function daysAgo(date: Date | string | null): number {
  if (!date) return Infinity;
  const d = typeof date === "string" ? new Date(date) : date;
  return Math.floor((NOW.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
}

function freshnessLabel(days: number): string {
  if (days === Infinity) return R("SIN DATOS");
  if (days <= 1) return G("HOY");
  if (days <= 7) return G(`${days}d`);
  if (days <= 30) return Y(`${days}d`);
  if (days <= 90) return R(`${days}d`);
  return R(`${days}d (>90d)`);
}

function trustLevel(days: number): string {
  if (days === Infinity) return "NONE";
  if (days <= 1) return "HIGH";
  if (days <= 7) return "HIGH";
  if (days <= 30) return "MEDIUM";
  if (days <= 90) return "LOW";
  return "STALE";
}

interface AuditResult {
  source: string;
  table: string;
  totalRecords: number;
  oldestDate: string | null;
  newestDate: string | null;
  daysSinceNewest: number;
  freshness: string;
  trust: string;
  details: string[];
  exists: boolean;
}

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter } as any);
  const db = prisma as any;

  console.log("");
  console.log(B("═══════════════════════════════════════════════════════════════════════"));
  console.log(B("  CASTILLITOS-DATA-TRUST-AUDIT-01 — Data Freshness & Coverage Audit"));
  console.log(B(`  Tenant: castillitos (${ORG})`));
  console.log(B(`  Audit date: ${NOW.toISOString()}`));
  console.log(B("═══════════════════════════════════════════════════════════════════════"));
  console.log("");

  const results: AuditResult[] = [];

  // ── 1. ProductEntity (Articles Catalog) ────────────────────────────────────
  try {
    const count = await db.productEntity.count({ where: { organizationId: ORG } });
    const dates: any[] = await db.$queryRawUnsafe(
      `SELECT MIN("createdAt") as oldest, MAX("updatedAt") as newest FROM "ProductEntity" WHERE "organizationId" = $1`,
      ORG,
    );
    const oldest = dates[0]?.oldest;
    const newest = dates[0]?.newest;
    const days = daysAgo(newest);

    // Check product lines distribution
    const lines: any[] = await db.$queryRawUnsafe(
      `SELECT "productLine", COUNT(*)::int as cnt FROM "ProductEntity" WHERE "organizationId" = $1 GROUP BY "productLine" ORDER BY cnt DESC`,
      ORG,
    );

    results.push({
      source: "Catalogo de Articulos",
      table: "ProductEntity",
      totalRecords: count,
      oldestDate: oldest?.toISOString() ?? null,
      newestDate: newest?.toISOString() ?? null,
      daysSinceNewest: days,
      freshness: freshnessLabel(days),
      trust: trustLevel(days),
      details: [
        `Lineas: ${lines.map(l => `${l.productLine ?? "NULL"}(${l.cnt})`).join(", ")}`,
      ],
      exists: true,
    });
  } catch {
    results.push({ source: "Catalogo de Articulos", table: "ProductEntity", totalRecords: 0, oldestDate: null, newestDate: null, daysSinceNewest: Infinity, freshness: freshnessLabel(Infinity), trust: "NONE", details: ["Tabla no existe"], exists: false });
  }

  // ── 2. ProductInventoryLevel (Inventory) ──────────────────────────────────
  try {
    const total: any[] = await db.$queryRawUnsafe(
      `SELECT COUNT(*)::int as cnt, COUNT(DISTINCT "productId")::int as products, COUNT(DISTINCT "externalRef")::int as bodegas FROM "ProductInventoryLevel" WHERE "organizationId" = $1`,
      ORG,
    );
    const dates: any[] = await db.$queryRawUnsafe(
      `SELECT MIN("updatedAt") as oldest, MAX("updatedAt") as newest FROM "ProductInventoryLevel" WHERE "organizationId" = $1`,
      ORG,
    );
    const oldest = dates[0]?.oldest;
    const newest = dates[0]?.newest;
    const days = daysAgo(newest);

    // Bodega breakdown
    const bodegas: any[] = await db.$queryRawUnsafe(
      `SELECT "externalRef", COUNT(DISTINCT "productId")::int as products, SUM("quantity")::float as total_qty FROM "ProductInventoryLevel" WHERE "organizationId" = $1 AND "quantity" > 0 GROUP BY "externalRef" ORDER BY total_qty DESC LIMIT 10`,
      ORG,
    );

    // Check Bodega 01 specifically
    const bod01: any[] = await db.$queryRawUnsafe(
      `SELECT COUNT(DISTINCT "productId")::int as products, SUM("quantity")::float as total_qty, MAX("updatedAt") as newest FROM "ProductInventoryLevel" WHERE "organizationId" = $1 AND "externalRef" = '01'`,
      ORG,
    );
    const bod01Days = daysAgo(bod01[0]?.newest);

    results.push({
      source: "Inventario (todas las bodegas)",
      table: "ProductInventoryLevel",
      totalRecords: total[0]?.cnt ?? 0,
      oldestDate: oldest?.toISOString() ?? null,
      newestDate: newest?.toISOString() ?? null,
      daysSinceNewest: days,
      freshness: freshnessLabel(days),
      trust: trustLevel(days),
      details: [
        `Productos distintos: ${total[0]?.products ?? 0}`,
        `Bodegas: ${total[0]?.bodegas ?? 0}`,
        `Top bodegas: ${bodegas.slice(0, 5).map(b => `${b.externalRef}(${b.products}p/${Math.round(b.total_qty)}u)`).join(", ")}`,
        `Bodega 01: ${bod01[0]?.products ?? 0} productos, ${Math.round(bod01[0]?.total_qty ?? 0)} unidades, ${freshnessLabel(bod01Days)}`,
      ],
      exists: true,
    });
  } catch {
    results.push({ source: "Inventario", table: "ProductInventoryLevel", totalRecords: 0, oldestDate: null, newestDate: null, daysSinceNewest: Infinity, freshness: freshnessLabel(Infinity), trust: "NONE", details: ["Tabla no existe"], exists: false });
  }

  // ── 3. CommercialCoverageSnapshot ──────────────────────────────────────────
  try {
    const count = await db.commercialCoverageSnapshot.count({ where: { organizationId: ORG } });
    const dates: any[] = await db.$queryRawUnsafe(
      `SELECT MIN("snapshotAt") as oldest, MAX("snapshotAt") as newest FROM "CommercialCoverageSnapshot" WHERE "organizationId" = $1`,
      ORG,
    );
    const oldest = dates[0]?.oldest;
    const newest = dates[0]?.newest;
    const days = daysAgo(newest);

    const byLine: any[] = await db.$queryRawUnsafe(
      `SELECT "line", COUNT(*)::int as cnt, SUM("disponible")::float as total_disp FROM "CommercialCoverageSnapshot" WHERE "organizationId" = $1 GROUP BY "line"`,
      ORG,
    );

    results.push({
      source: "Cobertura Comercial (Disponibilidad)",
      table: "CommercialCoverageSnapshot",
      totalRecords: count,
      oldestDate: oldest?.toISOString() ?? null,
      newestDate: newest?.toISOString() ?? null,
      daysSinceNewest: days,
      freshness: freshnessLabel(days),
      trust: trustLevel(days),
      details: [
        `Por linea: ${byLine.map(l => `${l.line}(${l.cnt} refs, ${Math.round(l.total_disp)} disp)`).join(", ")}`,
        days > 1 ? `ALERTA: Snapshot de hace ${days} dias — NO refleja inventario actual` : "Snapshot reciente",
      ],
      exists: true,
    });
  } catch {
    results.push({ source: "Cobertura Comercial", table: "CommercialCoverageSnapshot", totalRecords: 0, oldestDate: null, newestDate: null, daysSinceNewest: Infinity, freshness: freshnessLabel(Infinity), trust: "NONE", details: ["Tabla no existe o vacia"], exists: false });
  }

  // ── 4. CustomerOrderRecord (Pedidos) ───────────────────────────────────────
  try {
    const total: any[] = await db.$queryRawUnsafe(
      `SELECT COUNT(*)::int as cnt FROM "CustomerOrderRecord" WHERE "organizationId" = $1`,
      ORG,
    );
    const dates: any[] = await db.$queryRawUnsafe(
      `SELECT MIN("orderDate") as oldest_order, MAX("orderDate") as newest_order, MIN("createdAt") as oldest_sync, MAX("createdAt") as newest_sync FROM "CustomerOrderRecord" WHERE "organizationId" = $1`,
      ORG,
    );
    const newestOrder = dates[0]?.newest_order;
    const newestSync = dates[0]?.newest_sync;
    const daysOrder = daysAgo(newestOrder);
    const daysSync = daysAgo(newestSync);

    // Status distribution
    const statuses: any[] = await db.$queryRawUnsafe(
      `SELECT "status", COUNT(*)::int as cnt FROM "CustomerOrderRecord" WHERE "organizationId" = $1 GROUP BY "status" ORDER BY cnt DESC`,
      ORG,
    );

    // Check quantity distribution
    const qtyCheck: any[] = await db.$queryRawUnsafe(
      `SELECT COUNT(*)::int as with_qty FROM "CustomerOrderRecord" WHERE "organizationId" = $1 AND "quantity" > 0`,
      ORG,
    );

    results.push({
      source: "Pedidos Pendientes",
      table: "CustomerOrderRecord",
      totalRecords: total[0]?.cnt ?? 0,
      oldestDate: dates[0]?.oldest_order?.toISOString() ?? null,
      newestDate: newestOrder?.toISOString() ?? null,
      daysSinceNewest: daysOrder,
      freshness: freshnessLabel(daysOrder),
      trust: trustLevel(daysOrder),
      details: [
        `Pedido mas reciente: ${newestOrder ? newestOrder.toISOString().split("T")[0] : "N/A"} (hace ${daysOrder} dias)`,
        `Sync mas reciente: ${newestSync ? newestSync.toISOString().split("T")[0] : "N/A"} (hace ${daysSync} dias)`,
        `Estados: ${statuses.map(s => `${s.status ?? "NULL"}(${s.cnt})`).join(", ")}`,
        `Con cantidad > 0: ${qtyCheck[0]?.with_qty ?? 0} de ${total[0]?.cnt ?? 0}`,
        daysOrder > 30 ? `CRITICO: Pedido mas reciente tiene ${daysOrder} dias — datos posiblemente congelados` : "",
      ].filter(Boolean),
      exists: true,
    });
  } catch {
    results.push({ source: "Pedidos", table: "CustomerOrderRecord", totalRecords: 0, oldestDate: null, newestDate: null, daysSinceNewest: Infinity, freshness: freshnessLabel(Infinity), trust: "NONE", details: ["Tabla no existe"], exists: false });
  }

  // ── 5. ProductionOrder ─────────────────────────────────────────────────────
  try {
    const total = await db.productionOrder.count({ where: { organizationId: ORG } });
    const open = await db.productionOrder.count({ where: { organizationId: ORG, isClosed: false } });
    const closed = total - open;

    const dates: any[] = await db.$queryRawUnsafe(
      `SELECT MIN("documentDate") as oldest, MAX("documentDate") as newest, MAX("createdAt") as newest_sync FROM "ProductionOrder" WHERE "organizationId" = $1`,
      ORG,
    );
    const newestDoc = dates[0]?.newest;
    const newestSync = dates[0]?.newest_sync;
    const daysDoc = daysAgo(newestDoc);
    const daysSync = daysAgo(newestSync);

    // Lines count
    const lineCount: any[] = await db.$queryRawUnsafe(
      `SELECT COUNT(*)::int as cnt FROM "ProductionOrderLine" pol JOIN "ProductionOrder" po ON po.id = pol."productionOrderId" WHERE po."organizationId" = $1`,
      ORG,
    );

    // Source code distribution
    const sources: any[] = await db.$queryRawUnsafe(
      `SELECT "sourceCode", COUNT(*)::int as cnt FROM "ProductionOrder" WHERE "organizationId" = $1 GROUP BY "sourceCode" ORDER BY cnt DESC`,
      ORG,
    );

    results.push({
      source: "Produccion (Ordenes)",
      table: "ProductionOrder + ProductionOrderLine",
      totalRecords: total,
      oldestDate: dates[0]?.oldest?.toISOString() ?? null,
      newestDate: newestDoc?.toISOString() ?? null,
      daysSinceNewest: daysDoc,
      freshness: freshnessLabel(daysDoc),
      trust: trustLevel(daysDoc),
      details: [
        `Abiertas: ${open} | Cerradas: ${closed}`,
        `Lineas totales: ${lineCount[0]?.cnt ?? 0}`,
        `Fuentes SAG: ${sources.map(s => `${s.sourceCode}(${s.cnt})`).join(", ")}`,
        `Doc mas reciente: ${newestDoc ? newestDoc.toISOString().split("T")[0] : "N/A"} (hace ${daysDoc} dias)`,
        `Sync mas reciente: ${newestSync ? newestSync.toISOString().split("T")[0] : "N/A"} (hace ${daysSync} dias)`,
        daysSync > 7 ? `ALERTA: Sync de produccion tiene ${daysSync} dias` : "",
      ].filter(Boolean),
      exists: true,
    });
  } catch {
    results.push({ source: "Produccion", table: "ProductionOrder", totalRecords: 0, oldestDate: null, newestDate: null, daysSinceNewest: Infinity, freshness: freshnessLabel(Infinity), trust: "NONE", details: ["Tabla no existe (sin migracion)"], exists: false });
  }

  // ── 6. InventoryTransfer ───────────────────────────────────────────────────
  try {
    const total = await db.inventoryTransfer.count({ where: { organizationId: ORG } });
    const dates: any[] = await db.$queryRawUnsafe(
      `SELECT MIN("documentDate") as oldest, MAX("documentDate") as newest FROM "InventoryTransfer" WHERE "organizationId" = $1`,
      ORG,
    );
    const newest = dates[0]?.newest;
    const days = daysAgo(newest);

    results.push({
      source: "Transferencias (TM/TR)",
      table: "InventoryTransfer + InventoryTransferLine",
      totalRecords: total,
      oldestDate: dates[0]?.oldest?.toISOString() ?? null,
      newestDate: newest?.toISOString() ?? null,
      daysSinceNewest: days,
      freshness: freshnessLabel(days),
      trust: total > 0 ? trustLevel(days) : "NONE",
      details: total > 0 ? [`${total} transferencias`] : ["Sin datos sincronizados"],
      exists: true,
    });
  } catch {
    results.push({ source: "Transferencias (TM/TR)", table: "InventoryTransfer", totalRecords: 0, oldestDate: null, newestDate: null, daysSinceNewest: Infinity, freshness: freshnessLabel(Infinity), trust: "NONE", details: ["Tabla NO existe — migracion pendiente. Sync infra existe en sag-transfer-sync.ts pero no puede escribir."], exists: false });
  }

  // ── 7. Cartera (Receivables) ───────────────────────────────────────────────
  try {
    const total: any[] = await db.$queryRawUnsafe(
      `SELECT COUNT(*)::int as cnt FROM "Receivable" WHERE "organizationId" = $1`,
      ORG,
    );
    const dates: any[] = await db.$queryRawUnsafe(
      `SELECT MIN("dueDate") as oldest, MAX("dueDate") as newest, MAX("updatedAt") as newest_sync FROM "Receivable" WHERE "organizationId" = $1`,
      ORG,
    );
    const newest = dates[0]?.newest;
    const newestSync = dates[0]?.newest_sync;
    const days = daysAgo(newestSync);

    results.push({
      source: "Cartera (Receivables)",
      table: "Receivable",
      totalRecords: total[0]?.cnt ?? 0,
      oldestDate: dates[0]?.oldest?.toISOString() ?? null,
      newestDate: newest?.toISOString() ?? null,
      daysSinceNewest: days,
      freshness: freshnessLabel(days),
      trust: trustLevel(days),
      details: [
        `Ultimo vencimiento: ${newest ? newest.toISOString().split("T")[0] : "N/A"}`,
        `Ultima sync: ${newestSync ? newestSync.toISOString().split("T")[0] : "N/A"} (hace ${days} dias)`,
      ],
      exists: true,
    });
  } catch {
    results.push({ source: "Cartera", table: "Receivable", totalRecords: 0, oldestDate: null, newestDate: null, daysSinceNewest: Infinity, freshness: freshnessLabel(Infinity), trust: "NONE", details: ["Tabla no existe o vacia"], exists: false });
  }

  // ── 8. ConnectorSyncRun (Sync history) ─────────────────────────────────────
  try {
    const runs: any[] = await db.$queryRawUnsafe(
      `SELECT "dataType", "status", COUNT(*)::int as cnt, MAX("startedAt") as last_run, MAX("finishedAt") as last_finish
       FROM "ConnectorSyncRun"
       WHERE "organizationId" = $1
       GROUP BY "dataType", "status"
       ORDER BY last_run DESC`,
      ORG,
    );

    if (runs.length > 0) {
      results.push({
        source: "Historial de Sync (ConnectorSyncRun)",
        table: "ConnectorSyncRun",
        totalRecords: runs.reduce((s, r) => s + r.cnt, 0),
        oldestDate: null,
        newestDate: runs[0]?.last_run?.toISOString() ?? null,
        daysSinceNewest: daysAgo(runs[0]?.last_run),
        freshness: freshnessLabel(daysAgo(runs[0]?.last_run)),
        trust: "INFO",
        details: runs.map(r => `${r.dataType ?? "?"}/${r.status}: ${r.cnt} runs, ultimo: ${r.last_run ? r.last_run.toISOString().split("T")[0] : "N/A"}`),
        exists: true,
      });
    }
  } catch {
    // Not critical
  }

  // ── 9. ProductVariant ──────────────────────────────────────────────────────
  try {
    const total: any[] = await db.$queryRawUnsafe(
      `SELECT COUNT(*)::int as cnt FROM "ProductVariant" WHERE "organizationId" = $1`,
      ORG,
    );
    const dates: any[] = await db.$queryRawUnsafe(
      `SELECT MAX("updatedAt") as newest FROM "ProductVariant" WHERE "organizationId" = $1`,
      ORG,
    );
    const newest = dates[0]?.newest;
    const days = daysAgo(newest);

    results.push({
      source: "Variantes de Producto",
      table: "ProductVariant",
      totalRecords: total[0]?.cnt ?? 0,
      oldestDate: null,
      newestDate: newest?.toISOString() ?? null,
      daysSinceNewest: days,
      freshness: freshnessLabel(days),
      trust: trustLevel(days),
      details: [`${total[0]?.cnt ?? 0} variantes (talla/color)`],
      exists: true,
    });
  } catch {
    results.push({ source: "Variantes", table: "ProductVariant", totalRecords: 0, oldestDate: null, newestDate: null, daysSinceNewest: Infinity, freshness: freshnessLabel(Infinity), trust: "NONE", details: [], exists: false });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PRINT RESULTS
  // ═══════════════════════════════════════════════════════════════════════════

  console.log(B("  RESULTADOS DE AUDITORIA"));
  console.log(B("═══════════════════════════════════════════════════════════════════════"));
  console.log("");

  for (const r of results) {
    const trustColor = r.trust === "HIGH" ? G : r.trust === "MEDIUM" ? Y : R;
    console.log(B(`  ${r.source}`));
    console.log(`  Tabla: ${D(r.table)}`);
    console.log(`  Registros: ${B(String(r.totalRecords))}`);
    if (r.oldestDate) console.log(`  Mas antiguo: ${D(r.oldestDate.split("T")[0])}`);
    if (r.newestDate) console.log(`  Mas reciente: ${B(r.newestDate.split("T")[0])}`);
    console.log(`  Frescura: ${r.freshness}`);
    console.log(`  Confianza: ${trustColor(r.trust)}`);
    for (const d of r.details) {
      if (d.startsWith("CRITICO") || d.startsWith("ALERTA")) {
        console.log(`  ${R(d)}`);
      } else {
        console.log(`  ${D(d)}`);
      }
    }
    console.log("");
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // HEALTH SCORE SUMMARY
  // ═══════════════════════════════════════════════════════════════════════════

  console.log(B("  HEALTH SCORE POR FUENTE"));
  console.log(B("═══════════════════════════════════════════════════════════════════════"));
  console.log("");
  console.log(`  ${"FUENTE".padEnd(40)} ${"REGISTROS".padStart(10)} ${"FRESCURA".padStart(10)} ${"CONFIANZA".padStart(12)}`);
  console.log(`  ${"─".repeat(40)} ${"─".repeat(10)} ${"─".repeat(10)} ${"─".repeat(12)}`);

  for (const r of results) {
    if (r.table === "ConnectorSyncRun") continue; // Skip meta table
    const trustColor = r.trust === "HIGH" ? G : r.trust === "MEDIUM" ? Y : R;
    console.log(`  ${r.source.padEnd(40)} ${String(r.totalRecords).padStart(10)} ${r.freshness.replace(/\x1b\[\d+m/g, "").padStart(10)} ${trustColor(r.trust.padStart(12))}`);
  }

  console.log("");

  // ═══════════════════════════════════════════════════════════════════════════
  // EXECUTIVE CONCLUSION
  // ═══════════════════════════════════════════════════════════════════════════

  const highTrust = results.filter(r => r.trust === "HIGH").length;
  const mediumTrust = results.filter(r => r.trust === "MEDIUM").length;
  const lowTrust = results.filter(r => r.trust === "LOW" || r.trust === "STALE").length;
  const noneTrust = results.filter(r => r.trust === "NONE").length;
  const totalSources = results.filter(r => r.table !== "ConnectorSyncRun").length;

  console.log(B("  CONCLUSION EJECUTIVA"));
  console.log(B("═══════════════════════════════════════════════════════════════════════"));
  console.log(`  Fuentes evaluadas: ${B(String(totalSources))}`);
  console.log(`  ${G(`Alta confianza: ${highTrust}`)}`);
  console.log(`  ${Y(`Media confianza: ${mediumTrust}`)}`);
  console.log(`  ${R(`Baja confianza: ${lowTrust}`)}`);
  console.log(`  ${R(`Sin datos: ${noneTrust}`)}`);
  console.log("");

  const overallTrust = totalSources > 0
    ? Math.round(((highTrust * 100) + (mediumTrust * 60) + (lowTrust * 20)) / totalSources)
    : 0;
  console.log(`  Trust Score Global: ${overallTrust >= 70 ? G(String(overallTrust)) : overallTrust >= 40 ? Y(String(overallTrust)) : R(String(overallTrust))}%`);
  console.log("");

  await prisma.$disconnect();
  pool.end();
}

main().catch(e => {
  console.error(`FATAL: ${(e as Error).message}`);
  process.exit(1);
});
