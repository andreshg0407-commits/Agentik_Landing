// @ts-nocheck
/**
 * scripts/_pedido_inventory_match_audit.ts
 *
 * Phase 1: READ-ONLY audit of CRMQuoteLine ↔ ProductVariant matching.
 * Usage: npx tsx scripts/_pedido_inventory_match_audit.ts
 *
 * Sprint: COMERCIAL-PEDIDOS-LINE-INVENTORY-LINK-04
 */

import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) } as any);

// ── Normalizers ──────────────────────────────────────────────────────────────

function norm(s: string | null | undefined): string {
  return (s ?? "").trim().toUpperCase().replace(/\s+/g, " ");
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("=== COMERCIAL-PEDIDOS-LINE-INVENTORY-LINK-04 — Phase 1 Audit ===\n");

  const orgId = await getOrgId("castillitos");
  if (!orgId) { console.error("Org not found"); return; }

  // 1. Load all CRMQuoteLines
  const quoteLines = await prisma.cRMQuoteLine.findMany({
    where: { organizationId: orgId },
  });
  console.log(`CRMQuoteLines: ${quoteLines.length}`);

  // 2. Load all ProductVariants with their product
  const variants = await prisma.productVariant.findMany({
    where: { organizationId: orgId },
    include: { product: { select: { id: true, sku: true, name: true } } },
  });
  console.log(`ProductVariants: ${variants.length}`);

  // 3. Load all ProductInventoryLevels
  const inventoryLevels = await prisma.productInventoryLevel.findMany({
    where: { organizationId: orgId },
  });
  console.log(`ProductInventoryLevels: ${inventoryLevels.length}\n`);

  // ── Build variant lookup indexes ───────────────────────────────────────────

  // Index 1: by variant SKU (normalized)
  const variantBySku = new Map<string, typeof variants[0][]>();
  // Index 2: by product SKU (normalized)
  const variantsByProductSku = new Map<string, typeof variants[0][]>();
  // Index 3: by product name (normalized)
  const variantsByProductName = new Map<string, typeof variants[0][]>();

  for (const v of variants) {
    // Variant SKU
    const vSku = norm(v.sku);
    if (vSku) {
      if (!variantBySku.has(vSku)) variantBySku.set(vSku, []);
      variantBySku.get(vSku)!.push(v);
    }
    // Product SKU
    const pSku = norm(v.product?.sku);
    if (pSku) {
      if (!variantsByProductSku.has(pSku)) variantsByProductSku.set(pSku, []);
      variantsByProductSku.get(pSku)!.push(v);
    }
    // Product name
    const pName = norm(v.product?.name);
    if (pName) {
      if (!variantsByProductName.has(pName)) variantsByProductName.set(pName, []);
      variantsByProductName.get(pName)!.push(v);
    }
  }

  console.log(`Variant SKU index: ${variantBySku.size} unique keys`);
  console.log(`Product SKU index: ${variantsByProductSku.size} unique keys`);
  console.log(`Product Name index: ${variantsByProductName.size} unique keys\n`);

  // ── Inventory index ─────────────────────────────────────────────────────────

  // variantId → total available
  const inventoryByVariant = new Map<string, number>();
  for (const il of inventoryLevels) {
    if (!il.variantId) continue;
    const current = inventoryByVariant.get(il.variantId) ?? 0;
    inventoryByVariant.set(il.variantId, current + Math.max(0, il.quantity));
  }
  console.log(`Variants with inventory: ${inventoryByVariant.size}\n`);

  // ── Match each CRMQuoteLine ─────────────────────────────────────────────────

  let exactSkuMatch = 0;        // variant.sku matches reference
  let productSkuMatch = 0;      // product.sku matches reference
  let productNameMatch = 0;     // product.name matches reference
  let noMatch = 0;

  let exactWithSizeColor = 0;
  let exactRefOnly = 0;

  let withInventory = 0;
  let withoutInventory = 0;
  let totalAvailable = 0;
  let totalOutOfStock = 0;

  const noMatchExamples: string[] = [];
  const matchExamples: string[] = [];

  // Unique references
  const uniqueRefs = new Set<string>();
  const unmatchedRefs = new Set<string>();

  for (const ql of quoteLines) {
    const ref = norm(ql.reference);
    const size = norm(ql.size);
    const color = norm(ql.color);
    uniqueRefs.add(ref);

    // Strategy 1: variant SKU exact
    let candidates = variantBySku.get(ref);
    let matchType = "variant_sku";

    // Strategy 2: product SKU
    if (!candidates?.length) {
      candidates = variantsByProductSku.get(ref);
      matchType = "product_sku";
    }

    // Strategy 3: product name
    if (!candidates?.length) {
      candidates = variantsByProductName.get(ref);
      matchType = "product_name";
    }

    if (!candidates?.length) {
      noMatch++;
      unmatchedRefs.add(ref);
      if (noMatchExamples.length < 10) {
        noMatchExamples.push(`  REF="${ql.reference}" SIZE="${ql.size}" COLOR="${ql.color}"`);
      }
      continue;
    }

    // Found candidates — now try to match size + color
    if (matchType === "variant_sku") exactSkuMatch++;
    else if (matchType === "product_sku") productSkuMatch++;
    else productNameMatch++;

    // Try to narrow by size+color from variant attributes
    let bestVariant: typeof variants[0] | null = null;

    for (const v of candidates) {
      const attrs = (v.attributes ?? {}) as Record<string, string>;
      const vSize = norm(attrs.talla ?? attrs.size ?? attrs.Talla ?? "");
      const vColor = norm(attrs.color ?? attrs.Color ?? "");

      if (vSize === size && vColor === color) {
        bestVariant = v;
        break;
      }
    }

    if (bestVariant) {
      exactWithSizeColor++;
    } else {
      exactRefOnly++;
      bestVariant = candidates[0]; // fallback to first
    }

    // Check inventory
    const avail = inventoryByVariant.get(bestVariant.id);
    if (avail !== undefined) {
      withInventory++;
      if (avail > 0) totalAvailable++;
      else totalOutOfStock++;
    } else {
      withoutInventory++;
    }

    if (matchExamples.length < 5) {
      const avail2 = inventoryByVariant.get(bestVariant.id);
      matchExamples.push(`  REF="${ql.reference}" → variant="${bestVariant.sku}" product="${bestVariant.product?.sku}" type=${matchType} inv=${avail2 ?? "none"}`);
    }
  }

  // ── Print results ──────────────────────────────────────────────────────────

  const total = quoteLines.length;
  const matched = exactSkuMatch + productSkuMatch + productNameMatch;
  const pct = (n: number) => total > 0 ? ((n / total) * 100).toFixed(1) : "0";

  console.log("=== MATCHING RESULTS ===\n");
  console.log(`Total lines:       ${total}`);
  console.log(`Matched:           ${matched} (${pct(matched)}%)`);
  console.log(`  - variant SKU:   ${exactSkuMatch} (${pct(exactSkuMatch)}%)`);
  console.log(`  - product SKU:   ${productSkuMatch} (${pct(productSkuMatch)}%)`);
  console.log(`  - product name:  ${productNameMatch} (${pct(productNameMatch)}%)`);
  console.log(`No match:          ${noMatch} (${pct(noMatch)}%)`);
  console.log();
  console.log(`Matched with size+color: ${exactWithSizeColor} (${pct(exactWithSizeColor)}%)`);
  console.log(`Matched ref only:        ${exactRefOnly} (${pct(exactRefOnly)}%)`);
  console.log();
  console.log(`With inventory data:  ${withInventory} (${pct(withInventory)}%)`);
  console.log(`Without inventory:    ${withoutInventory} (${pct(withoutInventory)}%)`);
  console.log(`Available (qty > 0):  ${totalAvailable}`);
  console.log(`Out of stock:         ${totalOutOfStock}`);

  console.log();
  console.log(`Unique references in orders: ${uniqueRefs.size}`);
  console.log(`Unmatched references:        ${unmatchedRefs.size}`);

  console.log("\n=== SAMPLE MATCHES ===");
  for (const ex of matchExamples) console.log(ex);

  console.log("\n=== SAMPLE NO-MATCHES ===");
  for (const ex of noMatchExamples) console.log(ex);

  // ── Analyze variant attribute patterns ─────────────────────────────────────

  console.log("\n=== VARIANT ATTRIBUTE PATTERNS ===");
  const attrKeys = new Map<string, number>();
  for (const v of variants.slice(0, 1000)) {
    const attrs = (v.attributes ?? {}) as Record<string, string>;
    for (const k of Object.keys(attrs)) {
      attrKeys.set(k, (attrKeys.get(k) ?? 0) + 1);
    }
  }
  for (const [k, count] of [...attrKeys.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${k}: ${count}`);
  }

  // Show sample variant attributes
  console.log("\n=== SAMPLE VARIANT ATTRIBUTES ===");
  for (const v of variants.slice(0, 5)) {
    console.log(`  SKU="${v.sku}" name="${v.name}" attrs=${JSON.stringify(v.attributes)}`);
  }

  // ── Analyze reference format ───────────────────────────────────────────────

  console.log("\n=== REFERENCE FORMAT ANALYSIS ===");
  const refSamples = [...uniqueRefs].slice(0, 20);
  for (const r of refSamples) {
    console.log(`  "${r}"`);
  }

  // ── Check variant name patterns for size/color ─────────────────────────────

  console.log("\n=== VARIANT NAME PATTERNS (sample) ===");
  for (const v of variants.slice(0, 10)) {
    console.log(`  name="${v.name}" sku="${v.sku}" product.sku="${v.product?.sku}" product.name="${v.product?.name}"`);
  }

  await prisma.$disconnect();
  pool.end();
}

async function getOrgId(slug: string): Promise<string | null> {
  const org = await prisma.organization.findUnique({ where: { slug }, select: { id: true } });
  return org?.id ?? null;
}

main().catch((e) => { console.error("ERR:", e.message); process.exit(1); });
