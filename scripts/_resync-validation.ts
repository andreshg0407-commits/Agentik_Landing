/**
 * _resync-validation.ts
 *
 * CASTILLITOS-SAG-FULL-RESYNC-01 — FASE 8: Post-sync validation.
 *
 * Verifies all data sources meet minimum thresholds for the executive
 * dashboard to display meaningful data.
 *
 * Thresholds:
 *   - CommercialCoverageSnapshot: >= 10 references
 *   - ProductInventoryLevel (Bodega 01): >= 10 products
 *   - ProductionOrder (open): >= 5 orders
 *   - InventoryTransfer: >= 0 (documented if missing)
 *   - CustomerOrderRecord (open): >= 0 (documented if zero)
 *
 * Usage: npx dotenv-cli -e .env -- npx tsx scripts/_resync-validation.ts
 */

import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";

const ORG = "cmmpwstuf000dp5y58kj1daaj";

const B = (s: string) => `\x1b[1m${s}\x1b[0m`;
const G = (s: string) => `\x1b[32m${s}\x1b[0m`;
const R = (s: string) => `\x1b[31m${s}\x1b[0m`;
const Y = (s: string) => `\x1b[33m${s}\x1b[0m`;

interface Check {
  name: string;
  threshold: number;
  actual: number;
  pass: boolean;
  note: string;
}

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter } as any);
  const db = prisma as any;

  console.log("");
  console.log(B("═══════════════════════════════════════════════════════════════"));
  console.log(B("  CASTILLITOS-SAG-FULL-RESYNC-01 — FASE 8: Validation"));
  console.log(B("═══════════════════════════════════════════════════════════════"));
  console.log("");

  const checks: Check[] = [];

  // 1. CommercialCoverageSnapshot
  try {
    const ccsCount = await db.commercialCoverageSnapshot.count({
      where: { organizationId: ORG },
    });
    checks.push({
      name: "CommercialCoverageSnapshot",
      threshold: 10,
      actual: ccsCount,
      pass: ccsCount >= 10,
      note: ccsCount >= 10 ? "Availability data for executive dashboard" : "loadAvailabilityRecords() will return empty",
    });
  } catch {
    checks.push({ name: "CommercialCoverageSnapshot", threshold: 10, actual: 0, pass: false, note: "Table does not exist (no migration)" });
  }

  // 2. ProductInventoryLevel (Bodega 01)
  try {
    const pilCount: any[] = await db.$queryRawUnsafe(
      `SELECT COUNT(DISTINCT "productId")::int as cnt FROM "ProductInventoryLevel" WHERE "organizationId" = $1 AND "externalRef" = '01' AND "quantity" > 0`,
      ORG,
    );
    const count = pilCount[0]?.cnt ?? 0;
    checks.push({
      name: "ProductInventoryLevel (Bodega 01)",
      threshold: 10,
      actual: count,
      pass: count >= 10,
      note: count >= 10 ? "Variant-level inventory present" : "No Bodega 01 inventory",
    });
  } catch {
    checks.push({ name: "ProductInventoryLevel (Bodega 01)", threshold: 10, actual: 0, pass: false, note: "Table does not exist" });
  }

  // 3. ProductInventoryLevel (all bodegas)
  try {
    const totalPil: any[] = await db.$queryRawUnsafe(
      `SELECT COUNT(*)::int as cnt FROM "ProductInventoryLevel" WHERE "organizationId" = $1 AND "quantity" > 0`,
      ORG,
    );
    const count = totalPil[0]?.cnt ?? 0;
    checks.push({
      name: "ProductInventoryLevel (all bodegas)",
      threshold: 100,
      actual: count,
      pass: count >= 100,
      note: `Total variant-level records with qty > 0`,
    });
  } catch {
    checks.push({ name: "ProductInventoryLevel (all)", threshold: 100, actual: 0, pass: false, note: "Table does not exist" });
  }

  // 4. ProductEntity
  try {
    const peCount = await db.productEntity.count({ where: { organizationId: ORG } });
    checks.push({
      name: "ProductEntity (articles catalog)",
      threshold: 10,
      actual: peCount,
      pass: peCount >= 10,
      note: peCount >= 10 ? "Product catalog populated" : "No articles synced",
    });
  } catch {
    checks.push({ name: "ProductEntity", threshold: 10, actual: 0, pass: false, note: "Table does not exist" });
  }

  // 5. ProductionOrder (open)
  try {
    const openOps = await db.productionOrder.count({
      where: { organizationId: ORG, isClosed: false },
    });
    checks.push({
      name: "ProductionOrder (open)",
      threshold: 5,
      actual: openOps,
      pass: openOps >= 5,
      note: openOps >= 5 ? "Production orders available for flow engine" : "No open production orders",
    });
  } catch {
    checks.push({ name: "ProductionOrder (open)", threshold: 5, actual: 0, pass: false, note: "Table does not exist (no migration)" });
  }

  // 6. ProductionOrder (total)
  try {
    const totalOps = await db.productionOrder.count({ where: { organizationId: ORG } });
    checks.push({
      name: "ProductionOrder (total)",
      threshold: 5,
      actual: totalOps,
      pass: totalOps >= 5,
      note: `All OPs including closed`,
    });
  } catch {
    checks.push({ name: "ProductionOrder (total)", threshold: 5, actual: 0, pass: false, note: "Table does not exist" });
  }

  // 7. InventoryTransfer
  try {
    const transfers = await db.inventoryTransfer.count({ where: { organizationId: ORG } });
    checks.push({
      name: "InventoryTransfer",
      threshold: 0,
      actual: transfers,
      pass: true, // Optional — documented if zero
      note: transfers > 0 ? "Transfer history available" : "No migration — table does not exist. Transfer sync pending.",
    });
  } catch {
    checks.push({ name: "InventoryTransfer", threshold: 0, actual: 0, pass: true, note: "No migration — table does not exist. Transfer sync pending migration." });
  }

  // 8. CustomerOrderRecord (PENDIENTE — the actual enum value, not 'open')
  try {
    const pendingOrders: any[] = await db.$queryRawUnsafe(
      `SELECT COUNT(*)::int as cnt FROM "CustomerOrderRecord" WHERE "organizationId" = $1 AND "status" = 'PENDIENTE'`,
      ORG,
    );
    const count = pendingOrders[0]?.cnt ?? 0;
    checks.push({
      name: "CustomerOrderRecord (PENDIENTE)",
      threshold: 0,
      actual: count,
      pass: true,
      note: count > 0 ? "Pending orders affect disponibleReal in availability" : "No pending orders — disponibleReal = existencia.",
    });
  } catch {
    checks.push({ name: "CustomerOrderRecord (PENDIENTE)", threshold: 0, actual: 0, pass: true, note: "Table query failed — may not exist" });
  }

  // 9. CommercialCoverageSnapshot by line
  try {
    const byLine: any[] = await db.$queryRawUnsafe(
      `SELECT "line", COUNT(*)::int as cnt FROM "CommercialCoverageSnapshot" WHERE "organizationId" = $1 GROUP BY "line" ORDER BY cnt DESC`,
      ORG,
    );
    for (const row of byLine) {
      checks.push({
        name: `  CCS line="${row.line}"`,
        threshold: 0,
        actual: row.cnt,
        pass: true,
        note: `References in line ${row.line}`,
      });
    }
  } catch {
    // Already checked above
  }

  // 10. Bodegas with inventory
  try {
    const bodegas: any[] = await db.$queryRawUnsafe(
      `SELECT "externalRef", COUNT(DISTINCT "productId")::int as products FROM "ProductInventoryLevel" WHERE "organizationId" = $1 AND "quantity" > 0 GROUP BY "externalRef" ORDER BY products DESC`,
      ORG,
    );
    const bodegaList = bodegas.map(b => `${b.externalRef}(${b.products})`).join(", ");
    checks.push({
      name: "Bodegas with inventory",
      threshold: 2,
      actual: bodegas.length,
      pass: bodegas.length >= 2,
      note: bodegaList.slice(0, 100),
    });
  } catch {
    checks.push({ name: "Bodegas with inventory", threshold: 2, actual: 0, pass: false, note: "Query failed" });
  }

  // Print results
  console.log(B("  CHECK RESULTS"));
  console.log(B("═══════════════════════════════════════════════════════════════"));
  console.log("");

  let passCount = 0;
  let failCount = 0;

  for (const check of checks) {
    const icon = check.pass ? G("PASS") : R("FAIL");
    const countStr = String(check.actual).padStart(8);
    const threshStr = check.threshold > 0 ? ` (min: ${check.threshold})` : "";
    console.log(`  [${icon}] ${check.name.padEnd(40)} ${countStr}${threshStr}`);
    if (check.note) console.log(`         ${Y(check.note)}`);
    if (check.pass) passCount++;
    else failCount++;
  }

  console.log("");
  console.log(B("═══════════════════════════════════════════════════════════════"));
  console.log(`  ${G(`${passCount} PASS`)}  ${failCount > 0 ? R(`${failCount} FAIL`) : G("0 FAIL")}`);
  console.log("");

  // Dashboard readiness
  const ccsOk = checks.find(c => c.name === "CommercialCoverageSnapshot")?.pass ?? false;
  const prodOk = checks.find(c => c.name === "ProductionOrder (open)")?.pass ?? false;
  const invOk = checks.find(c => c.name === "ProductInventoryLevel (Bodega 01)")?.pass ?? false;

  console.log(B("  DASHBOARD READINESS"));
  console.log(B("═══════════════════════════════════════════════════════════════"));
  console.log(`  Availability section:   ${ccsOk ? G("READY") : R("NOT READY — CommercialCoverageSnapshot empty")}`);
  console.log(`  Production section:     ${prodOk ? G("READY") : Y("DEGRADED — ProductionOrder table missing or empty")}`);
  console.log(`  Inventory section:      ${invOk ? G("READY") : R("NOT READY — No Bodega 01 data")}`);
  console.log(`  Transfer section:       ${Y("PENDING — InventoryTransfer migration not applied")}`);
  console.log("");

  await prisma.$disconnect();
  pool.end();
}

main().catch(e => {
  console.error(`FATAL: ${(e as Error).message}`);
  process.exit(1);
});
