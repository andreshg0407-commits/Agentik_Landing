/**
 * scripts/validate-tiendas-inventory.ts
 *
 * FASE 8 — Validation script for TIENDAS-INVENTORY-01.
 * Verifies the full inventory read flow: BODEGAS cache → PIL discovery →
 * store list → per-store inventory → main warehouse.
 *
 * Read-only. No writes (except the BODEGAS cache which already exists).
 *
 * Usage: npx tsx scripts/validate-tiendas-inventory.ts
 */

import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

let pass = 0;
let fail = 0;
function check(label: string, ok: boolean, detail?: string) {
  if (ok) { pass++; console.log(`  PASS  ${label}${detail ? ` — ${detail}` : ""}`); }
  else    { fail++; console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ""}`); }
}

async function main() {
  const org = await prisma.organization.findFirst({ where: { slug: "castillitos" } });
  if (!org) { console.log("No org"); return; }
  const orgId = org.id;
  console.log(`\n=== TIENDAS-INVENTORY-01 VALIDATION — ${org.slug} ===\n`);

  // ── 1. BODEGAS cache exists ──────────────────────────────────────────────
  console.log("--- 1. BODEGAS Lookup Cache ---");
  const cacheRow = await (prisma as any).agentExecution.findFirst({
    where: { tenantId: orgId, module: "comercial", operation: "SAG_WAREHOUSE_LOOKUP_CACHE" },
    orderBy: { createdAt: "desc" },
  });
  check("BODEGAS cache record exists", !!cacheRow);
  const meta = (cacheRow?.metadataJson ?? {}) as Record<string, unknown>;
  const warehouses = meta.warehouses as Array<{ warehouseId: string; code: string; name: string; active: boolean }> | undefined;
  check("Cache contains warehouses array", Array.isArray(warehouses));
  check("Cache has 49 warehouses", warehouses?.length === 49, `got ${warehouses?.length ?? 0}`);

  // ── 2. PIL data exists ───────────────────────────────────────────────────
  console.log("\n--- 2. ProductInventoryLevel Data ---");
  const pilCount = await (prisma as any).productInventoryLevel.count({
    where: { organizationId: orgId },
  });
  check("PIL records exist", pilCount > 0, `${pilCount.toLocaleString()} records`);

  const pilWarehouses: Array<{ warehouseId: string }> = await (prisma as any).productInventoryLevel.findMany({
    where: { organizationId: orgId },
    select: { warehouseId: true },
    distinct: ["warehouseId"],
  });
  const pilWhIds = pilWarehouses.map(w => w.warehouseId).filter(id => id !== "_default");
  check("PIL has multiple warehouses", pilWhIds.length > 10, `${pilWhIds.length} distinct warehouses`);

  // ── 3. Warehouse ID format matches ───────────────────────────────────────
  console.log("\n--- 3. Warehouse ID Namespace Alignment ---");
  const cacheMap = new Map(
    (warehouses ?? []).map(w => [w.warehouseId, w])
  );
  let matchCount = 0;
  for (const whId of pilWhIds) {
    if (cacheMap.has(whId)) matchCount++;
  }
  check("PIL warehouseIds match BODEGAS cache keys", matchCount > 0, `${matchCount}/${pilWhIds.length} matched`);
  check("Match rate > 90%", matchCount / pilWhIds.length > 0.9, `${((matchCount / pilWhIds.length) * 100).toFixed(0)}%`);

  // ── 4. Retail warehouse identification ───────────────────────────────────
  console.log("\n--- 4. Retail Warehouse Identification ---");
  const retailWarehouses = (warehouses ?? []).filter(w => {
    const n = w.name.toUpperCase().trim();
    return /^F\d+\s*-/.test(n) || n.includes("BODEGA SANDIEGO") || n.includes("BODEGA MAYORCA")
      || n.includes("BODEGA  MAYORCA") || n.includes("GRAN PLAZA") || n.includes("BODEGA CENTRO")
      || n.includes("BODEGA CALDAS") || n.includes("PAGINA WEB") || n.includes("PLAN SEPARE")
      || n.includes("DEXCATO");
  });
  check("Retail warehouses identified", retailWarehouses.length > 5, `${retailWarehouses.length} retail warehouses`);
  console.log("  Retail warehouses:");
  for (const w of retailWarehouses) {
    const hasPilData = pilWhIds.includes(w.warehouseId);
    console.log(`    ${w.warehouseId.padStart(3)} = ${w.name.padEnd(24)} ${hasPilData ? "HAS PIL DATA" : "no PIL data"} ${w.active ? "" : "[INACTIVE]"}`);
  }

  // ── 5. Main warehouse identification ─────────────────────────────────────
  console.log("\n--- 5. Main Warehouse ---");
  const mainWh = (warehouses ?? []).find(w => w.name.toUpperCase().includes("BODEGA PRINCIPAL"));
  check("Main warehouse found in cache", !!mainWh, mainWh ? `${mainWh.warehouseId} = ${mainWh.name}` : "missing");
  if (mainWh) {
    const mainPilCount = await (prisma as any).productInventoryLevel.count({
      where: { organizationId: orgId, warehouseId: mainWh.warehouseId },
    });
    check("Main warehouse has PIL data", mainPilCount > 0, `${mainPilCount.toLocaleString()} records`);
  }

  // ── 6. Per-store inventory query test ────────────────────────────────────
  console.log("\n--- 6. Per-Store Inventory Query Test ---");
  // Pick a franchise store that has PIL data
  const testStores = retailWarehouses
    .filter(w => pilWhIds.includes(w.warehouseId) && w.active)
    .slice(0, 3);

  for (const store of testStores) {
    const levels = await (prisma as any).productInventoryLevel.findMany({
      where: { organizationId: orgId, warehouseId: store.warehouseId },
      select: { quantity: true, productId: true },
      take: 5,
    });
    const hasData = levels.length > 0;
    check(
      `PIL query with warehouseId="${store.warehouseId}" returns data`,
      hasData,
      `${store.name}: ${levels.length} records`,
    );
  }

  // ── 7. End-to-end adapter simulation ─────────────────────────────────────
  console.log("\n--- 7. End-to-End Adapter Flow ---");
  // Simulate what getStoreWarehouses now does:
  // 1. Get PIL warehouse IDs
  // 2. Filter to retail
  // 3. Resolve names from cache
  const discoveredStores: Array<{ id: string; name: string; warehouseId: string; records: number }> = [];
  for (const whId of pilWhIds) {
    const entry = cacheMap.get(whId);
    if (!entry || !entry.active) continue;
    const n = entry.name.toUpperCase().trim();
    // Skip main, non-retail
    if (n.includes("BODEGA PRINCIPAL")) continue;
    if (n.includes("MATERIA PRIMA") || n.includes("PRODUCTO EN PROCESO") || n.includes("TELAS")
      || n.includes("RETAZOS") || n.includes("MUESTRAS") || n.includes("ARREGLOS")
      || n.includes("SEGUNDAS") || n.includes("IMPORTACI") || n.includes("IMPO CONTEN")
      || n.includes("NO USAR") || n.includes("MARCA SAMUEL") || /^VEND\s/.test(n)) continue;

    // Is retail?
    if (/^F\d+\s*-/.test(n) || n.includes("SANDIEGO") || n.includes("MAYORCA")
      || n.includes("GRAN PLAZA") || n.includes("CENTRO") || n.includes("CALDAS")
      || n.includes("PAGINA WEB") || n.includes("PLAN SEPARE") || n.includes("DEXCATO")) {
      const count = await (prisma as any).productInventoryLevel.count({
        where: { organizationId: orgId, warehouseId: whId },
      });
      discoveredStores.push({
        id: entry.name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, ""),
        name: entry.name,
        warehouseId: whId,
        records: count,
      });
    }
  }

  check("Adapter discovers retail stores", discoveredStores.length > 5, `${discoveredStores.length} stores`);
  console.log("  Discovered stores:");
  for (const s of discoveredStores) {
    console.log(`    ${s.warehouseId.padStart(3)} = ${s.name.padEnd(24)} → ${s.records.toLocaleString()} PIL records`);
  }

  // ── 8. Old bug reproduced (verify it WAS broken) ────────────────────────
  console.log("\n--- 8. Old Bug Verification ---");
  // The old adapter used storeSlug as warehouseCode
  const oldBugQuery = await (prisma as any).productInventoryLevel.count({
    where: { organizationId: orgId, warehouseId: "almacen-a" },
  });
  check("Old query warehouseId='almacen-a' returns 0 (was the bug)", oldBugQuery === 0, `got ${oldBugQuery}`);

  const oldBugQuery2 = await (prisma as any).productInventoryLevel.count({
    where: { organizationId: orgId, warehouseId: "tienda-web" },
  });
  check("Old query warehouseId='tienda-web' returns 0 (was the bug)", oldBugQuery2 === 0, `got ${oldBugQuery2}`);

  // New query with correct ID
  const newQuery = await (prisma as any).productInventoryLevel.count({
    where: { organizationId: orgId, warehouseId: "11" },
  });
  check("New query warehouseId='11' returns data (BODEGA SANDIEGO)", newQuery > 0, `got ${newQuery.toLocaleString()}`);

  // ── Summary ──────────────────────────────────────────────────────────────
  console.log(`\n${"=".repeat(60)}`);
  console.log(`RESULT: ${pass} PASS / ${fail} FAIL (total ${pass + fail})`);
  console.log(`${"=".repeat(60)}`);

  await pool.end();
}

main().catch(console.error);
