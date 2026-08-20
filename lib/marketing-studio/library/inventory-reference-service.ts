/**
 * lib/marketing-studio/library/inventory-reference-service.ts
 *
 * MARKETING-LIBRARY-INVENTORY-TRUTH-02A — Inventory Reference Service
 *
 * Server-only. Loads and merges SAG inventory data with product/asset records
 * to build the Biblioteca Viva display model.
 *
 * Data sources (certified, no new SAG queries):
 *   1. CommercialCoverageSnapshot (CCS) — CS + LT textile references
 *      → via loadLatestCCSBatch() [lib/commercial-intelligence/ccs-reader.ts]
 *   2. ProductEntity (productLine="5") + ProductInventoryLevel — IM references
 *      → excluded from CCS by COMERCIAL-INVENTARIO-IMPORT-PIPELINE-CANONICALIZATION-01
 *   3. ProductEntity + ProductAssetLink — asset linkage for all references
 *
 * Identity: organizationId + normalizedRefCode (uppercase, trimmed)
 */

import "server-only";

import { prisma } from "@/lib/prisma";
import { loadLatestCCSBatch } from "@/lib/commercial-intelligence/ccs-reader";
import {
  classifyWorld,
  WORLD_LABELS,
  emptyWorldCounts,
  validateWorldInvariant,
  type WorldCounts,
} from "./world-classification";
import type {
  InventoryReference,
  InventoryRefVisualState,
  ReconciliationReport,
  InventoryLoadResult,
} from "./inventory-reference-types";
import { SAG_LINE_FK_MAP } from "@/lib/comercial/line-map";

// ── Reference normalization ─────────────────────────────────────────────────────

function normalizeRefCode(raw: string): string {
  return raw.trim().toUpperCase();
}

// ── Visual state derivation ─────────────────────────────────────────────────────

function deriveVisualState(
  disponible: number,
  assetCount: number,
  hasHero: boolean,
  world: string,
): InventoryRefVisualState {
  if (world === "sin_clasificar") return "sin_clasificar";
  if (disponible <= 0)            return "inactive";
  if (hasHero)                    return "with_hero";
  if (assetCount > 0)             return "with_assets";
  return "no_assets";
}

// ── Main service function ───────────────────────────────────────────────────────

/**
 * Loads all inventory references for an organization, merging SAG inventory
 * data with product/asset records.
 *
 * Returns a unified list classified into Tres Mundos (Castillitos, Latin Kids,
 * Importación) plus unclassified references.
 */
export async function loadInventoryReferences(
  organizationId: string,
): Promise<InventoryLoadResult> {

  // ── Step 1: Load CCS batch (CS + LT) ────────────────────────────────────────

  const ccsBatch = await loadLatestCCSBatch(organizationId);
  const snapshotAt = ccsBatch.snapshotAt;

  // ── Step 2: Load IM products with inventory ──────────────────────────────────

  const importProducts = await prisma.productEntity.findMany({
    where: { organizationId, productLine: "5" },
    select: {
      id: true,
      sku: true,
      name: true,
      productLine: true,
      lineaSag: true,
      subgrupoSag: true,
      assetLinks: { select: { assetId: true, role: true } },
      inventoryLevels: {
        select: { quantity: true, reservedQty: true },
      },
    },
  });

  // ── Step 3: Load ALL product entities (for asset cross-reference) ────────────

  const allProducts = await prisma.productEntity.findMany({
    where: { organizationId },
    select: {
      id: true,
      sku: true,
      name: true,
      productLine: true,
      assetLinks: { select: { assetId: true, role: true } },
    },
  });

  // Build SKU → product map for cross-referencing CCS refs with ProductEntity
  const skuToProduct = new Map<string, {
    id: string;
    assetLinks: Array<{ assetId: string; role: string }>;
  }>();
  for (const p of allProducts) {
    if (p.sku) {
      skuToProduct.set(normalizeRefCode(p.sku), {
        id: p.id,
        assetLinks: p.assetLinks,
      });
    }
  }

  // ── Step 4: Batch-resolve asset URLs ─────────────────────────────────────────

  const allAssetIds = new Set<string>();
  for (const p of allProducts) {
    for (const link of p.assetLinks) allAssetIds.add(link.assetId);
  }

  const assetUrlMap = new Map<string, string | null>();
  if (allAssetIds.size > 0) {
    const assets = await prisma.generatedAsset.findMany({
      where: { id: { in: Array.from(allAssetIds) } },
      select: { id: true, assetUrl: true },
    });
    for (const a of assets) {
      assetUrlMap.set(a.id, a.assetUrl ?? null);
    }
  }

  // ── Step 5: Build unified reference list ─────────────────────────────────────

  const references: InventoryReference[] = [];
  const seenRefs = new Set<string>();
  const worldCounts = emptyWorldCounts();

  // 5a. CCS references (CS + LT)
  for (const row of ccsBatch.rows) {
    const refCode = normalizeRefCode(row.refCode);
    if (seenRefs.has(refCode)) continue;
    seenRefs.add(refCode);

    const world = classifyWorld(row.line);
    const product = skuToProduct.get(refCode);
    const assetLinks = product?.assetLinks ?? [];
    const heroLink = assetLinks.find(l => l.role === "hero");
    const heroUrl = heroLink ? (assetUrlMap.get(heroLink.assetId) ?? null) : null;
    const hasHero = heroUrl !== null;
    const primaryUrl = hasHero
      ? heroUrl
      : assetLinks.length > 0
        ? (assetUrlMap.get(assetLinks[0].assetId) ?? null)
        : null;

    references.push({
      refCode,
      description:      row.description,
      world,
      worldLabel:       WORLD_LABELS[world],
      sagLine:          row.line,
      subgrupoSag:      row.subgrupoSag ?? null,
      disponible:       row.disponible,
      pendingOrdersQty: row.pendingOrdersQty ?? 0,
      isAvailable:      row.disponible > 0,
      productId:        product?.id ?? null,
      assetCount:       assetLinks.length,
      hasHeroImage:     hasHero,
      primaryAssetUrl:  primaryUrl,
      visualState:      deriveVisualState(row.disponible, assetLinks.length, hasHero, world),
      source:           "ccs",
      snapshotAt,
    });

    worldCounts[world]++;
    worldCounts.total++;
  }

  // 5b. Import references (productLine="5", excluded from CCS)
  for (const imp of importProducts) {
    const refCode = normalizeRefCode(imp.sku ?? imp.id);
    if (seenRefs.has(refCode)) continue;
    seenRefs.add(refCode);

    const totalQty = imp.inventoryLevels.reduce((s, l) => s + l.quantity, 0);
    const totalReserved = imp.inventoryLevels.reduce((s, l) => s + l.reservedQty, 0);
    const disponible = Math.max(0, totalQty - totalReserved);

    const assetLinks = imp.assetLinks;
    const heroLink = assetLinks.find(l => l.role === "hero");
    const heroUrl = heroLink ? (assetUrlMap.get(heroLink.assetId) ?? null) : null;
    const hasHero = heroUrl !== null;
    const primaryUrl = hasHero
      ? heroUrl
      : assetLinks.length > 0
        ? (assetUrlMap.get(assetLinks[0].assetId) ?? null)
        : null;

    const world = classifyWorld(
      imp.lineaSag ?? null,
      imp.productLine,
    );

    references.push({
      refCode,
      description:      imp.name,
      world,
      worldLabel:       WORLD_LABELS[world],
      sagLine:          SAG_LINE_FK_MAP[imp.productLine ?? ""] ?? "OT",
      subgrupoSag:      imp.subgrupoSag ?? null,
      disponible,
      pendingOrdersQty: totalReserved,
      isAvailable:      disponible > 0,
      productId:        imp.id,
      assetCount:       assetLinks.length,
      hasHeroImage:     hasHero,
      primaryAssetUrl:  primaryUrl,
      visualState:      deriveVisualState(disponible, assetLinks.length, hasHero, world),
      source:           "pil",
      snapshotAt,
    });

    worldCounts[world]++;
    worldCounts.total++;
  }

  // ── Step 6: Build reconciliation report ──────────────────────────────────────

  const inventoryRefCodes = new Set(references.map(r => r.refCode));
  const bibliotecaRefCodes = new Set<string>();
  for (const p of allProducts) {
    if (p.sku) bibliotecaRefCodes.add(normalizeRefCode(p.sku));
  }

  let matches = 0;
  for (const ref of inventoryRefCodes) {
    if (bibliotecaRefCodes.has(ref)) matches++;
  }

  const reconciliation: ReconciliationReport = {
    totalBibliotecaRefs:   bibliotecaRefCodes.size,
    totalInventoryRefs:    inventoryRefCodes.size,
    matches,
    missingFromBiblioteca: inventoryRefCodes.size - matches,
    extraInBiblioteca:     bibliotecaRefCodes.size - matches,
    duplicates:            0, // deduplication handled by seenRefs above
    sinClasificar:         worldCounts.sin_clasificar,
  };

  // ── Validate invariant ───────────────────────────────────────────────────────

  if (!validateWorldInvariant(worldCounts)) {
    console.warn(
      "[inventory-reference-service] World invariant FAILED:",
      JSON.stringify(worldCounts),
    );
  }

  return {
    references,
    reconciliation,
    snapshotAt,
    hasSnapshot: ccsBatch.rows.length > 0 || importProducts.length > 0,
    worldCounts,
  };
}
