/**
 * scripts/audit-tiendas-catalog.ts
 *
 * Read-only audit of the real catalog structure available for Tiendas rules.
 * Sprint: TIENDAS-CATALOG-AUDIT-01
 *
 * Usage: npx tsx scripts/audit-tiendas-catalog.ts
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
import "dotenv/config";
import { prisma } from "@/lib/prisma";

async function main() {
  const org = await prisma.organization.findFirst({ where: { slug: "castillitos" } });
  if (!org) { console.log("ERROR: org castillitos not found"); process.exit(1); }
  const orgId = org.id;

  console.log("=== TIENDAS-CATALOG-AUDIT-01 ===");
  console.log(`Org: ${org.name} (${orgId})\n`);

  // ── FASE 1: CAMPO COVERAGE ─────────────────────────────────────────────────

  console.log("══════════════════════════════════════════════════════════════");
  console.log("FASE 1: CAMPO COVERAGE — ProductEntity");
  console.log("══════════════════════════════════════════════════════════════\n");

  const totalProducts = await prisma.productEntity.count({ where: { organizationId: orgId } });
  console.log(`Total ProductEntity: ${totalProducts}`);

  // Field coverage
  const fields = [
    { name: "name",          where: { name: { not: "" } } },
    { name: "sku",           where: { sku: { not: null } } },
    { name: "category",      where: { category: { not: null } } },
    { name: "productLine",   where: { productLine: { not: null } } },
    { name: "segment",       where: { segment: { not: null } } },
    { name: "subgrupoSag",   where: { subgrupoSag: { not: null } } },
    { name: "subgrupoId",    where: { subgrupoId: { not: null } } },
    { name: "crmName",       where: { crmName: { not: null } } },
    { name: "externalSource", where: { externalSource: { not: null } } },
    { name: "externalId",    where: { externalId: { not: null } } },
  ];

  for (const f of fields) {
    const count = await prisma.productEntity.count({
      where: { organizationId: orgId, ...f.where },
    });
    const pct = totalProducts > 0 ? Math.round((count / totalProducts) * 100) : 0;
    console.log(`  ${f.name.padEnd(18)} ${String(count).padStart(5)} / ${totalProducts}  (${pct}%)`);
  }

  // ── ProductEntity.category distinct values ──
  console.log("\n--- ProductEntity.category (distinct) ---");
  const categories = await prisma.productEntity.groupBy({
    by: ["category"],
    where: { organizationId: orgId, category: { not: null } },
    _count: { id: true } as any,
    orderBy: { _count: { id: "desc" } },
    take: 30,
  });
  for (const c of categories) {
    console.log(`  "${c.category}"  (${(c._count as any).id} products)`);
  }

  // ── ProductEntity.productLine distinct values ──
  console.log("\n--- ProductEntity.productLine (distinct) ---");
  const lines = await prisma.productEntity.groupBy({
    by: ["productLine"],
    where: { organizationId: orgId, productLine: { not: null } },
    _count: { id: true } as any,
    orderBy: { _count: { id: "desc" } },
    take: 30,
  });
  for (const l of lines) {
    console.log(`  "${l.productLine}"  (${(l._count as any).id} products)`);
  }

  // ── ProductEntity.subgrupoSag distinct values ──
  console.log("\n--- ProductEntity.subgrupoSag (distinct) ---");
  const subgroups = await prisma.productEntity.groupBy({
    by: ["subgrupoSag"],
    where: { organizationId: orgId, subgrupoSag: { not: null } },
    _count: { id: true } as any,
    orderBy: { _count: { id: "desc" } },
    take: 50,
  });
  for (const s of subgroups) {
    console.log(`  "${s.subgrupoSag}"  (${(s._count as any).id} products)`);
  }

  // ── ProductEntity.segment distinct values ──
  console.log("\n--- ProductEntity.segment (distinct) ---");
  const segments = await prisma.productEntity.groupBy({
    by: ["segment"],
    where: { organizationId: orgId, segment: { not: null } },
    _count: { id: true } as any,
    orderBy: { _count: { id: "desc" } },
    take: 20,
  });
  for (const s of segments) {
    console.log(`  "${s.segment}"  (${(s._count as any).id} products)`);
  }

  // ── FASE 2: JERARQUÍA REAL ──────────────────────────────────────────────────

  console.log("\n══════════════════════════════════════════════════════════════");
  console.log("FASE 2: JERARQUÍA REAL — productLine → subgrupoSag");
  console.log("══════════════════════════════════════════════════════════════\n");

  const hierarchy = await prisma.productEntity.findMany({
    where: {
      organizationId: orgId,
      productLine: { not: null },
      subgrupoSag: { not: null },
    },
    select: { productLine: true, subgrupoSag: true },
  });

  const hierMap = new Map<string, Set<string>>();
  for (const h of hierarchy) {
    const line = h.productLine!;
    if (!hierMap.has(line)) hierMap.set(line, new Set());
    hierMap.get(line)!.add(h.subgrupoSag!);
  }

  for (const [line, sgs] of [...hierMap.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    console.log(`${line}:`);
    for (const sg of [...sgs].sort()) {
      console.log(`  - ${sg}`);
    }
  }

  // ── Also check productLine → category mapping ──
  console.log("\n--- productLine → category mapping ---");
  const lineCatMap = await prisma.productEntity.findMany({
    where: {
      organizationId: orgId,
      productLine: { not: null },
      category: { not: null },
    },
    select: { productLine: true, category: true },
  });

  const lcMap = new Map<string, Set<string>>();
  for (const lc of lineCatMap) {
    const line = lc.productLine!;
    if (!lcMap.has(line)) lcMap.set(line, new Set());
    lcMap.get(line)!.add(lc.category!);
  }

  for (const [line, cats] of [...lcMap.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    console.log(`${line}:`);
    for (const cat of [...cats].sort()) {
      console.log(`  - ${cat}`);
    }
  }

  // ── FASE 3: VERIFICAR category ──────────────────────────────────────────────

  console.log("\n══════════════════════════════════════════════════════════════");
  console.log("FASE 3: VERIFICAR category — ¿Es realmente subgrupo?");
  console.log("══════════════════════════════════════════════════════════════\n");

  // Compare category vs subgrupoSag on same products
  const catVsSub = await prisma.productEntity.findMany({
    where: {
      organizationId: orgId,
      category: { not: null },
      subgrupoSag: { not: null },
    },
    select: { name: true, category: true, subgrupoSag: true, productLine: true },
    take: 30,
  });

  console.log("ProductEntity samples (category vs subgrupoSag):");
  for (const p of catVsSub) {
    const match = p.category === p.subgrupoSag ? "MATCH" : "DIFF";
    console.log(`  [${match}] category="${p.category}" subgrupoSag="${p.subgrupoSag}" line="${p.productLine}" name="${p.name?.substring(0, 50)}"`);
  }

  const matchCount = catVsSub.filter(p => p.category === p.subgrupoSag).length;
  console.log(`\n  Match rate: ${matchCount}/${catVsSub.length} (${catVsSub.length > 0 ? Math.round((matchCount / catVsSub.length) * 100) : 0}%)`);

  // ── FASE 4: VERIFICAR line ─────────────────────────────────────────────────

  console.log("\n══════════════════════════════════════════════════════════════");
  console.log("FASE 4: VERIFICAR line — ¿productLine es marca/línea comercial?");
  console.log("══════════════════════════════════════════════════════════════\n");

  // Show productLine vs inferProductType comparison
  const lineExamples = await prisma.productEntity.findMany({
    where: { organizationId: orgId, productLine: { not: null } },
    select: { name: true, productLine: true, category: true, subgrupoSag: true },
    take: 30,
  });

  console.log("ProductEntity.productLine examples:");
  for (const p of lineExamples) {
    console.log(`  productLine="${p.productLine}" category="${p.category}" subgrupoSag="${p.subgrupoSag}" name="${p.name?.substring(0, 50)}"`);
  }

  // ── FASE 5: VERIFICAR TALLA Y COLOR ──────────────────────────────────────

  console.log("\n══════════════════════════════════════════════════════════════");
  console.log("FASE 5: VERIFICAR TALLA Y COLOR — ProductVariantAttribute");
  console.log("══════════════════════════════════════════════════════════════\n");

  const totalVariants = await prisma.productVariant.count({ where: { organizationId: orgId } });
  const totalAttrs = await prisma.productVariantAttribute.count({ where: { organizationId: orgId } });
  console.log(`Total ProductVariant: ${totalVariants}`);
  console.log(`Total ProductVariantAttribute: ${totalAttrs}`);

  // Attribute keys
  console.log("\n--- Attribute keys ---");
  const attrKeys = await prisma.productVariantAttribute.groupBy({
    by: ["key"],
    where: { organizationId: orgId },
    _count: { id: true } as any,
    orderBy: { _count: { id: "desc" } },
    take: 20,
  });
  for (const k of attrKeys) {
    console.log(`  key="${k.key}"  count=${(k._count as any).id}`);
  }

  // Talla values (top 50)
  console.log("\n--- Talla values (top 50) ---");
  const tallas = await prisma.productVariantAttribute.groupBy({
    by: ["value"],
    where: { organizationId: orgId, key: "talla" },
    _count: { id: true } as any,
    orderBy: { _count: { id: "desc" } },
    take: 50,
  });
  for (const t of tallas) {
    console.log(`  "${t.value}"  (${(t._count as any).id})`);
  }

  // Color values (top 50)
  console.log("\n--- Color values (top 50) ---");
  const colors = await prisma.productVariantAttribute.groupBy({
    by: ["value"],
    where: { organizationId: orgId, key: "color" },
    _count: { id: true } as any,
    orderBy: { _count: { id: "desc" } },
    take: 50,
  });
  for (const c of colors) {
    console.log(`  "${c.value}"  (${(c._count as any).id})`);
  }

  // Weird/suspicious talla values
  console.log("\n--- Suspicious talla values (GEN/GENERICO/codes) ---");
  const suspTallas = await prisma.productVariantAttribute.findMany({
    where: {
      organizationId: orgId,
      key: "talla",
      OR: [
        { value: { contains: "GEN", mode: "insensitive" } },
        { value: { startsWith: "AM" } },
        { value: { startsWith: "RS" } },
        { value: { startsWith: "AZ" } },
      ],
    },
    select: { value: true, externalRef: true },
    take: 30,
  });
  for (const s of suspTallas) {
    console.log(`  value="${s.value}" externalRef="${s.externalRef}"`);
  }

  // ── FASE 6: VERIFICAR TAMAÑO COMERCIAL ────────────────────────────────────

  console.log("\n══════════════════════════════════════════════════════════════");
  console.log("FASE 6: VERIFICAR TAMAÑO COMERCIAL");
  console.log("══════════════════════════════════════════════════════════════\n");

  // Check if any attribute key contains size/tamaño/volumen
  const sizeKeys = await prisma.productVariantAttribute.groupBy({
    by: ["key"],
    where: {
      organizationId: orgId,
      key: {
        in: [
          "sizeClass", "size_class", "commercialSize", "tamano", "tamaño",
          "volumen", "tipo_tamano", "size_type", "peso", "weight",
        ],
      },
    },
    _count: { id: true } as any,
  });

  if (sizeKeys.length === 0) {
    console.log("  NO size class attribute found in ProductVariantAttribute.");
    console.log("  Checked: sizeClass, size_class, commercialSize, tamano, volumen, tipo_tamano, peso, weight");
  } else {
    for (const k of sizeKeys) {
      console.log(`  key="${k.key}" count=${(k._count as any).id}`);
    }
  }

  // Check ProductAttribute (different model) for size class
  const prodAttrSizeKeys = await (prisma as any).productAttribute.groupBy({
    by: ["key"],
    where: { organizationId: orgId },
    _count: { id: true },
    orderBy: { _count: { id: "desc" } },
    take: 20,
  }).catch(() => []);

  if (prodAttrSizeKeys.length > 0) {
    console.log("\n--- ProductAttribute keys (may contain size class) ---");
    for (const k of prodAttrSizeKeys) {
      console.log(`  key="${k.key}" count=${k._count.id}`);
    }
  }

  // ── FASE 7: VERIFICAR CLASE PRODUCTO ───────────────────────────────────────

  console.log("\n══════════════════════════════════════════════════════════════");
  console.log("FASE 7: VERIFICAR CLASE PRODUCTO");
  console.log("══════════════════════════════════════════════════════════════\n");

  // Check if there's any explicit product class field
  // Try subgrupoSag patterns to infer class
  const subgroupPatterns = await prisma.productEntity.findMany({
    where: { organizationId: orgId, subgrupoSag: { not: null } },
    select: { subgrupoSag: true, name: true, productLine: true },
    take: 100,
  });

  const inferMap: Record<string, string[]> = { textile: [], bulky: [], accessory: [], other: [] };
  for (const p of subgroupPatterns) {
    const sg = (p.subgrupoSag ?? "").toUpperCase();
    const name = (p.name ?? "").toUpperCase();
    const combined = `${sg} ${name}`;
    if (/PIJAMA|CAMISET|CAMISILLA|BLUSA|PANTALON|VESTID|CONJUNTO|BODY|SHORT|LEGGIN|FALDA|SUDAD|JEAN|BATA|POLO|BUZO|CAMIBUSO|MAMELUCO/.test(combined)) {
      if (!inferMap.textile.includes(p.subgrupoSag!)) inferMap.textile.push(p.subgrupoSag!);
    } else if (/COCHE|CUNA|MESA|SILLA|COMODA|ESTANTE|MUEBLE|CAMINADOR|CORRAL/.test(combined)) {
      if (!inferMap.bulky.includes(p.subgrupoSag!)) inferMap.bulky.push(p.subgrupoSag!);
    } else if (/BOLSO|MORRAL|LONCHERA|MALET|GUANT|GORRO|MEDIA|CALCETIN|ZAPATO|SAND/.test(combined)) {
      if (!inferMap.accessory.includes(p.subgrupoSag!)) inferMap.accessory.push(p.subgrupoSag!);
    } else {
      if (!inferMap.other.includes(p.subgrupoSag!)) inferMap.other.push(p.subgrupoSag!);
    }
  }

  for (const [cls, sgs] of Object.entries(inferMap)) {
    console.log(`${cls} (${sgs.length} subgroups):`);
    for (const sg of sgs.sort().slice(0, 15)) {
      console.log(`  - ${sg}`);
    }
    if (sgs.length > 15) console.log(`  ... and ${sgs.length - 15} more`);
  }

  // ── FASE 8: MATCH INVENTARIO ↔ PRODUCTO ────────────────────────────────────

  console.log("\n══════════════════════════════════════════════════════════════");
  console.log("FASE 8: MATCH ProductInventoryLevel → ProductEntity/Variant");
  console.log("══════════════════════════════════════════════════════════════\n");

  const totalPIL = await prisma.productInventoryLevel.count({ where: { organizationId: orgId } });
  const pilWithProduct = await prisma.productInventoryLevel.count({ where: { organizationId: orgId, productId: { not: "" } } });
  const pilWithVariant = await prisma.productInventoryLevel.count({ where: { organizationId: orgId, variantId: { not: null } } });

  console.log(`Total ProductInventoryLevel: ${totalPIL}`);
  console.log(`  with productId:  ${pilWithProduct} (${totalPIL > 0 ? Math.round((pilWithProduct / totalPIL) * 100) : 0}%)`);
  console.log(`  with variantId:  ${pilWithVariant} (${totalPIL > 0 ? Math.round((pilWithVariant / totalPIL) * 100) : 0}%)`);

  // Check how many PILs resolve to a ProductEntity with productLine
  const pilResolving = await prisma.productInventoryLevel.findMany({
    where: { organizationId: orgId },
    select: {
      id: true,
      warehouseId: true,
      quantity: true,
      product: {
        select: { name: true, productLine: true, category: true, subgrupoSag: true },
      },
      variant: {
        select: {
          name: true,
          variantAttributes: { select: { key: true, value: true } },
        },
      },
    },
    take: 200,
  });

  let resolvedLine = 0, resolvedSubgroup = 0, resolvedSize = 0, resolvedColor = 0;
  for (const pil of pilResolving) {
    if (pil.product?.productLine) resolvedLine++;
    if (pil.product?.subgrupoSag) resolvedSubgroup++;
    if (pil.variant?.variantAttributes?.some((a: any) => a.key === "talla")) resolvedSize++;
    if (pil.variant?.variantAttributes?.some((a: any) => a.key === "color")) resolvedColor++;
  }

  const sample = pilResolving.length;
  console.log(`\nResolution sample (${sample} PILs):`);
  console.log(`  resolves productLine:  ${resolvedLine} (${Math.round((resolvedLine / sample) * 100)}%)`);
  console.log(`  resolves subgrupoSag:  ${resolvedSubgroup} (${Math.round((resolvedSubgroup / sample) * 100)}%)`);
  console.log(`  resolves talla:        ${resolvedSize} (${Math.round((resolvedSize / sample) * 100)}%)`);
  console.log(`  resolves color:        ${resolvedColor} (${Math.round((resolvedColor / sample) * 100)}%)`);

  // PIL warehouse distribution
  console.log("\n--- PIL warehouseId distribution ---");
  const whDist = await prisma.productInventoryLevel.groupBy({
    by: ["warehouseId"],
    where: { organizationId: orgId },
    _count: { id: true } as any,
    _sum: { quantity: true } as any,
    orderBy: { _count: { id: "desc" } },
    take: 15,
  });
  for (const w of whDist) {
    console.log(`  wh="${w.warehouseId}"  rows=${(w._count as any).id}  totalQty=${(w._sum as any).quantity}`);
  }

  // ── Show some PIL → full resolution examples ──
  console.log("\n--- PIL → full resolution examples (first 10 with variant) ---");
  const pilExamples = pilResolving
    .filter(p => p.variant && p.product?.productLine)
    .slice(0, 10);
  for (const p of pilExamples) {
    const talla = p.variant?.variantAttributes?.find((a: any) => a.key === "talla")?.value ?? "—";
    const color = p.variant?.variantAttributes?.find((a: any) => a.key === "color")?.value ?? "—";
    console.log(`  wh=${p.warehouseId} qty=${p.quantity} line="${p.product?.productLine}" subgrupo="${p.product?.subgrupoSag}" talla="${talla}" color="${color}" name="${p.product?.name?.substring(0, 40)}"`);
  }

  // ── FASE 9: COMPARE INFERRED VS REAL ────────────────────────────────────────

  console.log("\n══════════════════════════════════════════════════════════════");
  console.log("FASE 9: INFERRED (current adapter) vs REAL (SAG fields)");
  console.log("══════════════════════════════════════════════════════════════\n");

  // Show how inferProductType and inferCategory differ from real data
  const comparison = await prisma.productEntity.findMany({
    where: { organizationId: orgId, productLine: { not: null }, subgrupoSag: { not: null } },
    select: { name: true, productLine: true, category: true, subgrupoSag: true },
    take: 30,
  });

  // Apply the same inference heuristics used in sag-store-adapter
  function inferCategory(desc: string): string {
    const upper = desc.toUpperCase();
    if (upper.includes("BEBE") && upper.includes("NIÑA")) return "NIÑA BEBE";
    if (upper.includes("BEBE") && upper.includes("NIÑO")) return "NIÑO BEBE";
    if (upper.includes("KIDS") && upper.includes("NIÑA")) return "NIÑA KIDS";
    if (upper.includes("KIDS") && upper.includes("NIÑO")) return "NIÑO KIDS";
    if (upper.includes("NIÑA")) return "NIÑA";
    if (upper.includes("NIÑO")) return "NIÑO";
    if (upper.includes("BEBE")) return "BEBE";
    return "GENERAL";
  }

  function inferProductType(desc: string): string {
    const upper = desc.toUpperCase();
    if (upper.includes("PIJAMA")) return "PIJAMA";
    if (upper.includes("VESTIDO")) return "VESTIDO";
    if (upper.includes("CONJUNTO")) return "CONJUNTO";
    if (upper.includes("BLUSA")) return "BLUSA";
    if (upper.includes("BUZO") || upper.includes("CAMIBUSO")) return "BUZO/CAMIBUSO";
    if (upper.includes("CAMISETA")) return "CAMISETA";
    if (upper.includes("POLO")) return "POLO";
    if (upper.includes("MAMELUCO")) return "MAMELUCO";
    return "OTRO";
  }

  console.log("Product | inferred_category | REAL productLine | inferred_type | REAL subgrupoSag");
  console.log("-".repeat(120));
  for (const p of comparison) {
    const infCat = inferCategory(p.name);
    const infType = inferProductType(p.name);
    const catMatch = infCat === p.productLine ? "=" : "X";
    const typeMatch = infType === p.subgrupoSag ? "=" : "X";
    console.log(
      `  [${catMatch}] infCat="${infCat.padEnd(12)}" realLine="${(p.productLine ?? "").padEnd(20)}" ` +
      `[${typeMatch}] infType="${infType.padEnd(14)}" realSub="${p.subgrupoSag}" ` +
      `name="${p.name?.substring(0, 35)}"`
    );
  }

  // Count how many match vs differ
  let catMatchCount = 0, typeMatchCount = 0;
  for (const p of comparison) {
    if (inferCategory(p.name) === p.productLine) catMatchCount++;
    if (inferProductType(p.name) === p.subgrupoSag) typeMatchCount++;
  }
  console.log(`\nInferred category → productLine match: ${catMatchCount}/${comparison.length} (${comparison.length > 0 ? Math.round((catMatchCount / comparison.length) * 100) : 0}%)`);
  console.log(`Inferred type → subgrupoSag match: ${typeMatchCount}/${comparison.length} (${comparison.length > 0 ? Math.round((typeMatchCount / comparison.length) * 100) : 0}%)`);

  console.log("\n══════════════════════════════════════════════════════════════");
  console.log("AUDIT COMPLETE");
  console.log("══════════════════════════════════════════════════════════════");

  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
