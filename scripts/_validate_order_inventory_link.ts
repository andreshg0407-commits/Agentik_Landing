// @ts-nocheck
/**
 * scripts/_validate_order_inventory_link.ts
 *
 * Phase 8: Validate enrichOrderLinesWithInventory against real Castillitos data.
 * Usage: npx tsx scripts/_validate_order_inventory_link.ts
 *
 * Sprint: COMERCIAL-PEDIDOS-LINE-INVENTORY-LINK-04
 */

import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) } as any);

import {
  normalizeReference,
  normalizeSize,
  normalizeColor,
  buildVariantCompositeKey,
} from "../lib/comercial/pedidos/inventory-link-normalizer";

async function main() {
  console.log("=== COMERCIAL-PEDIDOS-LINE-INVENTORY-LINK-04 — Phase 8 Validation ===\n");

  const org = await prisma.organization.findUnique({ where: { slug: "castillitos" }, select: { id: true } });
  if (!org) { console.error("Org not found"); return; }
  const orgId = org.id;

  // Load 50 pedidos with lines
  const quotes = await prisma.cRMQuote.findMany({
    where: { organizationId: orgId, quoteLines: { some: {} } },
    include: { quoteLines: true },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  console.log(`Pedidos loaded: ${quotes.length}`);

  let totalLines = 0;
  let matchedLines = 0;
  let unknownLines = 0;
  let availableLines = 0;
  let partialLines = 0;
  let outOfStockLines = 0;

  let exactMatches = 0;
  let refOnlyMatches = 0;
  let notFoundMatches = 0;

  const sampleResults: string[] = [];

  for (const q of quotes) {
    const lines = q.quoteLines;
    totalLines += lines.length;

    // Build composite keys and batch-resolve
    const compositeKeys = lines.map((ql) =>
      buildVariantCompositeKey(ql.reference, ql.size, ql.color)
    );
    const uniqueKeys = [...new Set(compositeKeys)];

    const matchedVariants = await prisma.productVariant.findMany({
      where: { organizationId: orgId, sku: { in: uniqueKeys } },
      select: { id: true, productId: true, sku: true },
    });

    const variantBySku = new Map();
    for (const v of matchedVariants) {
      if (v.sku) variantBySku.set(v.sku.toUpperCase(), v);
    }

    // Get inventory for matched variants
    const matchedIds = matchedVariants.map((v) => v.id);
    const inventoryLevels = matchedIds.length > 0
      ? await prisma.productInventoryLevel.findMany({
          where: { variantId: { in: matchedIds } },
          select: { variantId: true, warehouseId: true, quantity: true },
        })
      : [];

    const inventoryByVariant = new Map();
    for (const il of inventoryLevels) {
      if (!il.variantId) continue;
      const entry = inventoryByVariant.get(il.variantId) ?? { total: 0, warehouses: 0 };
      if (il.quantity > 0) {
        entry.total += il.quantity;
        entry.warehouses += 1;
      }
      inventoryByVariant.set(il.variantId, entry);
    }

    for (let i = 0; i < lines.length; i++) {
      const ql = lines[i];
      const key = compositeKeys[i];
      const variant = variantBySku.get(key);
      const qty = Number(ql.qty) || 0;

      if (!variant) {
        unknownLines++;
        notFoundMatches++;
        if (sampleResults.length < 5) {
          sampleResults.push(`  NOT_FOUND: ref="${ql.reference}" size="${ql.size}" color="${ql.color}" key="${key}"`);
        }
        continue;
      }

      matchedLines++;
      exactMatches++;

      const inv = inventoryByVariant.get(variant.id);
      const avail = inv?.total ?? 0;
      const wh = inv?.warehouses ?? 0;

      if (avail <= 0) {
        outOfStockLines++;
      } else if (avail < qty) {
        partialLines++;
      } else {
        availableLines++;
      }

      if (sampleResults.length < 15 && sampleResults.length >= 5) {
        sampleResults.push(`  MATCH: ref="${ql.reference}" size="${ql.size}" color="${ql.color}" → avail=${avail} wh=${wh} qty=${qty} status=${avail <= 0 ? "OUT" : avail < qty ? "PARTIAL" : "OK"}`);
      }
    }

    // Sample first few pedidos in detail
    if (sampleResults.length < 5) {
      sampleResults.push(`  PEDIDO: ${q.sagOrderId || q.id} lines=${lines.length} matched=${lines.length - (lines.length - matchedLines > 0 ? 1 : 0)}`);
    }
  }

  // Results
  const pct = (n: number) => totalLines > 0 ? ((n / totalLines) * 100).toFixed(1) : "0";

  console.log(`\n=== RESULTS (${quotes.length} pedidos, ${totalLines} lines) ===\n`);
  console.log(`Total lines:     ${totalLines}`);
  console.log(`Matched:         ${matchedLines} (${pct(matchedLines)}%)`);
  console.log(`  - exact:       ${exactMatches}`);
  console.log(`  - ref_only:    ${refOnlyMatches}`);
  console.log(`Not found:       ${notFoundMatches} (${pct(notFoundMatches)}%)`);
  console.log();
  console.log(`Available:       ${availableLines} (${pct(availableLines)}%)`);
  console.log(`Partial:         ${partialLines} (${pct(partialLines)}%)`);
  console.log(`Out of stock:    ${outOfStockLines} (${pct(outOfStockLines)}%)`);
  console.log(`Unknown:         ${unknownLines} (${pct(unknownLines)}%)`);
  console.log();

  console.log(`Match rate: ${pct(matchedLines)}%`);
  console.log(`Coverage target: >90% → ${Number(pct(matchedLines)) >= 90 ? "PASS" : "FAIL"}`);

  console.log("\n=== SAMPLES ===");
  for (const s of sampleResults) console.log(s);

  // Show top unmatched references
  const unmatchedRefs = new Set<string>();
  for (const q of quotes) {
    for (const ql of q.quoteLines) {
      const key = buildVariantCompositeKey(ql.reference, ql.size, ql.color);
      const variants = await prisma.productVariant.findFirst({
        where: { organizationId: orgId, sku: key },
        select: { id: true },
      });
      if (!variants) unmatchedRefs.add(ql.reference);
    }
  }

  if (unmatchedRefs.size > 0) {
    console.log(`\n=== UNMATCHED REFERENCES (${unmatchedRefs.size}) ===`);
    for (const r of [...unmatchedRefs].slice(0, 15)) {
      console.log(`  "${r}"`);
    }
  }

  await prisma.$disconnect();
  pool.end();
}

main().catch((e) => { console.error("ERR:", e.message); process.exit(1); });
