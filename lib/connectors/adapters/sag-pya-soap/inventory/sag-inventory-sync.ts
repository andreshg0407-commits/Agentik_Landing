/**
 * lib/connectors/adapters/sag-pya-soap/inventory/sag-inventory-sync.ts
 *
 * Sync service: SAG variant inventory → ProductVariant + ProductInventoryLevel.
 *
 * Optimized for bulk operations:
 *   - Pre-loads ALL existing variants and levels in 2 queries
 *   - Classifies create vs update before writing
 *   - Parallel upserts within batches
 *   - Skips unchanged records
 *
 * Sprint: SAG-INVENTORY-SYNC-01
 */

import { prisma } from "@/lib/prisma";
import type { PyaApiConfig } from "@/lib/connectors/pya/types";
import { syncSagMasterLookups } from "../catalog/sag-master-lookups-sync";
import { syncSagVariants } from "../catalog/sag-variants-sync";
import { normalizeForUpsert } from "./sag-inventory-normalizer";
import type { VariantUpsertPayload } from "./sag-inventory-normalizer";
import type { InventorySyncResult } from "@/lib/comercial/inventory/inventory-types";

const PARALLEL_BATCH = 25;

// ── Main sync ───────────────────────────────────────────────────────────────

export async function syncSagInventory(
  orgId: string,
  config: PyaApiConfig,
  options: { dryRun?: boolean } = {},
): Promise<InventorySyncResult> {
  const t0 = Date.now();
  const { dryRun = false } = options;

  try {
    // 1. Fetch master lookups
    console.log("[SAG-INVENTORY] Loading master lookups...");
    const { maps } = await syncSagMasterLookups(config);

    // 2. Fetch variant inventory from SAG
    console.log("[SAG-INVENTORY] Fetching variant inventory from SAG...");
    const sagResult = await syncSagVariants(config, maps);
    console.log(`[SAG-INVENTORY] SAG returned ${sagResult.totalRows} rows, ${sagResult.distinctVariants} variants, ${sagResult.distinctProducts} products`);

    if (sagResult.variants.length === 0) {
      return buildResult("empty", t0, dryRun);
    }

    // 3. Normalize into upsert payloads
    const { variants, distinctProducts, distinctWarehouses } = normalizeForUpsert(sagResult.variants);
    console.log(`[SAG-INVENTORY] Normalized: ${variants.length} variants across ${distinctProducts} products, ${distinctWarehouses} warehouses`);

    if (dryRun) {
      return {
        ...buildResult("dry_run", t0, true),
        productsProcessed: distinctProducts,
        variantsCreated: variants.length,
        warehousesSynced: distinctWarehouses,
      };
    }

    // 4. Pre-load all lookups in parallel (3 queries total)
    console.log("[SAG-INVENTORY] Pre-loading existing records...");
    const [productLookup, existingVariants, existingLevels] = await Promise.all([
      buildProductLookup(orgId),
      buildExistingVariantLookup(orgId),
      buildExistingLevelLookup(orgId),
    ]);
    console.log(`[SAG-INVENTORY] Loaded: ${productLookup.size} products, ${existingVariants.size} variants, ${existingLevels.size} levels`);

    // 5. Upsert variants + inventory levels
    console.log("[SAG-INVENTORY] Upserting variants and inventory levels...");
    const stats = await upsertAll(orgId, variants, productLookup, existingVariants, existingLevels);

    console.log(`[SAG-INVENTORY] Done: ${stats.variantsCreated} created, ${stats.variantsUpdated} updated, ${stats.levelsCreated} levels created, ${stats.levelsUpdated} updated, ${stats.errors} errors`);

    return {
      status: stats.errors > 0 ? "partial" : "success",
      productsProcessed: stats.productsProcessed,
      productsNotFound: stats.productsNotFound,
      variantsCreated: stats.variantsCreated,
      variantsUpdated: stats.variantsUpdated,
      levelsCreated: stats.levelsCreated,
      levelsUpdated: stats.levelsUpdated,
      levelsZeroed: stats.levelsZeroed,
      warehousesSynced: distinctWarehouses,
      errors: stats.errors,
      durationMs: Date.now() - t0,
      dryRun: false,
    };
  } catch (e) {
    return {
      ...buildResult("error", t0, dryRun),
      error: (e as Error).message,
    };
  }
}

// ── Pre-load lookups ────────────────────────────────────────────────────────

async function buildProductLookup(orgId: string): Promise<Map<string, string>> {
  const products = await (prisma as any).productEntity.findMany({
    where: { organizationId: orgId, externalSource: "sag" },
    select: { id: true, externalId: true },
  });
  const map = new Map<string, string>();
  for (const p of products) {
    if (p.externalId) map.set(p.externalId.toUpperCase(), p.id);
  }
  return map;
}

async function buildExistingVariantLookup(orgId: string): Promise<Map<string, { id: string; name: string }>> {
  const variants = await (prisma as any).productVariant.findMany({
    where: { organizationId: orgId, externalSource: "sag" },
    select: { id: true, externalId: true, name: true },
  });
  const map = new Map<string, { id: string; name: string }>();
  for (const v of variants) {
    if (v.externalId) map.set(v.externalId, { id: v.id, name: v.name });
  }
  return map;
}

async function buildExistingLevelLookup(orgId: string): Promise<Map<string, { id: string; quantity: number }>> {
  const levels = await (prisma as any).productInventoryLevel.findMany({
    where: { organizationId: orgId, source: "sag" },
    select: { id: true, productId: true, variantId: true, warehouseId: true, quantity: true },
  });
  const map = new Map<string, { id: string; quantity: number }>();
  for (const l of levels) {
    const key = `${l.variantId}|${l.warehouseId}`;
    map.set(key, { id: l.id, quantity: l.quantity });
  }
  return map;
}

// ── Bulk upsert ─────────────────────────────────────────────────────────────

interface UpsertStats {
  productsProcessed: number;
  productsNotFound:  number;
  variantsCreated:   number;
  variantsUpdated:   number;
  levelsCreated:     number;
  levelsUpdated:     number;
  levelsZeroed:      number;
  errors:            number;
}

async function upsertAll(
  orgId: string,
  variants: VariantUpsertPayload[],
  productLookup: Map<string, string>,
  existingVariants: Map<string, { id: string; name: string }>,
  existingLevels: Map<string, { id: string; quantity: number }>,
): Promise<UpsertStats> {
  const stats: UpsertStats = {
    productsProcessed: 0, productsNotFound: 0,
    variantsCreated: 0, variantsUpdated: 0,
    levelsCreated: 0, levelsUpdated: 0, levelsZeroed: 0,
    errors: 0,
  };

  const processedProducts = new Set<string>();
  const now = new Date();

  // Process in parallel batches
  for (let i = 0; i < variants.length; i += PARALLEL_BATCH) {
    const batch = variants.slice(i, i + PARALLEL_BATCH);
    const promises = batch.map(v => processOneVariant(orgId, v, productLookup, existingVariants, existingLevels, processedProducts, now, stats));
    await Promise.all(promises);

    if (i > 0 && i % 5000 === 0) {
      console.log(`[SAG-INVENTORY] Progress: ${i}/${variants.length} (${stats.variantsCreated} created, ${stats.levelsCreated} levels)`);
    }
  }

  return stats;
}

async function processOneVariant(
  orgId: string,
  variant: VariantUpsertPayload,
  productLookup: Map<string, string>,
  existingVariants: Map<string, { id: string; name: string }>,
  existingLevels: Map<string, { id: string; quantity: number }>,
  processedProducts: Set<string>,
  now: Date,
  stats: UpsertStats,
): Promise<void> {
  try {
    // Find parent product
    const productId = productLookup.get(variant.productCode.toUpperCase());
    if (!productId) {
      if (!processedProducts.has(variant.productCode)) {
        stats.productsNotFound++;
        processedProducts.add(variant.productCode);
      }
      return;
    }

    if (!processedProducts.has(variant.productCode)) {
      stats.productsProcessed++;
      processedProducts.add(variant.productCode);
    }

    // Upsert ProductVariant
    let variantId: string;
    const existing = existingVariants.get(variant.variantKey);

    if (existing) {
      variantId = existing.id;
      if (existing.name !== variant.variantName) {
        await (prisma as any).productVariant.update({
          where: { id: existing.id },
          data: {
            name: variant.variantName,
            attributes: {
              talla: variant.sizeCode,
              tallaName: variant.sizeName,
              color: variant.colorCode,
              colorName: variant.colorName,
            },
          },
        });
      }
      stats.variantsUpdated++;
    } else {
      const created = await (prisma as any).productVariant.create({
        data: {
          organizationId: orgId,
          productId,
          name: variant.variantName,
          sku: variant.variantKey,
          status: "active",
          externalSource: "sag",
          externalId: variant.variantKey,
          attributes: {
            talla: variant.sizeCode,
            tallaName: variant.sizeName,
            color: variant.colorCode,
            colorName: variant.colorName,
          },
        },
      });
      variantId = created.id;
      stats.variantsCreated++;
      // Cache for re-sync scenarios
      existingVariants.set(variant.variantKey, { id: created.id, name: variant.variantName });
    }

    // Upsert inventory levels per warehouse
    for (const level of variant.levels) {
      const levelKey = `${variantId}|${level.warehouseId}`;
      const existingLevel = existingLevels.get(levelKey);

      if (existingLevel) {
        if (existingLevel.quantity !== level.quantity) {
          await (prisma as any).productInventoryLevel.update({
            where: { id: existingLevel.id },
            data: { quantity: level.quantity, reservedQty: level.reserved, syncedAt: now },
          });
          if (level.quantity === 0) stats.levelsZeroed++;
          else stats.levelsUpdated++;
        }
      } else {
        await (prisma as any).productInventoryLevel.create({
          data: {
            organizationId: orgId,
            productId,
            variantId,
            warehouseId: level.warehouseId,
            quantity: level.quantity,
            reservedQty: level.reserved,
            source: "sag",
            externalRef: level.warehouseCode,
            syncedAt: now,
          },
        });
        stats.levelsCreated++;
      }
    }
  } catch (e) {
    console.error(`[SAG-INVENTORY] Error: ${variant.variantKey}: ${(e as Error).message.slice(0, 120)}`);
    stats.errors++;
  }
}

// ── Helper ──────────────────────────────────────────────────────────────────

function buildResult(status: InventorySyncResult["status"], t0: number, dryRun: boolean): InventorySyncResult {
  return {
    status, productsProcessed: 0, productsNotFound: 0,
    variantsCreated: 0, variantsUpdated: 0,
    levelsCreated: 0, levelsUpdated: 0, levelsZeroed: 0,
    warehousesSynced: 0, errors: 0,
    durationMs: Date.now() - t0, dryRun,
  };
}
