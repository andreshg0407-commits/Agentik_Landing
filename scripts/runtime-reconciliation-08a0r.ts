/**
 * CASTILLITOS-COMMERCIAL-TRUTH-08A0R — Runtime reconciliation
 *
 * Read-only. No HTTP endpoints. No SAG writes.
 *
 * Sections:
 *   A. Maletas quantities per vendor bodega (SAG vs Agentik)
 *   B. Reference 3544 — presence and suggestion audit
 *   C. Plan de surtido — assortment coverage for 2 vendors
 *   E. Store lines — Latin Kids vs Castillitos runtime check
 *   F. Special articles — CD-* and keyword audit
 *
 * Usage: source .env && DATABASE_URL="$DIRECT_URL?sslmode=require" npx tsx scripts/runtime-reconciliation-08a0r.ts
 */

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
const db = prisma as any;
const ORG_ID = "cmmpwstuf000dp5y58kj1daaj";

// Vendor bodega mapping (canonical)
const VENDORS = [
  { id: "ORLANDO", name: "Orlando", bodegaKaNl: 45, terceroId: 280 },
  { id: "CARLOS_LEON", name: "Carlos Leon", bodegaKaNl: 46, terceroId: null },
  { id: "LUIS", name: "Luis", bodegaKaNl: 47, terceroId: null },
  { id: "NESTOR", name: "Nestor", bodegaKaNl: 48, terceroId: 211 },
  { id: "CARLOS_VILLA", name: "Carlos Villa", bodegaKaNl: 49, terceroId: null },
  { id: "FREDY", name: "Fredy", bodegaKaNl: 50, terceroId: null },
];

// ══════════════════════════════════════════════════════════════════════════════
// SECTION A: Maletas quantities reconciliation
// ══════════════════════════════════════════════════════════════════════════════

async function sectionA() {
  console.log("\n" + "═".repeat(70));
  console.log("SECTION A — MALETAS QUANTITIES PER VENDOR BODEGA");
  console.log("═".repeat(70));

  // Agentik data: ProductInventoryLevel per vendor warehouse
  for (const vendor of VENDORS) {
    const warehouseCode = String(vendor.bodegaKaNl);

    // Get Agentik inventory for this vendor's bodega
    const agentikLevels = await db.productInventoryLevel.findMany({
      where: {
        organizationId: ORG_ID,
        warehouseId: warehouseCode,
        quantity: { gt: 0 },
      },
      include: {
        variant: {
          include: {
            product: { select: { sku: true, name: true } },
          },
        },
      },
    });

    // Aggregate by reference (product SKU)
    const agentikByRef = new Map<string, { units: number; variantCount: number }>();
    for (const level of agentikLevels) {
      const sku = level.variant?.product?.sku;
      if (!sku) continue;
      const existing = agentikByRef.get(sku) ?? { units: 0, variantCount: 0 };
      existing.units += level.quantity;
      existing.variantCount++;
      agentikByRef.set(sku, existing);
    }

    console.log(`\n${vendor.name.padEnd(15)} bodega=${vendor.bodegaKaNl}  terceroId=${vendor.terceroId ?? "—"}`);
    console.log(`  Agentik: ${agentikByRef.size} refs, ${[...agentikByRef.values()].reduce((s, v) => s + v.units, 0)} units`);

    // Show top 5 refs
    const sorted = [...agentikByRef.entries()]
      .sort((a, b) => b[1].units - a[1].units);
    for (const [ref, data] of sorted.slice(0, 5)) {
      console.log(`    ${ref.padEnd(15)} ${data.units} units (${data.variantCount} variants)`);
    }
    if (sorted.length > 5) console.log(`    ... and ${sorted.length - 5} more`);
  }

  // Also check B01 (bodega principal) totals
  const b01Levels = await db.productInventoryLevel.findMany({
    where: {
      organizationId: ORG_ID,
      warehouseId: "10",
      quantity: { gt: 0 },
    },
    select: { quantity: true },
  });
  const b01Total = b01Levels.reduce((s: number, l: any) => s + l.quantity, 0);
  const b01Refs = b01Levels.length;
  console.log(`\n  B01 (Principal): ${b01Refs} variant-levels, ${b01Total} total units`);
}

// ══════════════════════════════════════════════════════════════════════════════
// SECTION B: Reference 3544 audit
// ══════════════════════════════════════════════════════════════════════════════

async function sectionB() {
  console.log("\n" + "═".repeat(70));
  console.log("SECTION B — REFERENCE 3544 AUDIT");
  console.log("═".repeat(70));

  // Find all inventory levels for ref 3544
  const ref3544Product = await db.productEntity.findFirst({
    where: {
      organizationId: ORG_ID,
      sku: { contains: "3544" },
    },
    select: { id: true, sku: true, name: true, productLine: true, grupoSag: true, subgrupoSag: true },
  });

  if (!ref3544Product) {
    // Try broader search
    const candidates = await db.productEntity.findMany({
      where: {
        organizationId: ORG_ID,
        sku: { contains: "3544" },
      },
      select: { id: true, sku: true, name: true },
      take: 10,
    });
    console.log(`  Product "3544" NOT found exact. Candidates: ${candidates.length}`);
    for (const c of candidates) {
      console.log(`    ${c.sku} | ${(c.name ?? "").substring(0, 50)}`);
    }

    if (candidates.length === 0) {
      console.log("  No products matching '3544' — checking broader patterns...");
      const broader = await db.productEntity.findMany({
        where: {
          organizationId: ORG_ID,
          OR: [
            { sku: "3544" },
            { sku: { startsWith: "3544" } },
            { sku: { endsWith: "3544" } },
          ],
        },
        select: { id: true, sku: true, name: true },
        take: 10,
      });
      for (const c of broader) {
        console.log(`    ${c.sku} | ${(c.name ?? "").substring(0, 50)}`);
      }
    }
    return;
  }

  console.log(`  Product: ${ref3544Product.sku} | ${ref3544Product.name}`);
  console.log(`  Line: ${ref3544Product.productLine} | Group: ${ref3544Product.grupoSag} | Subgroup: ${ref3544Product.subgrupoSag}`);

  // Check variants and inventory levels across all warehouses
  const variants = await db.productVariant.findMany({
    where: { productId: ref3544Product.id },
    include: {
      inventoryLevels: {
        where: { quantity: { gt: 0 } },
      },
    },
  });

  console.log(`\n  Variants: ${variants.length}`);
  const warehouseMap = new Map<string, number>();
  for (const v of variants) {
    for (const level of v.inventoryLevels) {
      const wh = level.warehouseId;
      warehouseMap.set(wh, (warehouseMap.get(wh) ?? 0) + level.quantity);
    }
  }

  console.log("\n  Inventory by warehouse:");
  for (const [wh, qty] of [...warehouseMap.entries()].sort((a, b) => b[1] - a[1])) {
    const vendorLabel = VENDORS.find(v => String(v.bodegaKaNl) === wh)?.name ?? "";
    console.log(`    WH=${wh.padEnd(5)} qty=${qty}${vendorLabel ? ` (${vendorLabel})` : ""}`);
  }

  // Check if 3544 appears in vendor suggestions
  // We can't run the full suggestion engine here, but we can verify the
  // product is present in vendor warehouses
  console.log("\n  Vendor presence analysis:");
  for (const vendor of VENDORS) {
    const vendorQty = warehouseMap.get(String(vendor.bodegaKaNl)) ?? 0;
    const status = vendorQty > 0 ? "PRESENT" : "ABSENT";
    console.log(`    ${vendor.name.padEnd(15)} qty=${vendorQty} → ${status}`);
    if (vendorQty > 0) {
      console.log(`      → If ${vendor.name} has ref 3544, it MUST NOT appear in their suggestions`);
      console.log(`      → vendorRefSet normalization: "${ref3544Product.sku.trim().toUpperCase()}" matches "${ref3544Product.sku}"`);
    }
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// SECTION E: Store lines runtime verification
// ══════════════════════════════════════════════════════════════════════════════

async function sectionE() {
  console.log("\n" + "═".repeat(70));
  console.log("SECTION E — STORE LINES RUNTIME VERIFICATION");
  console.log("═".repeat(70));

  // Check products by productLine and verify the mapping is correct
  const lineCounts = await db.$queryRaw`
    SELECT "productLine", COUNT(*) as count
    FROM "ProductEntity"
    WHERE "organizationId" = ${ORG_ID}
      AND "productLine" IS NOT NULL
    GROUP BY "productLine"
    ORDER BY count DESC
  `;

  console.log("\n  Products by SAG productLine:");
  for (const row of lineCounts as any[]) {
    const line = row.productLine;
    const count = Number(row.count);
    // After fix: line "1" should map to latin_kids, line "2" to castillitos
    const mappedTo = line === "1" ? "latin_kids" : line === "2" ? "castillitos" : line === "3" ? "castillitos" : line === "4" ? "accesorios_importacion" : line === "5" ? "accesorios_importacion" : "unknown";
    console.log(`    Line "${line}" → ${mappedTo.padEnd(25)} ${count} products`);
  }

  // Verify specific products — get a sample of line 1 and line 2 products
  const line1Sample = await db.productEntity.findMany({
    where: { organizationId: ORG_ID, productLine: "1" },
    select: { sku: true, name: true, lineaSag: true },
    take: 5,
  });

  const line2Sample = await db.productEntity.findMany({
    where: { organizationId: ORG_ID, productLine: "2" },
    select: { sku: true, name: true, lineaSag: true },
    take: 5,
  });

  console.log("\n  Line 1 sample (should be LATIN KIDS):");
  for (const p of line1Sample) {
    console.log(`    ${p.sku.padEnd(15)} lineaSag="${p.lineaSag}" | ${(p.name ?? "").substring(0, 40)}`);
  }

  console.log("\n  Line 2 sample (should be CASTILLITOS):");
  for (const p of line2Sample) {
    console.log(`    ${p.sku.padEnd(15)} lineaSag="${p.lineaSag}" | ${(p.name ?? "").substring(0, 40)}`);
  }

  // Check store distribution — products per store with line classification
  const stores = await db.productInventoryLevel.findMany({
    where: {
      organizationId: ORG_ID,
      warehouseId: { in: ["10", "11", "31", "32", "39"] },
      quantity: { gt: 0 },
    },
    include: {
      variant: {
        include: {
          product: { select: { sku: true, productLine: true, lineaSag: true } },
        },
      },
    },
  });

  // Group by warehouse and line
  const storeLines = new Map<string, Map<string, number>>();
  for (const level of stores) {
    const wh = level.warehouseId;
    const line = level.variant?.product?.productLine ?? "NULL";
    if (!storeLines.has(wh)) storeLines.set(wh, new Map());
    const lineMap = storeLines.get(wh)!;
    lineMap.set(line, (lineMap.get(line) ?? 0) + 1);
  }

  const warehouseNames: Record<string, string> = {
    "10": "B01 PRINCIPAL",
    "11": "B02 SAN DIEGO",
    "31": "B00 CENTRO",
    "32": "B23 GRAN PLAZA",
    "39": "B29 CALDAS",
  };

  console.log("\n  Store inventory by line:");
  for (const [wh, lineMap] of [...storeLines.entries()].sort()) {
    const name = warehouseNames[wh] ?? wh;
    console.log(`\n    ${name}:`);
    for (const [line, count] of [...lineMap.entries()].sort()) {
      const mapped = line === "1" ? "→latin_kids" : line === "2" ? "→castillitos" : line === "3" ? "→castillitos(otros)" : line === "5" ? "→importacion" : "";
      console.log(`      Line "${line}" ${mapped.padEnd(25)} ${count} variant-levels`);
    }
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// SECTION F: Special articles audit
// ══════════════════════════════════════════════════════════════════════════════

async function sectionF() {
  console.log("\n" + "═".repeat(70));
  console.log("SECTION F — SPECIAL ARTICLES AUDIT");
  console.log("═".repeat(70));

  // 1. CD-* references
  const cdRefs = await db.productEntity.findMany({
    where: {
      organizationId: ORG_ID,
      sku: { startsWith: "CD" },
    },
    select: { sku: true, name: true, productLine: true, lineaSag: true, grupoSag: true, subgrupoSag: true },
    orderBy: { sku: "asc" },
  });

  console.log(`\n  CD-* references: ${cdRefs.length}`);
  const byGroup = new Map<string, number>();
  for (const r of cdRefs) {
    const g = r.grupoSag ?? "NULL";
    byGroup.set(g, (byGroup.get(g) ?? 0) + 1);
  }
  for (const [g, c] of [...byGroup.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`    Group "${g}": ${c} refs`);
  }
  // Show first 10 CD- refs
  for (const r of cdRefs.slice(0, 10)) {
    console.log(`    ${r.sku.padEnd(20)} ${(r.name ?? "").substring(0, 40)} | line=${r.productLine} grupo=${r.grupoSag} sub=${r.subgrupoSag}`);
  }
  if (cdRefs.length > 10) console.log(`    ... and ${cdRefs.length - 10} more`);

  // 2. All products for keyword search
  const allProducts = await db.productEntity.findMany({
    where: { organizationId: ORG_ID },
    select: { sku: true, name: true, lineaSag: true, grupoSag: true, subgrupoSag: true },
  });

  // 3. SKU prefix distribution
  const prefixCounts = new Map<string, number>();
  for (const p of allProducts) {
    const sku = (p.sku ?? "").trim();
    if (sku.length < 2) continue;
    const match = sku.match(/[0-9-]/);
    const prefix = sku.substring(0, match?.index ?? 3).toUpperCase();
    if (prefix.length >= 1) {
      prefixCounts.set(prefix, (prefixCounts.get(prefix) ?? 0) + 1);
    }
  }

  console.log(`\n  SKU prefix distribution (top 15):`);
  const sorted = [...prefixCounts.entries()].sort((a, b) => b[1] - a[1]);
  for (const [prefix, count] of sorted.slice(0, 15)) {
    console.log(`    ${prefix.padEnd(8)} ${count} refs`);
  }

  // 4. SAG groups
  const groups = new Map<string, number>();
  const subgroups = new Map<string, number>();
  for (const p of allProducts) {
    if (p.grupoSag) groups.set(p.grupoSag, (groups.get(p.grupoSag) ?? 0) + 1);
    if (p.subgrupoSag) subgroups.set(p.subgrupoSag, (subgroups.get(p.subgrupoSag) ?? 0) + 1);
  }

  console.log(`\n  SAG groups (${groups.size} unique):`);
  for (const [g, c] of [...groups.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`    ${g.padEnd(30)} ${c} refs`);
  }

  console.log(`\n  SAG subgroups (${subgroups.size} unique, top 20):`);
  for (const [s, c] of [...subgroups.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20)) {
    console.log(`    ${s.padEnd(30)} ${c} refs`);
  }

  // 5. Keyword matches
  const keywords = ["BASICO", "BASICA", "ESPECIAL", "COLECCION", "EDICION", "LIMITADA", "PREMIUM", "OUTLET", "NAVIDAD", "HALLOWEEN", "DISNEY", "LICENCIA"];
  console.log(`\n  Keyword matches in product names:`);
  for (const kw of keywords) {
    const matches = allProducts.filter((p: any) => (p.name ?? "").toUpperCase().includes(kw));
    if (matches.length > 0) {
      console.log(`    "${kw}": ${matches.length} refs`);
      for (const m of matches.slice(0, 3)) {
        console.log(`      ${m.sku} | ${(m.name ?? "").substring(0, 45)}`);
      }
      if (matches.length > 3) console.log(`      ... and ${matches.length - 3} more`);
    }
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// SECTION C: Plan de surtido — assortment evaluation for 2 vendors
// ══════════════════════════════════════════════════════════════════════════════

async function sectionC() {
  console.log("\n" + "═".repeat(70));
  console.log("SECTION C — PLAN DE SURTIDO / ASSORTMENT EVALUATION");
  console.log("═".repeat(70));

  // Check VendorBagIdealRouteRule for derrotero config
  const routeRules = await db.vendorBagIdealRouteRule.findMany({
    where: { organizationId: ORG_ID },
    orderBy: [{ vendorId: "asc" }, { line: "asc" }, { subgrupoSag: "asc" }],
  });

  console.log(`\n  VendorBagIdealRouteRule records: ${routeRules.length}`);

  // Group by vendor
  const rulesByVendor = new Map<string, typeof routeRules>();
  for (const rule of routeRules) {
    const vid = rule.vendorId;
    if (!rulesByVendor.has(vid)) rulesByVendor.set(vid, []);
    rulesByVendor.get(vid)!.push(rule);
  }

  for (const [vid, rules] of rulesByVendor) {
    const activationRule = rules.find((r: any) => r.line === "__ACTIVATION__");
    const isActive = activationRule ? (activationRule as any).minimumRefs === 1 : false;
    const derroteroRules = rules.filter((r: any) => r.line !== "__ACTIVATION__");

    console.log(`\n  Vendor: ${vid} (active=${isActive})`);
    console.log(`    Derrotero rules: ${derroteroRules.length}`);

    if (derroteroRules.length > 0) {
      // Group by line
      const byLine = new Map<string, any[]>();
      for (const r of derroteroRules) {
        const line = (r as any).line;
        if (!byLine.has(line)) byLine.set(line, []);
        byLine.get(line)!.push(r);
      }
      for (const [line, lineRules] of byLine) {
        console.log(`    Line ${line}: ${lineRules.length} subgrupo rules`);
        for (const r of lineRules.slice(0, 5)) {
          console.log(`      ${((r as any).subgrupoSag ?? "—").padEnd(30)} minRefs=${(r as any).minimumRefs}`);
        }
        if (lineRules.length > 5) console.log(`      ... and ${lineRules.length - 5} more`);
      }
    }
  }

  // Now check vendor presence (what refs are in each vendor's bodega)
  console.log("\n  Vendor presence (Agentik inventory by vendor bodega):");
  for (const vendor of VENDORS.slice(0, 2)) { // First 2 vendors
    const levels = await db.productInventoryLevel.findMany({
      where: {
        organizationId: ORG_ID,
        warehouseId: String(vendor.bodegaKaNl),
        quantity: { gt: 0 },
      },
      include: {
        variant: {
          include: {
            product: { select: { sku: true, name: true, subgrupoSag: true, grupoSag: true, productLine: true } },
          },
        },
      },
    });

    // Group by subgrupoSag
    const bySubgrupo = new Map<string, { refs: Set<string>; units: number }>();
    for (const level of levels) {
      const sg = level.variant?.product?.subgrupoSag ?? "SIN_SUBGRUPO";
      const sku = level.variant?.product?.sku ?? "?";
      if (!bySubgrupo.has(sg)) bySubgrupo.set(sg, { refs: new Set(), units: 0 });
      bySubgrupo.get(sg)!.refs.add(sku);
      bySubgrupo.get(sg)!.units += level.quantity;
    }

    console.log(`\n  ${vendor.name} (bodega ${vendor.bodegaKaNl}):`);
    console.log(`    Total: ${levels.length} variant-levels, ${bySubgrupo.size} subgrupos`);

    // Check against derrotero rules
    const vendorRules = rulesByVendor.get(vendor.id) ?? [];
    const derroteroRules = vendorRules.filter((r: any) => r.line !== "__ACTIVATION__");

    if (derroteroRules.length === 0) {
      console.log("    ⚠ No derrotero rules configured for this vendor");
    } else {
      let complete = 0;
      let incomplete = 0;
      let missing = 0;

      for (const rule of derroteroRules) {
        const sg = (rule as any).subgrupoSag ?? "?";
        const minRefs = (rule as any).minimumRefs ?? 3;
        const present = bySubgrupo.get(sg);
        const refCount = present?.refs.size ?? 0;

        if (refCount >= minRefs) {
          complete++;
        } else if (refCount > 0) {
          incomplete++;
          console.log(`    INCOMPLETE: ${sg.padEnd(25)} ${refCount}/${minRefs} refs`);
        } else {
          missing++;
          console.log(`    MISSING:    ${sg.padEnd(25)} 0/${minRefs} refs`);
        }
      }

      console.log(`    Summary: ${complete} complete, ${incomplete} incomplete, ${missing} missing`);
    }

    // Show subgrupos with their ref counts
    const sortedSg = [...bySubgrupo.entries()].sort((a, b) => b[1].units - a[1].units);
    console.log(`\n    Subgrupos present (top 10 by units):`);
    for (const [sg, data] of sortedSg.slice(0, 10)) {
      console.log(`      ${sg.padEnd(30)} ${data.refs.size} refs, ${data.units} units`);
    }
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN
// ══════════════════════════════════════════════════════════════════════════════

async function main() {
  console.log("CASTILLITOS-COMMERCIAL-TRUTH-08A0R — Runtime Reconciliation");
  console.log(`Timestamp: ${new Date().toISOString()}`);
  console.log(`OrgId: ${ORG_ID}`);

  try {
    await sectionA();
    await sectionB();
    await sectionC();
    await sectionE();
    await sectionF();
  } catch (err) {
    console.error("FATAL:", err);
  } finally {
    await prisma.$disconnect();
    pool.end();
  }
}

main();
