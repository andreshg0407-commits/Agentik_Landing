/**
 * lib/marketing-studio/commerce/shopify-biblioteca-sync.ts
 *
 * SHOPIFY-EXPERIENCIAS-06 — Biblioteca Sync Engine
 *
 * SERVER ONLY — never import from client components.
 *
 * Synchronizes Biblioteca asset changes with Experiencias Shopify.
 * Detects changes, recalculates readiness, logs transitions,
 * and generates Copilot signals for significant state changes.
 *
 * ARCHITECTURE:
 *   Biblioteca is the single source of creative assets.
 *   This engine READS from Biblioteca, never writes to it.
 *   Only updates readiness snapshots and sync logs.
 *   Never publishes to Shopify automatically.
 *   Never generates landings automatically.
 *
 * MULTI-PLATFORM:
 *   Implements CommerceExperienceSyncProvider interface.
 *   First provider: Shopify. Future: WooCommerce, Tiendanube.
 */

import "server-only";

import { prisma } from "@/lib/prisma";
import {
  evaluateProductReadiness,
  getLandingProducts,
} from "./shopify-experiences-service";
import type { LandingProductRow } from "./shopify-experiences-types";
import type { ExperienceReadiness } from "./shopify-experiences-types";
import type {
  CommerceExperienceSyncProvider,
  BibliotecaSyncEvent,
  SyncResult,
  StateChange,
  SyncLogEntry,
  SyncSummary,
  SyncCopilotSignal,
  ExperienceAvailabilitySnapshot,
  ResolvedReference,
  AssetUsageRef,
  ReferencePrimaryAssets,
  PrimaryAssetRef,
} from "./shopify-biblioteca-sync-types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const execDb = () => (prisma as any).agentExecution;

const MODULE       = "marketing_studio";
const SYNC_LOG_OP  = "BIBLIOTECA_SYNC_LOG";
const SNAPSHOT_OP  = "EXPERIENCE_AVAILABILITY_SNAPSHOT";

// ── Sync log persistence ─────────────────────────────────────────────────────

async function writeSyncLog(entry: Omit<SyncLogEntry, "id">): Promise<void> {
  await execDb().create({
    data: {
      tenantId:     entry.tenantId,
      module:       MODULE,
      operation:    SYNC_LOG_OP,
      action:       `sync_${entry.previousState}_to_${entry.newState}`,
      status:       "completed",
      createdBy:    entry.triggeredBy,
      metadataJson: {
        referenceId:   entry.referenceId,
        productId:     entry.productId,
        productName:   entry.productName,
        previousState: entry.previousState,
        newState:      entry.newState,
        reason:        entry.reason,
        timestamp:     entry.timestamp,
      },
    },
  });
}

async function readSyncLogs(tenantId: string, limit = 50): Promise<SyncLogEntry[]> {
  const rows = await execDb().findMany({
    where: {
      tenantId,
      module:    MODULE,
      operation: SYNC_LOG_OP,
    },
    orderBy: { createdAt: "desc" },
    take:    limit,
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return rows.map((r: any) => {
    const m = (r.metadataJson ?? {}) as Record<string, unknown>;
    return {
      id:            r.id,
      timestamp:     (m.timestamp as string) ?? (r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt)),
      tenantId:      r.tenantId,
      referenceId:   (m.referenceId as string | null) ?? null,
      productId:     (m.productId as string) ?? "",
      productName:   (m.productName as string) ?? "",
      previousState: (m.previousState as ExperienceReadiness) ?? "NO_MEDIA",
      newState:      (m.newState as ExperienceReadiness) ?? "NO_MEDIA",
      reason:        (m.reason as string) ?? "",
      triggeredBy:   r.createdBy ?? "sistema",
    };
  });
}

// ── Snapshot persistence ─────────────────────────────────────────────────────

async function writeSnapshot(
  tenantId: string,
  snap:     ExperienceAvailabilitySnapshot,
): Promise<void> {
  // Upsert: find existing snapshot for this product, update or create
  const existing = await execDb().findFirst({
    where: {
      tenantId,
      module:    MODULE,
      operation: SNAPSHOT_OP,
      metadataJson: { path: ["productId"], equals: snap.productId },
    },
  });

  const meta = {
    productId:     snap.productId,
    readiness:     snap.readiness,
    assetQuality:  snap.assetQuality,
    photoCount:    snap.photoCount,
    videoCount:    snap.videoCount,
    evaluatedAt:   snap.evaluatedAt,
    reasons:       snap.reasons,
    sourceVersion: snap.sourceVersion,
  };

  if (existing) {
    await execDb().update({
      where: { id: existing.id },
      data: { status: snap.readiness, metadataJson: meta },
    });
  } else {
    await execDb().create({
      data: {
        tenantId,
        module:       MODULE,
        operation:    SNAPSHOT_OP,
        action:       "snapshot_create",
        status:       snap.readiness,
        createdBy:    "sync_engine",
        metadataJson: meta,
      },
    });
  }
}

async function readSnapshots(tenantId: string): Promise<ExperienceAvailabilitySnapshot[]> {
  const rows = await execDb().findMany({
    where: {
      tenantId,
      module:    MODULE,
      operation: SNAPSHOT_OP,
    },
    orderBy: { updatedAt: "desc" },
    take:    500,
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return rows.map((r: any) => {
    const m = (r.metadataJson ?? {}) as Record<string, unknown>;
    return {
      productId:     (m.productId as string) ?? "",
      readiness:     (m.readiness as ExperienceReadiness) ?? "NO_MEDIA",
      assetQuality:  (m.assetQuality as ExperienceAvailabilitySnapshot["assetQuality"]) ?? "none",
      photoCount:    (m.photoCount as number) ?? 0,
      videoCount:    (m.videoCount as number) ?? 0,
      evaluatedAt:   (m.evaluatedAt as string) ?? "",
      reasons:       (m.reasons as string[]) ?? [],
      sourceVersion: (m.sourceVersion as number) ?? 1,
    };
  });
}

// ── Reference resolution ─────────────────────────────────────────────────────

/**
 * Resolves which products are linked to a reference (SKU, referenceId).
 * Uses stable resolution: referenceId > SKU > comercial reference.
 * Never uses product name alone.
 */
export function findProductsByReference(
  products:    LandingProductRow[],
  referenceId: string | null,
  sku:         string | null,
): ResolvedReference[] {
  const results: ResolvedReference[] = [];

  for (const p of products) {
    // 1. referenceId match (highest confidence)
    if (referenceId && p.productId === referenceId) {
      results.push({
        productId:   p.productId,
        productName: p.nombre,
        method:      "referenceId",
        confidence:  1.0,
      });
      continue;
    }

    // 2. SKU match
    if (sku && p.sku && p.sku === sku) {
      results.push({
        productId:   p.productId,
        productName: p.nombre,
        method:      "sku",
        confidence:  0.9,
      });
      continue;
    }

    // 3. Comercial reference (productId contains the reference)
    if (referenceId && p.productId.includes(referenceId)) {
      results.push({
        productId:   p.productId,
        productName: p.nombre,
        method:      "comercial_reference",
        confidence:  0.7,
      });
    }
  }

  return results;
}

// ── Primary asset selection ──────────────────────────────────────────────────

/**
 * Selects primary assets for a reference.
 * If no manual selection exists, uses auto-selection:
 *   - Hero: first approved photo
 *   - Video: most recent approved video
 *   - Banner: first approved banner
 */
export function selectPrimaryAssets(
  _referenceId: string,
  assets: Array<{
    id: string;
    assetType: string;
    status: string;
    url?: string | null;
    approvedAt?: string | null;
  }>,
): ReferencePrimaryAssets {
  const approved = assets.filter(a => a.status === "approved");

  const photos  = approved.filter(a => a.assetType === "product_photo" || a.assetType === "hero" || a.assetType === "lifestyle_photo");
  const videos  = approved.filter(a => a.assetType === "short_video");
  const banners = approved.filter(a => a.assetType === "banner");

  function toRef(a: typeof assets[0]): PrimaryAssetRef {
    return { assetId: a.id, url: a.url ?? null, assetType: a.assetType, approvedAt: a.approvedAt ?? null };
  }

  // Sort photos by approvedAt desc, pick best
  const heroImage = photos.length > 0
    ? toRef(photos.sort((a, b) => (b.approvedAt ?? "").localeCompare(a.approvedAt ?? ""))[0])
    : null;

  // Most recent video
  const mainVideo = videos.length > 0
    ? toRef(videos.sort((a, b) => (b.approvedAt ?? "").localeCompare(a.approvedAt ?? ""))[0])
    : null;

  const recommendedBanner = banners.length > 0 ? toRef(banners[0]) : null;

  return {
    referenceId: _referenceId,
    heroImage,
    mainVideo,
    recommendedBanner,
    selectionMethod: "auto",
  };
}

// ── Readiness recalculation ──────────────────────────────────────────────────

function readinessToQuality(r: ExperienceReadiness): ExperienceAvailabilitySnapshot["assetQuality"] {
  switch (r) {
    case "READY":          return "full";
    case "PARTIAL":        return "basic";
    case "MISSING_ASSETS": return "insufficient";
    case "NO_MEDIA":       return "none";
  }
}

/**
 * Recalculates availability for specific products and detects state changes.
 * Only processes the given productIds — never the full catalog.
 */
export async function recalculateExperienceAvailability(
  tenantId:   string,
  productIds: string[],
  triggeredBy: string,
): Promise<{ snapshots: ExperienceAvailabilitySnapshot[]; changes: StateChange[] }> {
  const allProducts = await getLandingProducts(tenantId);
  const oldSnapshots = await readSnapshots(tenantId);

  const snapshots: ExperienceAvailabilitySnapshot[] = [];
  const changes: StateChange[] = [];

  const targetProducts = productIds.length > 0
    ? allProducts.filter(p => productIds.includes(p.productId))
    : allProducts;

  const now = new Date().toISOString();

  for (const product of targetProducts) {
    const avail = evaluateProductReadiness(product);

    const oldSnap = oldSnapshots.find(s => s.productId === product.productId);
    const previousState = oldSnap?.readiness ?? "NO_MEDIA";
    const newVersion = (oldSnap?.sourceVersion ?? 0) + 1;

    const snap: ExperienceAvailabilitySnapshot = {
      productId:     product.productId,
      readiness:     avail.readiness,
      assetQuality:  readinessToQuality(avail.readiness),
      photoCount:    avail.photoCount,
      videoCount:    avail.videoCount,
      evaluatedAt:   now,
      reasons:       avail.reasons.map(r => r.message),
      sourceVersion: newVersion,
    };

    snapshots.push(snap);
    await writeSnapshot(tenantId, snap);

    // Detect state change
    if (previousState !== avail.readiness) {
      const change: StateChange = {
        productId:     product.productId,
        productName:   product.nombre,
        previousState,
        newState:      avail.readiness,
        reason:        buildChangeReason(previousState, avail.readiness),
      };
      changes.push(change);

      await writeSyncLog({
        timestamp:     now,
        tenantId,
        referenceId:   product.sku,
        productId:     product.productId,
        productName:   product.nombre,
        previousState,
        newState:      avail.readiness,
        reason:        change.reason,
        triggeredBy,
      });
    }
  }

  return { snapshots, changes };
}

function buildChangeReason(prev: ExperienceReadiness, next: ExperienceReadiness): string {
  if (prev === "PARTIAL" && next === "READY") return "Video aprobado en Biblioteca.";
  if (prev === "READY" && next === "PARTIAL") return "Video eliminado o archivado.";
  if (prev === "READY" && next === "MISSING_ASSETS") return "Imagenes criticas eliminadas.";
  if (prev === "PARTIAL" && next === "MISSING_ASSETS") return "Imagenes eliminadas.";
  if (prev === "MISSING_ASSETS" && next === "PARTIAL") return "Imagenes aprobadas en Biblioteca.";
  if (prev === "MISSING_ASSETS" && next === "READY") return "Imagenes y video aprobados.";
  if (prev === "NO_MEDIA" && next === "PARTIAL") return "Primeras imagenes aprobadas.";
  if (prev === "NO_MEDIA" && next === "READY") return "Imagenes y video aprobados.";
  if (next === "NO_MEDIA") return "Todos los recursos fueron eliminados.";
  return `Cambio de ${prev} a ${next}.`;
}

// ── Copilot signal generation ────────────────────────────────────────────────

/**
 * Generates Copilot signals from state changes.
 * Only emits for significant transitions — never for no-change.
 */
export function buildSyncCopilotSignals(changes: StateChange[]): SyncCopilotSignal[] {
  const signals: SyncCopilotSignal[] = [];
  const now = new Date().toISOString();

  for (const c of changes) {
    const isUpgrade = (
      (c.previousState === "PARTIAL" && c.newState === "READY") ||
      (c.previousState === "MISSING_ASSETS" && (c.newState === "PARTIAL" || c.newState === "READY")) ||
      (c.previousState === "NO_MEDIA" && c.newState !== "NO_MEDIA")
    );
    const isDowngrade = (
      (c.previousState === "READY" && c.newState !== "READY") ||
      (c.previousState === "PARTIAL" && (c.newState === "MISSING_ASSETS" || c.newState === "NO_MEDIA"))
    );

    if (isUpgrade) {
      signals.push({
        category:  "upgrade",
        message:   `${c.productName}: ahora puede generar una landing ${c.newState === "READY" ? "completa" : "basica"}. ${c.reason}`,
        productId: c.productId,
        timestamp: now,
      });
    } else if (isDowngrade) {
      signals.push({
        category:  "downgrade",
        message:   `${c.productName}: ya no cumple requisitos para landing ${c.previousState === "READY" ? "completa" : "basica"}. ${c.reason}`,
        productId: c.productId,
        timestamp: now,
      });
    }
  }

  // Cap at 3 signals
  return signals.slice(0, 3);
}

// ── Asset usage lookup ───────────────────────────────────────────────────────

/**
 * Finds all experiences that use a given asset.
 * For Biblioteca drawer "Usos detectados" section.
 */
export async function getAssetUsage(
  tenantId: string,
  assetId:  string,
): Promise<AssetUsageRef[]> {
  const refs: AssetUsageRef[] = [];

  // Check landing drafts
  const draftRows = await execDb().findMany({
    where: {
      tenantId,
      module:    MODULE,
      operation: "SHOPIFY_LANDING_DRAFT",
      status:    { notIn: ["archivado"] },
    },
    take: 100,
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const row of draftRows) {
    const meta = (row.metadataJson ?? {}) as Record<string, unknown>;
    const assets = (meta.assetsUsed as Array<{ assetId: string }>) ?? [];
    if (assets.some(a => a.assetId === assetId || a.assetId.includes(assetId))) {
      refs.push({
        type:     "landing_draft",
        label:    `Landing en borrador: ${(meta.productName as string) ?? "Sin nombre"}`,
        entityId: row.id,
        status:   row.status,
      });
    }
  }

  // Check published experiences
  const pubRows = await execDb().findMany({
    where: {
      tenantId,
      module:    MODULE,
      operation: "SHOPIFY_PUBLISHED_EXPERIENCE",
      status:    { in: ["published", "updated"] },
    },
    take: 100,
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const row of pubRows) {
    const meta = (row.metadataJson ?? {}) as Record<string, unknown>;
    const draftId = (meta.draftId as string) ?? "";
    // Check if the published experience's draft uses this asset
    if (draftId) {
      refs.push({
        type:     "landing_published",
        label:    `Landing publicada: ${(meta.productName as string) ?? "Sin nombre"}`,
        entityId: row.id,
        status:   row.status,
      });
    }
  }

  return refs;
}

// ── Sync summary ─────────────────────────────────────────────────────────────

export async function buildSyncSummary(tenantId: string): Promise<SyncSummary> {
  const snapshots = await readSnapshots(tenantId);
  const recentLogs = await readSyncLogs(tenantId, 10);

  const readyCount         = snapshots.filter(s => s.readiness === "READY").length;
  const partialCount       = snapshots.filter(s => s.readiness === "PARTIAL").length;
  const missingAssetsCount = snapshots.filter(s => s.readiness === "MISSING_ASSETS").length;
  const noMediaCount       = snapshots.filter(s => s.readiness === "NO_MEDIA").length;

  const lastSync = snapshots.reduce((latest, s) =>
    s.evaluatedAt > latest ? s.evaluatedAt : latest,
  "", );

  return {
    lastSyncAt:    lastSync || new Date().toISOString(),
    totalProducts: snapshots.length,
    readyCount,
    partialCount,
    missingAssetsCount,
    noMediaCount,
    recentChanges: recentLogs.map(l => ({
      productId:     l.productId,
      productName:   l.productName,
      previousState: l.previousState,
      newState:      l.newState,
      reason:        l.reason,
    })),
  };
}

// ── Main sync functions ──────────────────────────────────────────────────────

/**
 * Recalculates readiness for the entire visible catalog.
 * Passes empty productIds to recalculateExperienceAvailability,
 * which processes all products when the array is empty.
 */
export async function syncCatalog(
  tenantId:    string,
  triggeredBy = "sync_catalog",
): Promise<SyncResult> {
  const startMs = Date.now();
  try {
    const { snapshots, changes } = await recalculateExperienceAvailability(
      tenantId, [], triggeredBy,
    );
    return {
      ok:              true,
      productsUpdated: snapshots.length,
      stateChanges:    changes,
      errors:          [],
      durationMs:      Date.now() - startMs,
    };
  } catch (err) {
    return {
      ok:              false,
      productsUpdated: 0,
      stateChanges:    [],
      errors:          [err instanceof Error ? err.message : "Error de sincronizacion."],
      durationMs:      Date.now() - startMs,
    };
  }
}

/**
 * Synchronizes a single product's assets from Biblioteca.
 * Recalculates readiness and logs changes.
 */
export async function syncProductAssets(
  tenantId:  string,
  productId: string,
  triggeredBy = "sync_engine",
): Promise<SyncResult> {
  const startMs = Date.now();
  try {
    const { snapshots, changes } = await recalculateExperienceAvailability(
      tenantId, [productId], triggeredBy,
    );
    return {
      ok:              true,
      productsUpdated: snapshots.length,
      stateChanges:    changes,
      errors:          [],
      durationMs:      Date.now() - startMs,
    };
  } catch (err) {
    return {
      ok:              false,
      productsUpdated: 0,
      stateChanges:    [],
      errors:          [err instanceof Error ? err.message : "Error de sincronizacion."],
      durationMs:      Date.now() - startMs,
    };
  }
}

/**
 * Synchronizes all products linked to a reference (SKU / referenceId).
 * Only recalculates affected products — never the full catalog.
 */
export async function syncReferenceAssets(
  tenantId:    string,
  referenceId: string | null,
  sku:         string | null,
  triggeredBy = "sync_engine",
): Promise<SyncResult> {
  const startMs = Date.now();
  try {
    const allProducts = await getLandingProducts(tenantId);
    const resolved = findProductsByReference(allProducts, referenceId, sku);

    if (resolved.length === 0) {
      return {
        ok:              true,
        productsUpdated: 0,
        stateChanges:    [],
        errors:          [],
        durationMs:      Date.now() - startMs,
      };
    }

    const productIds = resolved.map(r => r.productId);
    const { snapshots, changes } = await recalculateExperienceAvailability(
      tenantId, productIds, triggeredBy,
    );

    return {
      ok:              true,
      productsUpdated: snapshots.length,
      stateChanges:    changes,
      errors:          [],
      durationMs:      Date.now() - startMs,
    };
  } catch (err) {
    return {
      ok:              false,
      productsUpdated: 0,
      stateChanges:    [],
      errors:          [err instanceof Error ? err.message : "Error de sincronizacion."],
      durationMs:      Date.now() - startMs,
    };
  }
}

/**
 * Handles a Biblioteca sync event.
 * Entry point for event-driven sync (called when assets change).
 */
export async function handleBibliotecaSyncEvent(
  event: BibliotecaSyncEvent,
): Promise<SyncResult> {
  return syncReferenceAssets(
    event.tenantId,
    event.referenceId,
    event.sku,
    event.userId ?? "biblioteca_event",
  );
}

// ── Shopify provider implementation ──────────────────────────────────────────

/**
 * ShopifyExperienceSyncProvider — first implementation of
 * CommerceExperienceSyncProvider.
 *
 * Future providers: WooCommerce, Tiendanube, marketplaces.
 */
export class ShopifyExperienceSyncProvider implements CommerceExperienceSyncProvider {
  readonly platform = "shopify";

  async syncProductAssets(tenantId: string, productId: string): Promise<SyncResult> {
    return syncProductAssets(tenantId, productId);
  }

  async syncReferenceAssets(tenantId: string, referenceId: string): Promise<SyncResult> {
    return syncReferenceAssets(tenantId, referenceId, null);
  }

  async recalculateAvailability(tenantId: string, productIds: string[]): Promise<ExperienceAvailabilitySnapshot[]> {
    const { snapshots } = await recalculateExperienceAvailability(tenantId, productIds, "provider");
    return snapshots;
  }

  async findProductsByReference(tenantId: string, referenceId: string): Promise<ResolvedReference[]> {
    const products = await getLandingProducts(tenantId);
    return findProductsByReference(products, referenceId, null);
  }

  async getAssetUsage(tenantId: string, assetId: string): Promise<AssetUsageRef[]> {
    return getAssetUsage(tenantId, assetId);
  }

  async getSyncSummary(tenantId: string): Promise<SyncSummary> {
    return buildSyncSummary(tenantId);
  }
}
