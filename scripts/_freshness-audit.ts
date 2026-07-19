/**
 * CASTILLITOS-DATA-FRESHNESS-FORENSICS-01
 * READ ONLY — No inserts, no updates, no deletes
 *
 * Comprehensive forensic audit of data freshness, coverage,
 * trazability and trust for all Castillitos data sources.
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

function fmt(d: unknown): string {
  if (!d) return "NULL";
  return new Date(d as string).toISOString();
}

function fmtDate(d: unknown): string {
  if (!d) return "NULL";
  return new Date(d as string).toISOString().slice(0, 10);
}

async function run() {
  const org = await (prisma as any).organization.findFirst({ where: { slug: "castillitos" } });
  if (!org) { console.log("NO ORG"); return; }

  const now = new Date();
  const d7 = new Date(now.getTime() - 7*24*60*60*1000);
  const d30 = new Date(now.getTime() - 30*24*60*60*1000);
  const d90 = new Date(now.getTime() - 90*24*60*60*1000);

  console.log("╔══════════════════════════════════════════════════════════════╗");
  console.log("║   CASTILLITOS DATA FRESHNESS FORENSICS                      ║");
  console.log("║   Sprint: CASTILLITOS-DATA-FRESHNESS-FORENSICS-01           ║");
  console.log("╚══════════════════════════════════════════════════════════════╝");
  console.log(`ORG ID: ${org.id}`);
  console.log(`NOW:    ${now.toISOString()}`);

  // ═══════════════════════════════════════════════════════════
  // PHASE 1+2: SOURCE CATALOG + FRESHNESS AUDIT
  // ═══════════════════════════════════════════════════════════
  console.log("\n\n══════════════════════════════════════════════════");
  console.log("PHASE 1+2: SOURCE CATALOG + FRESHNESS AUDIT");
  console.log("══════════════════════════════════════════════════");

  // --- ProductEntity ---
  try {
    const r = await (prisma as any).$queryRawUnsafe(`
      SELECT COUNT(*)::int as total,
        MIN("createdAt") as first_record, MAX("createdAt") as last_created,
        MAX("updatedAt") as last_updated,
        COUNT(*) FILTER (WHERE "createdAt" >= $1)::int as last_7d,
        COUNT(*) FILTER (WHERE "createdAt" >= $2)::int as last_30d,
        COUNT(*) FILTER (WHERE "createdAt" >= $3)::int as last_90d
      FROM "ProductEntity" WHERE "organizationId" = $4
    `, d7, d30, d90, org.id);
    const x = r[0];
    console.log(`\n--- ProductEntity ---`);
    console.log(`  Total:        ${x.total}`);
    console.log(`  First:        ${fmt(x.first_record)}`);
    console.log(`  Last created: ${fmt(x.last_created)}`);
    console.log(`  Last updated: ${fmt(x.last_updated)}`);
    console.log(`  Last 7d:      ${x.last_7d}  |  30d: ${x.last_30d}  |  90d: ${x.last_90d}`);
  } catch (e: any) { console.log(`\n--- ProductEntity --- ERROR: ${e.message?.substring(0, 150)}`); }

  // --- ProductVariant ---
  try {
    const r = await (prisma as any).$queryRawUnsafe(`
      SELECT COUNT(*)::int as total,
        MIN("createdAt") as first_record, MAX("createdAt") as last_created,
        MAX("updatedAt") as last_updated,
        COUNT(*) FILTER (WHERE "createdAt" >= $1)::int as last_7d,
        COUNT(*) FILTER (WHERE "createdAt" >= $2)::int as last_30d,
        COUNT(*) FILTER (WHERE "createdAt" >= $3)::int as last_90d
      FROM "ProductVariant"
      WHERE "organizationId" = $4
    `, d7, d30, d90, org.id);
    const x = r[0];
    console.log(`\n--- ProductVariant ---`);
    console.log(`  Total:        ${x.total}`);
    console.log(`  First:        ${fmt(x.first_record)}`);
    console.log(`  Last created: ${fmt(x.last_created)}`);
    console.log(`  Last updated: ${fmt(x.last_updated)}`);
    console.log(`  Last 7d:      ${x.last_7d}  |  30d: ${x.last_30d}  |  90d: ${x.last_90d}`);
  } catch (e: any) { console.log(`\n--- ProductVariant --- ERROR: ${e.message?.substring(0, 150)}`); }

  // --- ProductInventoryLevel ---
  try {
    const r = await (prisma as any).$queryRawUnsafe(`
      SELECT COUNT(*)::int as total,
        MIN("createdAt") as first_record, MAX("createdAt") as last_created,
        MAX("updatedAt") as last_updated,
        MAX("syncedAt") as last_synced,
        COUNT(*) FILTER (WHERE "updatedAt" >= $1)::int as updated_7d,
        COUNT(*) FILTER (WHERE "updatedAt" >= $2)::int as updated_30d,
        COUNT(*) FILTER (WHERE "updatedAt" >= $3)::int as updated_90d
      FROM "ProductInventoryLevel"
      WHERE "organizationId" = $4
    `, d7, d30, d90, org.id);
    const x = r[0];
    console.log(`\n--- ProductInventoryLevel ---`);
    console.log(`  Total:        ${x.total}`);
    console.log(`  First:        ${fmt(x.first_record)}`);
    console.log(`  Last created: ${fmt(x.last_created)}`);
    console.log(`  Last updated: ${fmt(x.last_updated)}`);
    console.log(`  Last synced:  ${fmt(x.last_synced)}`);
    console.log(`  Updated 7d:   ${x.updated_7d}  |  30d: ${x.updated_30d}  |  90d: ${x.updated_90d}`);
  } catch (e: any) { console.log(`\n--- ProductInventoryLevel --- ERROR: ${e.message?.substring(0, 150)}`); }

  // --- CommercialCoverageSnapshot (no updatedAt) ---
  try {
    const r = await (prisma as any).$queryRawUnsafe(`
      SELECT COUNT(*)::int as total,
        MIN("createdAt") as first_record, MAX("createdAt") as last_created,
        MAX("snapshotAt") as last_snapshot,
        COUNT(*) FILTER (WHERE "createdAt" >= $1)::int as last_7d,
        COUNT(*) FILTER (WHERE "createdAt" >= $2)::int as last_30d,
        COUNT(*) FILTER (WHERE "createdAt" >= $3)::int as last_90d
      FROM "CommercialCoverageSnapshot"
      WHERE "organizationId" = $4
    `, d7, d30, d90, org.id);
    const x = r[0];
    console.log(`\n--- CommercialCoverageSnapshot ---`);
    console.log(`  Total:         ${x.total}`);
    console.log(`  First:         ${fmt(x.first_record)}`);
    console.log(`  Last created:  ${fmt(x.last_created)}`);
    console.log(`  Last snapshot:  ${fmt(x.last_snapshot)}`);
    console.log(`  Last 7d:       ${x.last_7d}  |  30d: ${x.last_30d}  |  90d: ${x.last_90d}`);
  } catch (e: any) { console.log(`\n--- CommercialCoverageSnapshot --- ERROR: ${e.message?.substring(0, 150)}`); }

  // --- CustomerOrderRecord (no createdAt — use syncedAt) ---
  try {
    const r = await (prisma as any).$queryRawUnsafe(`
      SELECT COUNT(*)::int as total,
        MIN("orderDate") as first_order, MAX("orderDate") as last_order,
        MIN("syncedAt") as first_synced, MAX("syncedAt") as last_synced,
        COUNT(*) FILTER (WHERE "syncedAt" >= $1)::int as synced_7d,
        COUNT(*) FILTER (WHERE "syncedAt" >= $2)::int as synced_30d,
        COUNT(*) FILTER (WHERE "syncedAt" >= $3)::int as synced_90d
      FROM "CustomerOrderRecord"
      WHERE "organizationId" = $4
    `, d7, d30, d90, org.id);
    const x = r[0];
    console.log(`\n--- CustomerOrderRecord ---`);
    console.log(`  Total:        ${x.total}`);
    console.log(`  First order:  ${fmt(x.first_order)}`);
    console.log(`  Last order:   ${fmt(x.last_order)}`);
    console.log(`  First synced: ${fmt(x.first_synced)}`);
    console.log(`  Last synced:  ${fmt(x.last_synced)}`);
    console.log(`  Synced 7d:    ${x.synced_7d}  |  30d: ${x.synced_30d}  |  90d: ${x.synced_90d}`);
  } catch (e: any) { console.log(`\n--- CustomerOrderRecord --- ERROR: ${e.message?.substring(0, 150)}`); }

  // --- CustomerReceivable (balanceDue, syncedAt) ---
  try {
    const r = await (prisma as any).$queryRawUnsafe(`
      SELECT COUNT(*)::int as total,
        MIN("invoiceDate") as first_invoice, MAX("invoiceDate") as last_invoice,
        MIN("syncedAt") as first_synced, MAX("syncedAt") as last_synced,
        COUNT(*) FILTER (WHERE "syncedAt" >= $1)::int as synced_7d,
        COUNT(*) FILTER (WHERE "syncedAt" >= $2)::int as synced_30d,
        COUNT(*) FILTER (WHERE "syncedAt" >= $3)::int as synced_90d,
        SUM("balanceDue")::float as total_balance,
        COUNT(*) FILTER (WHERE "balanceDue" > 0)::int as with_balance
      FROM "CustomerReceivable"
      WHERE "organizationId" = $4
    `, d7, d30, d90, org.id);
    const x = r[0];
    console.log(`\n--- CustomerReceivable ---`);
    console.log(`  Total:         ${x.total}`);
    console.log(`  First invoice: ${fmt(x.first_invoice)}`);
    console.log(`  Last invoice:  ${fmt(x.last_invoice)}`);
    console.log(`  First synced:  ${fmt(x.first_synced)}`);
    console.log(`  Last synced:   ${fmt(x.last_synced)}`);
    console.log(`  Synced 7d:     ${x.synced_7d}  |  30d: ${x.synced_30d}  |  90d: ${x.synced_90d}`);
    console.log(`  Total balance: $${x.total_balance?.toLocaleString() ?? "0"}`);
    console.log(`  With balance:  ${x.with_balance}`);
  } catch (e: any) { console.log(`\n--- CustomerReceivable --- ERROR: ${e.message?.substring(0, 150)}`); }

  // --- IntegrationConnection ---
  try {
    const r = await (prisma as any).$queryRawUnsafe(`
      SELECT "provider", "status", "health",
        "connectedAt", "lastHealthCheckAt",
        "createdAt", "updatedAt"
      FROM "IntegrationConnection"
      WHERE "organizationId" = $1
      ORDER BY "provider"
    `, org.id);
    console.log(`\n--- IntegrationConnection ---`);
    console.log(`  Total: ${r.length}`);
    for (const c of r) {
      console.log(`  ${(c.provider ?? "?").padEnd(20)} status=${(c.status ?? "?").padEnd(12)} health=${(c.health ?? "?").padEnd(10)} connected=${fmtDate(c.connectedAt)} lastCheck=${fmt(c.lastHealthCheckAt)}`);
    }
  } catch (e: any) { console.log(`\n--- IntegrationConnection --- ERROR: ${e.message?.substring(0, 150)}`); }

  // --- Extra tables existence ---
  const extraTables = ["ProductionOrder", "ProductionOrderLine", "InventoryTransfer", "ConnectorSyncLog", "PaymentRecord"];
  console.log(`\n--- Extra tables existence check ---`);
  for (const t of extraTables) {
    try {
      const cols = await (prisma as any).$queryRawUnsafe(`
        SELECT COUNT(*)::int as col_count FROM information_schema.columns WHERE table_name = $1
      `, t);
      const colCount = cols[0]?.col_count ?? 0;
      if (colCount > 0) {
        const cnt = await (prisma as any).$queryRawUnsafe(`SELECT COUNT(*)::int as total FROM "${t}"`);
        console.log(`  ${t.padEnd(25)} EXISTS (${colCount} cols, ${cnt[0].total} rows)`);
      } else {
        console.log(`  ${t.padEnd(25)} DOES NOT EXIST`);
      }
    } catch (e: any) {
      console.log(`  ${t.padEnd(25)} ERROR: ${e.message?.substring(0, 80)}`);
    }
  }

  // ═══════════════════════════════════════════════════════════
  // PHASE 3: ACTIVITY CURVES
  // ═══════════════════════════════════════════════════════════
  console.log("\n\n══════════════════════════════════════════════════");
  console.log("PHASE 3: ACTIVITY CURVES (monthly)");
  console.log("══════════════════════════════════════════════════");

  const curveQueries = [
    { name: "PIL (createdAt)", sql: `SELECT to_char("createdAt", 'YYYY-MM') as month, COUNT(*)::int as n FROM "ProductInventoryLevel" WHERE "organizationId" = $1 GROUP BY month ORDER BY month` },
    { name: "PIL (updatedAt)", sql: `SELECT to_char("updatedAt", 'YYYY-MM') as month, COUNT(*)::int as n FROM "ProductInventoryLevel" WHERE "organizationId" = $1 GROUP BY month ORDER BY month` },
    { name: "PIL (syncedAt)",  sql: `SELECT to_char("syncedAt", 'YYYY-MM') as month, COUNT(*)::int as n FROM "ProductInventoryLevel" WHERE "organizationId" = $1 GROUP BY month ORDER BY month` },
    { name: "CCS (createdAt)", sql: `SELECT to_char("createdAt", 'YYYY-MM') as month, COUNT(*)::int as n FROM "CommercialCoverageSnapshot" WHERE "organizationId" = $1 GROUP BY month ORDER BY month` },
    { name: "Orders (orderDate)", sql: `SELECT to_char("orderDate", 'YYYY-MM') as month, COUNT(*)::int as n FROM "CustomerOrderRecord" WHERE "organizationId" = $1 GROUP BY month ORDER BY month` },
    { name: "Orders (syncedAt)",  sql: `SELECT to_char("syncedAt", 'YYYY-MM') as month, COUNT(*)::int as n FROM "CustomerOrderRecord" WHERE "organizationId" = $1 GROUP BY month ORDER BY month` },
    { name: "Receivables (invoiceDate)", sql: `SELECT to_char("invoiceDate", 'YYYY-MM') as month, COUNT(*)::int as n FROM "CustomerReceivable" WHERE "organizationId" = $1 GROUP BY month ORDER BY month` },
    { name: "Receivables (syncedAt)",    sql: `SELECT to_char("syncedAt", 'YYYY-MM') as month, COUNT(*)::int as n FROM "CustomerReceivable" WHERE "organizationId" = $1 GROUP BY month ORDER BY month` },
  ];

  for (const cq of curveQueries) {
    try {
      const r = await (prisma as any).$queryRawUnsafe(cq.sql, org.id);
      console.log(`\n--- ${cq.name} ---`);
      if (r.length === 0) { console.log("  NO DATA"); continue; }
      for (const row of r) {
        const bar = "#".repeat(Math.min(50, Math.ceil(row.n / 50)));
        console.log(`  ${row.month}: ${String(row.n).padStart(6)} ${bar}`);
      }
    } catch (e: any) { console.log(`\n--- ${cq.name} --- ERROR: ${e.message?.substring(0, 120)}`); }
  }

  // ═══════════════════════════════════════════════════════════
  // PHASE 5: INVENTORY AUDIT
  // ═══════════════════════════════════════════════════════════
  console.log("\n\n══════════════════════════════════════════════════");
  console.log("PHASE 5: INVENTORY AUDIT");
  console.log("══════════════════════════════════════════════════");

  try {
    const r = await (prisma as any).$queryRawUnsafe(`
      SELECT "warehouseId",
        COUNT(*)::int as levels,
        COUNT(*) FILTER (WHERE quantity > 0)::int as positive,
        COUNT(*) FILTER (WHERE quantity = 0)::int as zero,
        COUNT(*) FILTER (WHERE quantity < 0)::int as negative,
        SUM(quantity)::int as total_qty,
        MAX("updatedAt") as last_update,
        MIN("createdAt") as first_created,
        MAX("syncedAt") as last_synced
      FROM "ProductInventoryLevel" WHERE "organizationId" = $1
      GROUP BY "warehouseId" ORDER BY "warehouseId"
    `, org.id);
    console.log("By warehouse:");
    for (const x of r) {
      console.log(`  Warehouse ${(x.warehouseId ?? "NULL").padEnd(8)} | ${x.levels} levels | +${x.positive} / 0:${x.zero} / -${x.negative} | sum=${x.total_qty}`);
      console.log(`    first=${fmtDate(x.first_created)} | lastUpdate=${fmt(x.last_update)} | lastSync=${fmt(x.last_synced)}`);
    }
  } catch (e: any) { console.log(`Inventory audit error: ${e.message?.substring(0, 150)}`); }

  // CCS stock distribution
  try {
    const r = await (prisma as any).$queryRawUnsafe(`
      SELECT COUNT(*)::int as total,
        COUNT(*) FILTER (WHERE disponible > 0)::int as with_stock,
        COUNT(*) FILTER (WHERE disponible = 0)::int as zero_stock,
        AVG("coverageDays")::float as avg_coverage,
        MAX("snapshotAt") as last_snapshot,
        MIN("createdAt") as first_created
      FROM "CommercialCoverageSnapshot" WHERE "organizationId" = $1
    `, org.id);
    const x = r[0];
    console.log("\nCCS distribution:");
    console.log(`  Total:         ${x.total}`);
    console.log(`  With stock:    ${x.with_stock} (${x.total > 0 ? ((x.with_stock/x.total)*100).toFixed(1) : 0}%)`);
    console.log(`  Zero stock:    ${x.zero_stock} (${x.total > 0 ? ((x.zero_stock/x.total)*100).toFixed(1) : 0}%)`);
    console.log(`  Avg coverage:  ${x.avg_coverage?.toFixed(1)} days`);
    console.log(`  Last snapshot: ${fmt(x.last_snapshot)}`);
  } catch (e: any) { console.log(`CCS distribution error: ${e.message?.substring(0, 150)}`); }

  // ═══════════════════════════════════════════════════════════
  // PHASE 6: ORDERS AUDIT
  // ═══════════════════════════════════════════════════════════
  console.log("\n\n══════════════════════════════════════════════════");
  console.log("PHASE 6: ORDERS AUDIT");
  console.log("══════════════════════════════════════════════════");

  try {
    const r = await (prisma as any).$queryRawUnsafe(`
      SELECT "status"::text as status,
        COUNT(*)::int as count,
        MIN("orderDate") as oldest, MAX("orderDate") as newest,
        MIN("syncedAt") as first_synced, MAX("syncedAt") as last_synced,
        AVG(EXTRACT(EPOCH FROM (NOW() - "orderDate")) / 86400)::int as avg_age_days
      FROM "CustomerOrderRecord" WHERE "organizationId" = $1
      GROUP BY "status" ORDER BY count DESC
    `, org.id);
    console.log("By status:");
    for (const x of r) {
      console.log(`  ${(x.status ?? "NULL").padEnd(15)} n=${String(x.count).padStart(5)} | oldest=${fmtDate(x.oldest)} | newest=${fmtDate(x.newest)} | avg_age=${x.avg_age_days}d | last_synced=${fmtDate(x.last_synced)}`);
    }
  } catch (e: any) { console.log(`Orders status error: ${e.message?.substring(0, 150)}`); }

  try {
    const r = await (prisma as any).$queryRawUnsafe(`
      SELECT DISTINCT "status"::text as status FROM "CustomerOrderRecord" WHERE "organizationId" = $1
    `, org.id);
    console.log("\nDistinct statuses in DB:", r.map((x: any) => `"${x.status}"`).join(", "));
  } catch (e: any) {}

  // ═══════════════════════════════════════════════════════════
  // PHASE 8: CARTERA AUDIT
  // ═══════════════════════════════════════════════════════════
  console.log("\n\n══════════════════════════════════════════════════");
  console.log("PHASE 8: CARTERA AUDIT");
  console.log("══════════════════════════════════════════════════");

  try {
    const r = await (prisma as any).$queryRawUnsafe(`
      SELECT COUNT(*)::int as total,
        COUNT(*) FILTER (WHERE "balanceDue" > 0)::int as with_balance,
        COUNT(*) FILTER (WHERE "balanceDue" = 0)::int as zero_balance,
        SUM("balanceDue")::float as total_balance,
        SUM("originalAmount")::float as total_original,
        SUM("paidAmount")::float as total_paid,
        MIN("invoiceDate") as oldest_invoice, MAX("invoiceDate") as newest_invoice,
        MIN("dueDate") as oldest_due, MAX("dueDate") as newest_due,
        MIN("syncedAt") as first_synced, MAX("syncedAt") as last_synced,
        AVG("daysOverdue")::int as avg_overdue
      FROM "CustomerReceivable" WHERE "organizationId" = $1
    `, org.id);
    const x = r[0];
    console.log(`  Total records:     ${x.total}`);
    console.log(`  With balance:      ${x.with_balance}`);
    console.log(`  Zero balance:      ${x.zero_balance}`);
    console.log(`  Total balance:     $${x.total_balance?.toLocaleString()}`);
    console.log(`  Total original:    $${x.total_original?.toLocaleString()}`);
    console.log(`  Total paid:        $${x.total_paid?.toLocaleString()}`);
    console.log(`  Oldest invoice:    ${fmtDate(x.oldest_invoice)}`);
    console.log(`  Newest invoice:    ${fmtDate(x.newest_invoice)}`);
    console.log(`  Oldest due:        ${fmtDate(x.oldest_due)}`);
    console.log(`  Newest due:        ${fmtDate(x.newest_due)}`);
    console.log(`  First synced:      ${fmt(x.first_synced)}`);
    console.log(`  Last synced:       ${fmt(x.last_synced)}`);
    console.log(`  Avg overdue:       ${x.avg_overdue} days`);
  } catch (e: any) { console.log(`Cartera audit error: ${e.message?.substring(0, 150)}`); }

  try {
    const r = await (prisma as any).$queryRawUnsafe(`
      SELECT "agingBucket",
        COUNT(*)::int as count, SUM("balanceDue")::float as balance
      FROM "CustomerReceivable"
      WHERE "organizationId" = $1 AND "balanceDue" > 0
      GROUP BY "agingBucket" ORDER BY balance DESC
    `, org.id);
    console.log("\nAging buckets (balance > 0):");
    for (const x of r) {
      console.log(`  ${(x.agingBucket ?? "NULL").padEnd(15)} n=${String(x.count).padStart(4)} | $${x.balance?.toLocaleString()}`);
    }
  } catch (e: any) { console.log(`Aging error: ${e.message?.substring(0, 100)}`); }

  // ═══════════════════════════════════════════════════════════
  // PHASE 7+9: PRODUCTION + TRANSFERS
  // ═══════════════════════════════════════════════════════════
  console.log("\n\n══════════════════════════════════════════════════");
  console.log("PHASE 7+9: PRODUCTION + TRANSFERS AUDIT");
  console.log("══════════════════════════════════════════════════");

  for (const t of ["ProductionOrder", "ProductionOrderLine", "InventoryTransfer"]) {
    try {
      const cols = await (prisma as any).$queryRawUnsafe(
        `SELECT column_name FROM information_schema.columns WHERE table_name = $1 ORDER BY ordinal_position`, t
      );
      if (cols.length > 0) {
        console.log(`\n${t}:`);
        console.log(`  Columns: ${cols.map((c: any) => c.column_name).join(", ")}`);
        const cnt = await (prisma as any).$queryRawUnsafe(`SELECT COUNT(*)::int as total FROM "${t}"`);
        console.log(`  Total rows: ${cnt[0].total}`);
      } else {
        console.log(`\n${t}: DOES NOT EXIST`);
      }
    } catch (e: any) { console.log(`\n${t} error: ${e.message?.substring(0, 120)}`); }
  }

  // ═══════════════════════════════════════════════════════════
  // DAILY ACTIVITY — last 60 days
  // ═══════════════════════════════════════════════════════════
  console.log("\n\n══════════════════════════════════════════════════");
  console.log("DAILY ACTIVITY — last 60 days");
  console.log("══════════════════════════════════════════════════");

  const d60 = new Date(now.getTime() - 60*24*60*60*1000);
  const dailyQueries = [
    { name: "PIL updates", sql: `SELECT to_char("updatedAt", 'YYYY-MM-DD') as day, COUNT(*)::int as n FROM "ProductInventoryLevel" WHERE "organizationId" = $1 AND "updatedAt" >= $2 GROUP BY day ORDER BY day` },
    { name: "CCS creates", sql: `SELECT to_char("createdAt", 'YYYY-MM-DD') as day, COUNT(*)::int as n FROM "CommercialCoverageSnapshot" WHERE "organizationId" = $1 AND "createdAt" >= $2 GROUP BY day ORDER BY day` },
    { name: "Receivable syncs", sql: `SELECT to_char("syncedAt", 'YYYY-MM-DD') as day, COUNT(*)::int as n FROM "CustomerReceivable" WHERE "organizationId" = $1 AND "syncedAt" >= $2 GROUP BY day ORDER BY day` },
    { name: "Order syncs", sql: `SELECT to_char("syncedAt", 'YYYY-MM-DD') as day, COUNT(*)::int as n FROM "CustomerOrderRecord" WHERE "organizationId" = $1 AND "syncedAt" >= $2 GROUP BY day ORDER BY day` },
  ];

  for (const dq of dailyQueries) {
    try {
      const r = await (prisma as any).$queryRawUnsafe(dq.sql, org.id, d60);
      console.log(`\n--- ${dq.name} ---`);
      if (r.length === 0) { console.log("  NO ACTIVITY IN LAST 60 DAYS"); continue; }
      for (const row of r) {
        const bar = "#".repeat(Math.min(50, Math.ceil(row.n / 50)));
        console.log(`  ${row.day}: ${String(row.n).padStart(6)} ${bar}`);
      }
    } catch (e: any) { console.log(`\n--- ${dq.name} --- ERROR: ${e.message?.substring(0, 120)}`); }
  }

  // ═══════════════════════════════════════════════════════════
  // COMPLETE TABLE CENSUS
  // ═══════════════════════════════════════════════════════════
  console.log("\n\n══════════════════════════════════════════════════");
  console.log("COMPLETE TABLE CENSUS");
  console.log("══════════════════════════════════════════════════");
  try {
    const r = await (prisma as any).$queryRawUnsafe(`
      SELECT t.table_name,
        (SELECT COUNT(*)::int FROM information_schema.columns c WHERE c.table_name = t.table_name) as col_count
      FROM information_schema.tables t
      WHERE t.table_schema = 'public' AND t.table_type = 'BASE TABLE'
      ORDER BY t.table_name
    `);
    for (const x of r) {
      try {
        const cnt = await (prisma as any).$queryRawUnsafe(`SELECT COUNT(*)::int as n FROM "${x.table_name}"`);
        console.log(`  ${x.table_name.padEnd(45)} ${String(cnt[0].n).padStart(8)} rows  (${x.col_count} cols)`);
      } catch {
        console.log(`  ${x.table_name.padEnd(45)} ERROR`);
      }
    }
  } catch (e: any) { console.log(`Census error: ${e.message?.substring(0, 150)}`); }

  console.log("\n\nAUDIT COMPLETE");
  await prisma.$disconnect();
  await pool.end();
}

run().catch(e => { console.error(e); process.exit(1); });
