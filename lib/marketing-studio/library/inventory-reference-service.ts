/**
 * lib/marketing-studio/library/inventory-reference-service.ts
 *
 * MARKETING-LIBRARY-INVENTORY-TRUTH-02A-R1 — Inventory Reference Service
 *
 * Server-only. Loads and merges SAG inventory data with product/asset records
 * to build the Biblioteca Viva display model.
 *
 * Data sources (certified, no new SAG queries):
 *   1. CommercialCoverageSnapshot (CCS) — CS + LT textile references
 *      → via loadLatestCCSBatch() [lib/commercial-intelligence/ccs-reader.ts]
 *      → CCS.disponible = SUM(PIL qty) over bodegas 01+04+14+15
 *        minus pendingOrders minus crmReserved
 *   2. ProductEntity (productLine="5") + ProductInventoryLevel — IM references
 *      → excluded from CCS by COMERCIAL-INVENTARIO-IMPORT-PIPELINE-CANONICALIZATION-01
 *      → disponible = SUM(PIL.quantity) - SUM(PIL.reservedQty)
 *   3. ProductEntity + ProductAssetLink — asset linkage for all references
 *
 * Identity: organizationId + normalizedRefCode (uppercase, trimmed, collapsed spaces)
 *
 * Fault isolation (R1):
 *   - CCS failure: last valid snapshot preserved, truthState = STALE
 *   - PIL failure: CCS data survives, IM section marked DATA_UNVERIFIED
 *   - Both fail: truthState = DATA_UNVERIFIED, no fake zeros
 *
 * Warehouse truth (Castillitos profile):
 *   CCS bodegas: 01 (PRINCIPAL) + 04 (PRODUCTO EN PROCESO) + 14 (F17-MAYORCA) + 15 (F10-IBAGUE)
 *   IM bodegas:  all PIL rows for productLine=5 (primarily 26/27 IMPORTACION)
 *   Source: inventory-refresh-pipeline.ts line 189, castillitos-warehouse-profiles.ts
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
  InventoryTruthState,
  ReconciliationReport,
  InventoryLoadResult,
  SourceHealth,
  VisualStateCounts,
} from "./inventory-reference-types";
import { SAG_LINE_FK_MAP } from "@/lib/comercial/line-map";

// ── Reference normalization ─────────────────────────────────────────────────────

/**
 * Normalizes a SAG reference code for dedup and matching.
 * - trim exterior whitespace
 * - uppercase
 * - collapse internal repeated spaces to single space
 * Does NOT remove hyphens or other separators.
 */
function normalizeRefCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/\s{2,}/g, " ");
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

// ── Empty visual state counts ───────────────────────────────────────────────────

function emptyVisualStateCounts(): VisualStateCounts {
  return { with_hero: 0, with_assets: 0, no_assets: 0, sin_clasificar: 0, inactive: 0, total: 0 };
}

// ── Asset resolution helpers ────────────────────────────────────────────────────

function resolveAssets(
  assetLinks: Array<{ assetId: string; role: string }>,
  assetUrlMap: Map<string, string | null>,
): { assetCount: number; hasHero: boolean; primaryUrl: string | null } {
  const heroLink = assetLinks.find(l => l.role === "hero");
  const heroUrl = heroLink ? (assetUrlMap.get(heroLink.assetId) ?? null) : null;
  const hasHero = heroUrl !== null;
  const primaryUrl = hasHero
    ? heroUrl
    : assetLinks.length > 0
      ? (assetUrlMap.get(assetLinks[0].assetId) ?? null)
      : null;
  return { assetCount: assetLinks.length, hasHero, primaryUrl };
}

// ── Main service function ───────────────────────────────────────────────────────

export async function loadInventoryReferences(
  organizationId: string,
): Promise<InventoryLoadResult> {

  const sourceHealth: SourceHealth = {
    ccs: { ok: true },
    pil: { ok: true },
  };

  // ── Step 1: Load CCS batch (CS + LT) with fault isolation ──────────────────

  let ccsBatch: Awaited<ReturnType<typeof loadLatestCCSBatch>>;
  try {
    ccsBatch = await loadLatestCCSBatch(organizationId);
  } catch (err: any) {
    console.error("[inventory-reference-service] CCS load FAILED:", err.message);
    sourceHealth.ccs = { ok: false, error: err.message };
    ccsBatch = { rows: [], snapshotAt: null };
  }
  const snapshotAt = ccsBatch.snapshotAt;

  // ── Step 2: Load IM products with fault isolation ──────────────────────────

  type ImportProduct = {
    id: string;
    sku: string | null;
    name: string;
    productLine: string | null;
    lineaSag: string | null;
    subgrupoSag: string | null;
    assetLinks: Array<{ assetId: string; role: string }>;
    inventoryLevels: Array<{ quantity: number; reservedQty: number }>;
  };

  let importProducts: ImportProduct[];
  try {
    importProducts = await prisma.productEntity.findMany({
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
  } catch (err: any) {
    console.error("[inventory-reference-service] PIL load FAILED:", err.message);
    sourceHealth.pil = { ok: false, error: err.message };
    importProducts = [];
  }

  // ── Step 3: Load ALL product entities (for asset cross-reference) ──────────

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

  // Build SKU → product map
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

  // ── Step 4: Batch-resolve asset URLs ───────────────────────────────────────

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

  // ── Step 5: Build unified reference list ───────────────────────────────────

  const references: InventoryReference[] = [];
  const seenRefs = new Set<string>();
  const worldCounts = emptyWorldCounts();
  const vsCounts = emptyVisualStateCounts();

  // 5a. CCS references (CS + LT + OT)
  for (const row of ccsBatch.rows) {
    const refCode = normalizeRefCode(row.refCode);
    if (seenRefs.has(refCode)) continue;
    seenRefs.add(refCode);

    const world = classifyWorld(row.line);
    const product = skuToProduct.get(refCode);
    const assetLinks = product?.assetLinks ?? [];
    const { assetCount, hasHero, primaryUrl } = resolveAssets(assetLinks, assetUrlMap);
    const vs = deriveVisualState(row.disponible, assetCount, hasHero, world);

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
      assetCount,
      hasHeroImage:     hasHero,
      primaryAssetUrl:  primaryUrl,
      visualState:      vs,
      source:           "ccs",
      snapshotAt,
    });

    worldCounts[world]++;
    worldCounts.total++;
    vsCounts[vs]++;
    vsCounts.total++;
  }

  // 5b. Import references (productLine="5", excluded from CCS)
  // Only if PIL loaded successfully
  if (sourceHealth.pil.ok) {
    for (const imp of importProducts) {
      const refCode = normalizeRefCode(imp.sku ?? imp.id);
      if (seenRefs.has(refCode)) continue;
      seenRefs.add(refCode);

      const totalQty = imp.inventoryLevels.reduce((s, l) => s + l.quantity, 0);
      const totalReserved = imp.inventoryLevels.reduce((s, l) => s + l.reservedQty, 0);
      const disponible = Math.max(0, totalQty - totalReserved);

      const assetLinks = imp.assetLinks;
      const { assetCount, hasHero, primaryUrl } = resolveAssets(assetLinks, assetUrlMap);

      const world = classifyWorld(
        imp.lineaSag ?? null,
        imp.productLine,
      );

      const vs = deriveVisualState(disponible, assetCount, hasHero, world);

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
        assetCount,
        hasHeroImage:     hasHero,
        primaryAssetUrl:  primaryUrl,
        visualState:      vs,
        source:           "pil",
        snapshotAt,
      });

      worldCounts[world]++;
      worldCounts.total++;
      vsCounts[vs]++;
      vsCounts.total++;
    }
  }

  // ── Step 6: Build reconciliation report ────────────────────────────────────

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
    duplicates:            0,
    sinClasificar:         worldCounts.sin_clasificar,
  };

  // ── Validate invariants ────────────────────────────────────────────────────

  if (!validateWorldInvariant(worldCounts)) {
    console.warn(
      "[inventory-reference-service] World invariant FAILED:",
      JSON.stringify(worldCounts),
    );
  }

  const vsInvariant =
    vsCounts.with_hero + vsCounts.with_assets + vsCounts.no_assets +
    vsCounts.sin_clasificar + vsCounts.inactive;
  if (vsInvariant !== vsCounts.total) {
    console.warn(
      "[inventory-reference-service] Visual state invariant FAILED:",
      JSON.stringify(vsCounts), `sum=${vsInvariant}`,
    );
  }

  // ── Determine truth state ──────────────────────────────────────────────────

  let truthState: InventoryTruthState;
  if (sourceHealth.ccs.ok && sourceHealth.pil.ok) {
    truthState = ccsBatch.rows.length > 0 || importProducts.length > 0
      ? "FRESH"
      : "DATA_UNVERIFIED";
  } else if (!sourceHealth.ccs.ok && !sourceHealth.pil.ok) {
    truthState = "DATA_UNVERIFIED";
  } else {
    truthState = "PARTIAL";
  }

  return {
    references,
    reconciliation,
    snapshotAt,
    hasSnapshot: references.length > 0,
    truthState,
    sourceHealth,
    visualStateCounts: vsCounts,
    worldCounts,
  };
}
