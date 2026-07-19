/**
 * scripts/_audit-stock-data.ts
 *
 * COMMERCIAL-STOCK-DATA-AUDIT-01 — read-only audit of inventory data quality.
 * NO modifications. ONLY reads.
 *
 * Run: npx tsx scripts/_audit-stock-data.ts
 */

import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  // ── Resolve Castillitos org ──
  const org = await prisma.organization.findFirst({
    where: { slug: "castillitos" },
    select: { id: true, slug: true, name: true },
  });
  if (!org) { console.log("Castillitos org not found"); return; }
  const orgId = org.id;
  console.log(`\nOrg: ${org.name} (${org.slug}) — ID: ${orgId}\n`);

  // ══════════════════════════════════════════════════════════════════════════
  // FASE 1 — INVENTARIO GLOBAL
  // ══════════════════════════════════════════════════════════════════════════

  console.log("═══ FASE 1 — INVENTARIO GLOBAL ═══\n");

  const totalProducts = await (prisma as any).productEntity.count({
    where: { organizationId: orgId },
  });

  // All products with their variants and inventory
  const allProducts = await (prisma as any).productEntity.findMany({
    where: { organizationId: orgId },
    select: {
      id: true,
      name: true,
      sku: true,
      category: true,
      productLine: true,
      description: true,
      price: true,
      status: true,
      commercialStatus: true,
      externalSource: true,
      externalId: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  // Get ALL variants for this org
  const allVariants = await (prisma as any).productVariant.findMany({
    where: { organizationId: orgId },
    select: {
      id: true,
      productId: true,
      status: true,
      attributes: true,
      externalSource: true,
      externalId: true,
    },
  });

  // Get ALL inventory levels for this org
  const allLevels = await (prisma as any).productInventoryLevel.findMany({
    where: { organizationId: orgId },
    select: {
      id: true,
      productId: true,
      variantId: true,
      warehouseId: true,
      quantity: true,
      reservedQty: true,
      source: true,
      externalRef: true,
      syncedAt: true,
    },
  });

  // Group variants by productId
  const variantsByProduct = new Map<string, any[]>();
  for (const v of allVariants) {
    const arr = variantsByProduct.get(v.productId) ?? [];
    arr.push(v);
    variantsByProduct.set(v.productId, arr);
  }

  // Group levels by variantId
  const levelsByVariant = new Map<string, any[]>();
  const levelsByProduct = new Map<string, any[]>();
  for (const l of allLevels) {
    if (l.variantId) {
      const arr = levelsByVariant.get(l.variantId) ?? [];
      arr.push(l);
      levelsByVariant.set(l.variantId, arr);
    }
    const arr2 = levelsByProduct.get(l.productId) ?? [];
    arr2.push(l);
    levelsByProduct.set(l.productId, arr2);
  }

  // Compute per-product metrics
  interface ProductAudit {
    id: string;
    sku: string;
    name: string;
    line: string;
    category: string;
    description: string;
    price: number | null;
    status: string;
    commercialStatus: string;
    source: string;
    externalId: string;
    createdAt: string;
    updatedAt: string;
    variantCount: number;
    activeVariantCount: number;
    levelsCount: number;
    totalQty: number;
    totalReserved: number;
    availableQty: number | null; // null = no inventory data
    latestSync: string | null;
    hasInventoryData: boolean;
  }

  const audits: ProductAudit[] = [];

  for (const p of allProducts) {
    const variants = variantsByProduct.get(p.id) ?? [];
    const activeVariants = variants.filter((v: any) => v.status === "active");
    const pLevels = levelsByProduct.get(p.id) ?? [];

    // Also check variant-level inventory
    let totalQty = 0;
    let totalReserved = 0;
    let latestSync: string | null = null;
    let hasInventoryData = false;

    for (const v of variants) {
      const vLevels = levelsByVariant.get(v.id) ?? [];
      for (const l of vLevels) {
        hasInventoryData = true;
        totalQty += l.quantity ?? 0;
        totalReserved += l.reservedQty ?? 0;
        if (l.syncedAt && (!latestSync || String(l.syncedAt) > latestSync)) {
          latestSync = String(l.syncedAt);
        }
      }
    }

    // Also check product-level inventory (variantId = null)
    for (const l of pLevels) {
      if (!l.variantId) {
        hasInventoryData = true;
        totalQty += l.quantity ?? 0;
        totalReserved += l.reservedQty ?? 0;
        if (l.syncedAt && (!latestSync || String(l.syncedAt) > latestSync)) {
          latestSync = String(l.syncedAt);
        }
      }
    }

    const available = hasInventoryData ? Math.max(0, totalQty - totalReserved) : null;

    audits.push({
      id: p.id,
      sku: p.sku ?? "",
      name: p.name ?? "",
      line: p.productLine ?? "",
      category: p.category ?? "",
      description: p.description ?? "",
      price: p.price,
      status: p.status,
      commercialStatus: p.commercialStatus ?? "",
      source: p.externalSource ?? "",
      externalId: p.externalId ?? "",
      createdAt: String(p.createdAt),
      updatedAt: String(p.updatedAt),
      variantCount: variants.length,
      activeVariantCount: activeVariants.length,
      levelsCount: pLevels.length + [...variants].reduce((s: number, v: any) => s + (levelsByVariant.get(v.id)?.length ?? 0), 0),
      totalQty,
      totalReserved,
      availableQty: available,
      latestSync,
      hasInventoryData,
    });
  }

  // ── Metrics ──
  const withStockPositive = audits.filter(a => a.availableQty !== null && a.availableQty > 0);
  const withStockZero = audits.filter(a => a.availableQty !== null && a.availableQty === 0);
  const withStockNull = audits.filter(a => a.availableQty === null);
  const noVariants = audits.filter(a => a.variantCount === 0);
  const singleVariant = audits.filter(a => a.variantCount === 1);
  const multiVariant = audits.filter(a => a.variantCount > 1);

  console.log(`Total referencias comerciales:          ${totalProducts}`);
  console.log(`Referencias con stock > 0:              ${withStockPositive.length}`);
  console.log(`Referencias con stock = 0:              ${withStockZero.length}`);
  console.log(`Referencias con stock null (sin datos): ${withStockNull.length}`);
  console.log(`Referencias sin variantes:              ${noVariants.length}`);
  console.log(`Referencias con 1 sola variante:        ${singleVariant.length}`);
  console.log(`Referencias con > 1 variante:           ${multiVariant.length}`);
  console.log(`\nTotal variantes (org):                  ${allVariants.length}`);
  console.log(`Total registros inventario (org):        ${allLevels.length}`);

  // ══════════════════════════════════════════════════════════════════════════
  // FASE 2 — TOP REFERENCIAS PROBLEMÁTICAS
  // ══════════════════════════════════════════════════════════════════════════

  console.log("\n═══ FASE 2 — TOP REFERENCIAS PROBLEMÁTICAS (stock null) ═══\n");

  const problematic = withStockNull
    .sort((a, b) => a.sku.localeCompare(b.sku));

  console.log(`Total referencias problemáticas: ${problematic.length}\n`);

  // Show first 120
  const showCount = Math.min(120, problematic.length);
  console.log(
    "REF".padEnd(20) +
    "NOMBRE".padEnd(45) +
    "LINEA".padEnd(20) +
    "CATEGORIA".padEnd(20) +
    "PRECIO".padEnd(12) +
    "VARS".padEnd(6) +
    "ORIGEN".padEnd(10) +
    "ULTIMA SYNC".padEnd(25) +
    "STATUS"
  );
  console.log("-".repeat(160));

  for (let i = 0; i < showCount; i++) {
    const a = problematic[i];
    console.log(
      a.sku.padEnd(20) +
      (a.name || "—").substring(0, 43).padEnd(45) +
      (a.line || "—").substring(0, 18).padEnd(20) +
      (a.category || "—").substring(0, 18).padEnd(20) +
      (a.price != null ? `$${Math.round(a.price).toLocaleString()}` : "—").padEnd(12) +
      String(a.variantCount).padEnd(6) +
      (a.source || "—").padEnd(10) +
      (a.latestSync ? a.latestSync.substring(0, 22) : "NUNCA").padEnd(25) +
      a.status
    );
  }

  if (problematic.length > showCount) {
    console.log(`... y ${problematic.length - showCount} más`);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // FASE 3 — ANÁLISIS DE PATRONES
  // ══════════════════════════════════════════════════════════════════════════

  console.log("\n═══ FASE 3 — ANÁLISIS DE PATRONES ═══\n");

  // Group by line
  const byLine = new Map<string, ProductAudit[]>();
  for (const a of problematic) {
    const key = a.line || "(sin linea)";
    const arr = byLine.get(key) ?? [];
    arr.push(a);
    byLine.set(key, arr);
  }

  console.log("─── Por línea ───");
  for (const [line, items] of [...byLine.entries()].sort((a, b) => b[1].length - a[1].length)) {
    console.log(`  ${line.padEnd(30)} ${items.length} refs`);
  }

  // Group by category
  const byCat = new Map<string, ProductAudit[]>();
  for (const a of problematic) {
    const key = a.category || "(sin categoria)";
    const arr = byCat.get(key) ?? [];
    arr.push(a);
    byCat.set(key, arr);
  }

  console.log("\n─── Por categoría ───");
  for (const [cat, items] of [...byCat.entries()].sort((a, b) => b[1].length - a[1].length)) {
    console.log(`  ${cat.padEnd(30)} ${items.length} refs`);
  }

  // Group by variant count
  const byVarCount = new Map<number, number>();
  for (const a of problematic) {
    byVarCount.set(a.variantCount, (byVarCount.get(a.variantCount) ?? 0) + 1);
  }

  console.log("\n─── Por cantidad de variantes ───");
  for (const [count, n] of [...byVarCount.entries()].sort((a, b) => a[0] - b[0])) {
    console.log(`  ${count} variantes: ${n} refs`);
  }

  // Group by source
  const bySource = new Map<string, number>();
  for (const a of problematic) {
    const key = a.source || "(sin origen)";
    bySource.set(key, (bySource.get(key) ?? 0) + 1);
  }

  console.log("\n─── Por origen ───");
  for (const [src, n] of [...bySource.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${src.padEnd(20)} ${n} refs`);
  }

  // Group by status
  const byStatus = new Map<string, number>();
  for (const a of problematic) {
    byStatus.set(a.status, (byStatus.get(a.status) ?? 0) + 1);
  }

  console.log("\n─── Por status ───");
  for (const [st, n] of [...byStatus.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${st.padEnd(20)} ${n} refs`);
  }

  // Group by commercialStatus
  const byComm = new Map<string, number>();
  for (const a of problematic) {
    byComm.set(a.commercialStatus || "(vacío)", (byComm.get(a.commercialStatus || "(vacío)") ?? 0) + 1);
  }

  console.log("\n─── Por commercialStatus ───");
  for (const [st, n] of [...byComm.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${st.padEnd(20)} ${n} refs`);
  }

  // Age analysis
  const now = Date.now();
  const problematicAges = problematic.map(a => ({
    sku: a.sku,
    createdDaysAgo: Math.round((now - new Date(a.createdAt).getTime()) / 86400000),
    updatedDaysAgo: Math.round((now - new Date(a.updatedAt).getTime()) / 86400000),
  }));

  const oldestCreated = problematicAges.reduce((max, a) => a.createdDaysAgo > max.createdDaysAgo ? a : max, problematicAges[0]);
  const newestCreated = problematicAges.reduce((min, a) => a.createdDaysAgo < min.createdDaysAgo ? a : min, problematicAges[0]);
  const avgCreated = Math.round(problematicAges.reduce((s, a) => s + a.createdDaysAgo, 0) / problematicAges.length);

  console.log("\n─── Edad de las referencias problemáticas ───");
  if (oldestCreated) console.log(`  Más antigua: ${oldestCreated.sku} (${oldestCreated.createdDaysAgo} días)`);
  if (newestCreated) console.log(`  Más reciente: ${newestCreated.sku} (${newestCreated.createdDaysAgo} días)`);
  console.log(`  Promedio:     ${avgCreated} días`);

  // ══════════════════════════════════════════════════════════════════════════
  // FASE 4 — TRAZABILIDAD SAG (20 problemáticas)
  // ══════════════════════════════════════════════════════════════════════════

  console.log("\n═══ FASE 4 — TRAZABILIDAD SAG (muestra 20 problemáticas) ═══\n");

  const sample = problematic.slice(0, 20);

  console.log(
    "REF".padEnd(20) +
    "PRODUCTO".padEnd(8) +
    "PRECIO".padEnd(10) +
    "VARIANTES".padEnd(12) +
    "INV LEVELS".padEnd(12) +
    "INVENTARIO".padEnd(12) +
    "SYNC".padEnd(25) +
    "EXT SOURCE".padEnd(12) +
    "STATUS"
  );
  console.log("-".repeat(120));

  for (const a of sample) {
    const variants = variantsByProduct.get(a.id) ?? [];
    let totalLevels = 0;
    for (const v of variants) {
      totalLevels += (levelsByVariant.get(v.id) ?? []).length;
    }
    // Also count product-level levels
    const pLevels = (levelsByProduct.get(a.id) ?? []).filter((l: any) => !l.variantId);
    totalLevels += pLevels.length;

    console.log(
      a.sku.padEnd(20) +
      (a.name ? "OK" : "NULL").padEnd(8) +
      (a.price != null ? "OK" : "NULL").padEnd(10) +
      `${variants.length}`.padEnd(12) +
      `${totalLevels}`.padEnd(12) +
      (a.hasInventoryData ? `${a.availableQty}` : "NULL").padEnd(12) +
      (a.latestSync ? a.latestSync.substring(0, 22) : "NUNCA").padEnd(25) +
      (a.source || "—").padEnd(12) +
      a.status
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // FASE 5 — COMPARACIÓN (20 sanas)
  // ══════════════════════════════════════════════════════════════════════════

  console.log("\n═══ FASE 5 — COMPARACIÓN (muestra 20 sanas) ═══\n");

  const healthy = withStockPositive
    .sort((a, b) => (b.availableQty ?? 0) - (a.availableQty ?? 0))
    .slice(0, 20);

  console.log(
    "REF".padEnd(20) +
    "PRODUCTO".padEnd(8) +
    "PRECIO".padEnd(10) +
    "VARIANTES".padEnd(12) +
    "INV LEVELS".padEnd(12) +
    "DISPONIBLE".padEnd(12) +
    "SYNC".padEnd(25) +
    "EXT SOURCE".padEnd(12) +
    "STATUS"
  );
  console.log("-".repeat(120));

  for (const a of healthy) {
    const variants = variantsByProduct.get(a.id) ?? [];
    let totalLevels = 0;
    for (const v of variants) {
      totalLevels += (levelsByVariant.get(v.id) ?? []).length;
    }
    const pLevels = (levelsByProduct.get(a.id) ?? []).filter((l: any) => !l.variantId);
    totalLevels += pLevels.length;

    console.log(
      a.sku.padEnd(20) +
      (a.name ? "OK" : "NULL").padEnd(8) +
      (a.price != null ? "OK" : "NULL").padEnd(10) +
      `${variants.length}`.padEnd(12) +
      `${totalLevels}`.padEnd(12) +
      `${a.availableQty}`.padEnd(12) +
      (a.latestSync ? a.latestSync.substring(0, 22) : "NUNCA").padEnd(25) +
      (a.source || "—").padEnd(12) +
      a.status
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // FASE 6 — DIAGNÓSTICO PROFUNDO
  // ══════════════════════════════════════════════════════════════════════════

  console.log("\n═══ FASE 6 — DIAGNÓSTICO PROFUNDO ═══\n");

  // Understand the gap: products with variants but no inventory levels
  const withVariantsNoLevels = audits.filter(a =>
    a.variantCount > 0 && !a.hasInventoryData
  );

  const withVariantsAndLevels = audits.filter(a =>
    a.variantCount > 0 && a.hasInventoryData
  );

  const noVariantsAtAll = audits.filter(a => a.variantCount === 0);

  console.log("─── Diagnóstico de la brecha ───");
  console.log(`  Productos con variantes + inventario:     ${withVariantsAndLevels.length}`);
  console.log(`  Productos con variantes SIN inventario:   ${withVariantsNoLevels.length}`);
  console.log(`  Productos SIN variantes:                  ${noVariantsAtAll.length}`);

  // For products with variants but no inventory: check if variants have externalSource
  const variantSources = new Map<string, number>();
  for (const a of withVariantsNoLevels) {
    const variants = variantsByProduct.get(a.id) ?? [];
    for (const v of variants) {
      const src = v.externalSource || "(sin fuente)";
      variantSources.set(src, (variantSources.get(src) ?? 0) + 1);
    }
  }

  console.log("\n─── Fuentes de variantes (productos SIN inventario) ───");
  for (const [src, n] of variantSources.entries()) {
    console.log(`  ${src.padEnd(20)} ${n} variantes`);
  }

  // Check CRMQuoteLine count for reference
  try {
    const crmLineCount = await (prisma as any).cRMQuoteLine.count({
      where: { organizationId: orgId },
    });
    console.log(`\n─── CRMQuoteLine total: ${crmLineCount} ───`);
  } catch { /* may not exist */ }

  // Check if problematic products have CRM quote lines
  const problematicSkus = problematic.map(a => a.sku).filter(Boolean);
  try {
    const crmLinesForProblematic = await (prisma as any).cRMQuoteLine.findMany({
      where: {
        organizationId: orgId,
        reference: { in: problematicSkus },
      },
      select: { reference: true },
    });
    const uniqueRefs = new Set(crmLinesForProblematic.map((l: any) => l.reference));
    console.log(`CRM quote lines matchean ${uniqueRefs.size} de ${problematicSkus.length} refs problemáticas`);
  } catch { /* may not exist */ }

  // Check description patterns of problematic vs healthy
  console.log("\n─── Primeras 10 descripciones PROBLEMÁTICAS ───");
  for (const a of problematic.slice(0, 10)) {
    console.log(`  ${a.sku}: "${(a.description || "(vacía)").substring(0, 100)}"`);
  }

  console.log("\n─── Primeras 10 descripciones SANAS ───");
  for (const a of healthy.slice(0, 10)) {
    console.log(`  ${a.sku}: "${(a.description || "(vacía)").substring(0, 100)}"`);
  }

  // ── Summary stats for report ──
  console.log("\n═══ RESUMEN PARA REPORTE ═══\n");
  const pctNull = ((withStockNull.length / totalProducts) * 100).toFixed(1);
  const pctPositive = ((withStockPositive.length / totalProducts) * 100).toFixed(1);
  const pctZero = ((withStockZero.length / totalProducts) * 100).toFixed(1);
  console.log(`Stock positivo: ${withStockPositive.length} (${pctPositive}%)`);
  console.log(`Stock = 0:      ${withStockZero.length} (${pctZero}%)`);
  console.log(`Stock null:     ${withStockNull.length} (${pctNull}%)`);
  console.log(`Total:          ${totalProducts}`);

  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
