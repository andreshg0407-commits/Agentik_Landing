/**
 * inventory-control-service.ts
 *
 * INVENTORY-CONTROL-CENTER-01 — Server-side orchestration service.
 *
 * The Inventory Control Center is the official owner of commercial inventory.
 * Inventario Comercial = Bodega 01+04+14+15 (textile) + B26+B27 (importacion).
 *
 * This service:
 * - Loads availability data via report-loader (Prisma)
 * - Builds the availability report via availability-engine (pure domain)
 * - Resolves tenant thresholds via tenant-rule-resolver (pure domain)
 * - Queries ProductionOrder for active OP counts per reference
 * - Enriches AvailabilityRow[] into InventoryItem[] with operational states
 * - Builds line/subgrupo summaries, health, data quality
 * - Returns a complete InventoryControlSnapshot
 *
 * server-only — uses Prisma directly.
 */

import "server-only";

import { prisma } from "@/lib/prisma";
import { loadAvailabilityRecords } from "@/lib/commercial-intelligence/report-loader";
import { buildAvailabilityReport } from "@/lib/commercial-intelligence/availability-engine";
import { resolveInventoryThresholds } from "@/lib/tenant-rules/tenant-rule-resolver";
import type { AvailabilityRow } from "@/lib/commercial-intelligence/availability-types";
import {
  deriveInventoryVisibility,
  resolveCanonicalLine,
} from "./inventory-control-types";
import type {
  CanonicalLine,
  InventoryItem,
  InventoryOperationalState,
  InventoryLineSummary,
  InventorySubGrupoSummary,
  InventoryHealth,
  InventoryDataQuality,
  InventoryControlSnapshot,
  SubgrupoCoverage,
  SubgrupoCoverageState,
  AccesorioBajaCantidad,
  AccesorioStockState,
} from "./inventory-control-types";
import {
  IMPORT_SOURCE_WAREHOUSES,
  IMPORT_SCARCITY_MINIMUM,
} from "@/lib/comercial/maletas/vendor-sample-types";

// ── Operational State Derivation (INVENTARIO-KPI-REALIGNMENT-01) ─────────────

/**
 * Textile state: disponible | bajo | sin_cobertura | alta_disponibilidad
 */
function deriveTextileState(
  disponibleReal: number,
  threshold: number | null,
): InventoryOperationalState {
  if (threshold === null) return "pendiente_validar";
  if (disponibleReal <= 0) return "sin_cobertura";
  if (disponibleReal <= threshold) return "bajo";
  if (disponibleReal > threshold * 3) return "alta_disponibilidad";
  return "disponible";
}

/**
 * Accessory state: disponible (>=threshold) | bajo (0 < x < threshold) | agotado (= 0)
 *
 * Sprint: INVENTARIO-ACCESSORY-LOW-STOCK-AND-KPI-LAYOUT-01
 */
function deriveAccessoryState(
  disponibleReal: number,
  threshold: number,
): InventoryOperationalState {
  if (disponibleReal <= 0) return "agotado";
  if (disponibleReal < threshold) return "bajo";
  return "disponible";
}

function deriveOperationalState(
  disponibleReal: number,
  threshold: number | null,
  _hasActiveProduction: boolean,
  isAccessory: boolean = false,
): InventoryOperationalState {
  if (isAccessory) return deriveAccessoryState(disponibleReal, threshold ?? IMPORT_SCARCITY_MINIMUM);
  return deriveTextileState(disponibleReal, threshold);
}

// ── Production Query ─────────────────────────────────────────────────────────

async function loadActiveProductionCounts(
  organizationId: string,
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();

  try {
    const opLines = await (prisma as any).productionOrderLine.findMany({
      where: {
        productionOrder: {
          organizationId,
          status: "OPEN",
        },
      },
      select: {
        referenceCode: true,
      },
    });

    for (const line of opLines) {
      const ref = (line.referenceCode ?? "").toUpperCase().trim();
      if (ref) {
        counts.set(ref, (counts.get(ref) ?? 0) + 1);
      }
    }
  } catch {
    // ProductionOrderLine table may not exist — graceful degradation
  }

  return counts;
}

// ── Data Quality ─────────────────────────────────────────────────────────────

/**
 * Query the freshest date across both inventory sources:
 *   - CommercialCoverageSnapshot.snapshotAt (textile)
 *   - ProductInventoryLevel.syncedAt (accessories + all warehouses)
 *
 * Returns the most recent of the two so the banner reflects true freshness.
 *
 * Sprint: INVENTARIO-SYNC-FRESHNESS-01
 */
async function resolveFreshestSnapshotAt(
  organizationId: string,
  ccsSnapshotAt: string | null,
): Promise<string | null> {
  try {
    const pilMax = await (prisma as any).$queryRaw`
      SELECT MAX("syncedAt") AS max_synced
      FROM "ProductInventoryLevel"
      WHERE "organizationId" = ${organizationId}
    ` as any[];
    const pilDate = pilMax[0]?.max_synced
      ? new Date(pilMax[0].max_synced).toISOString()
      : null;

    if (!ccsSnapshotAt && !pilDate) return null;
    if (!ccsSnapshotAt) return pilDate;
    if (!pilDate) return ccsSnapshotAt;

    return new Date(ccsSnapshotAt) > new Date(pilDate) ? ccsSnapshotAt : pilDate;
  } catch {
    return ccsSnapshotAt;
  }
}

function computeDataQuality(
  snapshotAt: string | null,
  recordCount: number,
): InventoryDataQuality {
  if (!snapshotAt) {
    return {
      snapshotAt: null,
      daysSinceSnapshot: null,
      freshnessLabel: "SIN_DATOS",
      confidence: 0,
      confidenceReason: "Sin datos SAG disponibles",
      warnings: ["No se ha sincronizado inventario desde SAG"],
      sources: [],
    };
  }

  const now = new Date();
  const snap = new Date(snapshotAt);
  const diffMs = now.getTime() - snap.getTime();
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  const freshnessLabel: InventoryDataQuality["freshnessLabel"] =
    days === 0 ? "HOY" : days <= 3 ? "RECIENTE" : "DESACTUALIZADO";

  const confidence = days <= 1 ? 90 : days <= 3 ? 80 : days <= 7 ? 65 : 40;

  const warnings: string[] = [];
  if (days > 3) warnings.push(`Datos de hace ${days} dias — considerar re-sync`);
  if (recordCount === 0) warnings.push("Snapshot vacio — 0 registros");

  return {
    snapshotAt,
    daysSinceSnapshot: days,
    freshnessLabel,
    confidence,
    confidenceReason: `${recordCount} registros, ${days}d desde ultimo sync`,
    warnings,
    sources: ["CommercialCoverageSnapshot (B01+B04+B14+B15)", "ProductInventoryLevel (B26+B27)"],
  };
}

// ── Summaries ────────────────────────────────────────────────────────────────

function buildLineSummaries(items: InventoryItem[]): InventoryLineSummary[] {
  const map = new Map<string, InventoryItem[]>();
  for (const item of items) {
    const list = map.get(item.subLinea) ?? [];
    list.push(item);
    map.set(item.subLinea, list);
  }

  const summaries: InventoryLineSummary[] = [];
  for (const [subLinea, lineItems] of map) {
    const threshold = lineItems[0]?.threshold ?? null;
    summaries.push({
      subLinea,
      totalReferences: lineItems.length,
      disponibles: lineItems.filter(i => i.operationalState === "disponible").length,
      criticos: lineItems.filter(i => i.operationalState === "critico").length,
      agotados: lineItems.filter(i => i.disponibleReal <= 0).length,
      conProduccion: lineItems.filter(i => i.operationalState === "con_produccion").length,
      sinProduccion: lineItems.filter(i => i.operationalState === "sin_produccion").length,
      totalExistencia: lineItems.reduce((s, i) => s + i.existenciaBodega01, 0),
      totalDisponibleReal: lineItems.reduce((s, i) => s + i.disponibleReal, 0),
      threshold,
    });
  }

  return summaries.sort((a, b) => a.subLinea.localeCompare(b.subLinea));
}

function buildSubGrupoSummaries(items: InventoryItem[]): InventorySubGrupoSummary[] {
  const key = (i: InventoryItem) => `${i.subLinea}::${i.subGrupo}`;
  const map = new Map<string, InventoryItem[]>();
  for (const item of items) {
    const k = key(item);
    const list = map.get(k) ?? [];
    list.push(item);
    map.set(k, list);
  }

  const summaries: InventorySubGrupoSummary[] = [];
  for (const [, sgItems] of map) {
    summaries.push({
      subGrupo: sgItems[0].subGrupo,
      subLinea: sgItems[0].subLinea,
      totalReferences: sgItems.length,
      disponibles: sgItems.filter(i => i.operationalState === "disponible").length,
      criticos: sgItems.filter(i => i.operationalState === "critico").length,
      agotados: sgItems.filter(i => i.disponibleReal <= 0).length,
      totalExistencia: sgItems.reduce((s, i) => s + i.existenciaBodega01, 0),
      totalDisponibleReal: sgItems.reduce((s, i) => s + i.disponibleReal, 0),
    });
  }

  return summaries.sort((a, b) => {
    const sl = a.subLinea.localeCompare(b.subLinea);
    return sl !== 0 ? sl : a.subGrupo.localeCompare(b.subGrupo);
  });
}

function buildHealth(
  items: InventoryItem[],
  subgrupoCoverage: SubgrupoCoverage[],
  accesoriosBaja: AccesorioBajaCantidad[],
): InventoryHealth {
  const totalReferences = items.length;
  const disponibles = items.filter(i =>
    i.operationalState === "disponible" || i.operationalState === "alta_disponibilidad"
  ).length;

  const textile = items.filter(i => i.lineCategory === "textile");
  const accessories = items.filter(i => i.lineCategory === "accessory");

  const ltItems = textile.filter(i => i.subLinea === "LATIN KIDS");
  const csItems = textile.filter(i => i.subLinea === "CASTILLITOS");

  return {
    totalReferences,
    totalExistencia: items.reduce((s, i) => s + i.existenciaBodega01, 0),
    totalDisponibleReal: items.reduce((s, i) => s + i.disponibleReal, 0),
    totalPedidos: items.reduce((s, i) => s + i.pedidosPendientes, 0),
    disponibles,
    criticos: items.filter(i => i.operationalState === "critico" || i.operationalState === "bajo").length,
    agotados: items.filter(i => i.disponibleReal <= 0).length,
    conProduccion: items.filter(i => i.operationalState === "con_produccion").length,
    sinProduccion: items.filter(i => i.operationalState === "sin_produccion").length,
    pendienteValidar: items.filter(i => i.operationalState === "pendiente_validar").length,
    coberturaComercialPct: totalReferences > 0
      ? Math.round((disponibles / totalReferences) * 100)
      : 0,

    // New KPIs (INVENTARIO-KPI-REALIGNMENT-01)
    totalDisponibleBodega: items.reduce((s, i) => s + Math.max(i.disponibleReal, 0), 0),
    totalLT: ltItems.reduce((s, i) => s + Math.max(i.disponibleReal, 0), 0),
    totalCS: csItems.reduce((s, i) => s + Math.max(i.disponibleReal, 0), 0),
    totalImportacion: accessories.reduce((s, i) => s + Math.max(i.disponibleReal, 0), 0),
    subgruposCubiertos: subgrupoCoverage.filter(s => s.estado === "cubierto").length,
    subgruposEnRiesgo: subgrupoCoverage.filter(s => s.estado === "riesgo").length,
    subgruposSinCobertura: subgrupoCoverage.filter(s => s.estado === "sin_cobertura").length,
    accesoriosBajaCantidad: accessories.filter(i => i.disponibleReal > 0 && i.disponibleReal < IMPORT_SCARCITY_MINIMUM).length,

    // Visibility counts (COMERCIAL-INVENTARIO-ACTIVO-HISTORICO-01)
    activeCount: items.filter(i => i.inventoryVisibility === "ACTIVE").length,
    outOfStockCount: items.filter(i => i.inventoryVisibility === "OUT_OF_STOCK").length,
    noDataCount: items.filter(i => i.inventoryVisibility === "NO_DATA").length,
  };
}

// ── Subgrupo Coverage Analysis (INVENTARIO-KPI-REALIGNMENT-01) ──────────────

function buildSubgrupoCoverage(items: InventoryItem[]): SubgrupoCoverage[] {
  const textile = items.filter(i => i.lineCategory === "textile");
  const groups = new Map<string, InventoryItem[]>();
  for (const item of textile) {
    const key = `${item.subLinea}::${item.subgrupoSag}`;
    const list = groups.get(key) ?? [];
    list.push(item);
    groups.set(key, list);
  }

  const result: SubgrupoCoverage[] = [];
  for (const [, sgItems] of groups) {
    const disponibles = sgItems.filter(i => i.disponibleReal > 0);
    const totalUnits = sgItems.reduce((s, i) => s + Math.max(i.disponibleReal, 0), 0);

    // Count distinct sizes/colors from description patterns
    const sizes = new Set<string>();
    const colors = new Set<string>();
    // Sizes/colors are not directly on InventoryItem yet — count refs as proxy
    // Real talla/color would come from ProductVariantAttribute if needed

    const refsCovered = disponibles.length;
    const refsTotal = sgItems.length;
    const coverageRatio = refsTotal > 0 ? refsCovered / refsTotal : 0;

    let estado: SubgrupoCoverageState;
    if (totalUnits === 0) estado = "sin_cobertura";
    else if (coverageRatio < 0.5) estado = "riesgo";
    else estado = "cubierto";

    result.push({
      subgrupoSag: sgItems[0].subgrupoSag,
      subLinea: sgItems[0].subLinea,
      referenciasActivas: refsTotal,
      unidadesDisponibles: totalUnits,
      tallasDisponibles: disponibles.length, // proxy: refs with stock
      coloresDisponibles: disponibles.length, // proxy
      estado,
    });
  }

  return result.sort((a, b) => {
    const sl = a.subLinea.localeCompare(b.subLinea);
    return sl !== 0 ? sl : a.subgrupoSag.localeCompare(b.subgrupoSag);
  });
}

// ── Accessory Low Stock Analysis (INVENTARIO-KPI-REALIGNMENT-01) ────────────

/**
 * Build per-category accessory low stock summary.
 *
 * States per category:
 *   suficiente — all refs have stock >= threshold
 *   bajo       — at least one ref with 0 < stock < threshold
 *   critico    — all refs have stock = 0
 *
 * Sprint: INVENTARIO-ACCESSORY-LOW-STOCK-AND-KPI-LAYOUT-01
 */
function buildAccesoriosBajaCantidad(items: InventoryItem[]): AccesorioBajaCantidad[] {
  const accessories = items.filter(i => i.lineCategory === "accessory");
  if (accessories.length === 0) return [];

  const groups = new Map<string, InventoryItem[]>();
  for (const item of accessories) {
    const cat = item.subgrupoSag || "ACCESORIO";
    const list = groups.get(cat) ?? [];
    list.push(item);
    groups.set(cat, list);
  }

  const result: AccesorioBajaCantidad[] = [];
  for (const [cat, catItems] of groups) {
    const totalUnits = catItems.reduce((s, i) => s + Math.max(i.disponibleReal, 0), 0);
    const refsActivas = catItems.length;
    const refsBajo = catItems.filter(i => i.disponibleReal > 0 && i.disponibleReal < IMPORT_SCARCITY_MINIMUM).length;
    const refsAgotadas = catItems.filter(i => i.disponibleReal <= 0).length;

    let estado: AccesorioStockState;
    if (refsAgotadas === refsActivas) estado = "critico";
    else if (refsBajo > 0) estado = "bajo";
    else estado = "suficiente";

    result.push({
      categoria: cat,
      referenciasActivas: refsActivas,
      unidadesDisponibles: totalUnits,
      estado,
    });
  }

  return result.sort((a, b) => a.categoria.localeCompare(b.categoria));
}

// ── Product Metadata (COMERCIAL-MALETAS-CANONICAL-INVENTORY-INTEGRATION-01) ──

interface ProductMetadata {
  productId: string;
  grupoSag: string | null;
  grupoId: number | null;
  subgrupoId: number | null;
  costo: number | null;
}

/**
 * Loads extended metadata for SKUs from ProductEntity.
 * Returns productId, grupoSag, grupoId, subgrupoId, costo per SKU.
 */
async function loadProductMetadata(
  organizationId: string,
  skus: string[],
): Promise<Map<string, ProductMetadata>> {
  const result = new Map<string, ProductMetadata>();
  if (skus.length === 0) return result;
  try {
    const products = await (prisma as any).productEntity.findMany({
      where: { organizationId, sku: { in: skus } },
      select: { id: true, sku: true, grupoSag: true, grupoId: true, subgrupoId: true, costo: true },
    });
    for (const p of products) {
      if (p.sku) {
        result.set(p.sku as string, {
          productId: p.id as string,
          grupoSag: (p.grupoSag as string | null) ?? null,
          grupoId: (p.grupoId as number | null) ?? null,
          subgrupoId: (p.subgrupoId as number | null) ?? null,
          costo: p.costo != null ? Number(p.costo) : null,
        });
      }
    }
  } catch {
    // Graceful degradation
  }
  return result;
}

// ── Variant Summaries (COMERCIAL-MALETAS-CANONICAL-INVENTORY-INTEGRATION-01) ─

interface VariantSummary {
  sizes: string[];
  colors: string[];
  variantCount: number;
}

/**
 * Loads talla/color summaries for all products in one batch query.
 * Returns Map<sku, VariantSummary>.
 */
async function loadVariantSummaries(
  organizationId: string,
  productIdToSku: Map<string, string>,
): Promise<Map<string, VariantSummary>> {
  const result = new Map<string, VariantSummary>();
  if (productIdToSku.size === 0) return result;

  try {
    const productIds = [...productIdToSku.keys()];
    const variants = await (prisma as any).productVariant.findMany({
      where: { productId: { in: productIds } },
      select: { productId: true, attributes: true },
    });

    // Group by productId
    const byProduct = new Map<string, any[]>();
    for (const v of variants) {
      const pid = v.productId as string;
      const list = byProduct.get(pid) ?? [];
      list.push(v);
      byProduct.set(pid, list);
    }

    for (const [pid, pvs] of byProduct) {
      const sku = productIdToSku.get(pid);
      if (!sku) continue;

      const tallaSet = new Set<string>();
      const colorSet = new Set<string>();
      for (const v of pvs) {
        const attrs = v.attributes as Record<string, string> | null;
        if (attrs?.tallaName) tallaSet.add(attrs.tallaName);
        else if (attrs?.talla) tallaSet.add(attrs.talla);
        if (attrs?.colorName) colorSet.add(attrs.colorName);
        else if (attrs?.color) colorSet.add(attrs.color);
      }

      result.set(sku, {
        sizes: [...tallaSet].sort(),
        colors: [...colorSet].sort(),
        variantCount: pvs.length,
      });
    }
  } catch {
    // Graceful degradation — variants will be empty
  }

  return result;
}

// ── Accessories (Import) ─────────────────────────────────────────────────────

interface AccessoryRef {
  id: string;
  sku: string;
  description: string;
  subgrupoSag: string | null;
  grupoSag: string | null;
  grupoId: number | null;
  subgrupoId: number | null;
  handlingUnit: string | null;
  costo: number | null;
}

async function loadAccessoryRefs(
  organizationId: string,
): Promise<AccessoryRef[]> {
  try {
    const products = await (prisma as any).productEntity.findMany({
      where: { organizationId, productLine: "5" },
      select: {
        id: true, sku: true, name: true, description: true,
        subgrupoSag: true, grupoSag: true, grupoId: true, subgrupoId: true,
        handlingUnit: true, costo: true,
      },
    });
    return products
      .filter((p: any) => p.sku)
      .map((p: any) => ({
        id: p.id as string,
        sku: p.sku as string,
        description: (p.name ?? p.description ?? "") as string,
        subgrupoSag: (p.subgrupoSag as string | null) ?? null,
        grupoSag: (p.grupoSag as string | null) ?? null,
        grupoId: (p.grupoId as number | null) ?? null,
        subgrupoId: (p.subgrupoId as number | null) ?? null,
        handlingUnit: (p.handlingUnit as string | null) ?? null,
        costo: p.costo != null ? Number(p.costo) : null,
      }));
  } catch {
    return [];
  }
}

async function loadAccessoryAvailability(
  organizationId: string,
): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  try {
    // SAG-DATAFLOW-FIX-01: use externalRef (bodega code) instead of warehouseId (SAG numeric PK)
    // warehouseId stores SAG internal PKs (e.g. "36","37") which don't match bodega codes ("26","27")
    const whList = IMPORT_SOURCE_WAREHOUSES.map((_, i) => `$${i + 2}`).join(",");
    const params = [organizationId, ...IMPORT_SOURCE_WAREHOUSES];
    interface ImportRow { sku: string; available: number }
    const rows: ImportRow[] = await (prisma as any).$queryRawUnsafe(`
      SELECT pe."sku",
             SUM(GREATEST(pil."quantity", 0))::int AS available
      FROM "ProductInventoryLevel" pil
      JOIN "ProductEntity" pe ON pe."id" = pil."productId"
        AND pe."organizationId" = pil."organizationId"
      WHERE pe."organizationId" = $1
        AND pil."externalRef" IN (${whList})
        AND pe."productLine" = '5'
      GROUP BY pe."sku"
    `, ...params);
    for (const r of rows) {
      if (r.sku) result.set(r.sku, Number(r.available));
    }
  } catch (err) {
    console.error("[inventory] loadAccessoryAvailability failed:", (err as any)?.message);
  }
  return result;
}

// ── Main Entry Point ─────────────────────────────────────────────────────────

/**
 * Build the complete Inventory Control Center snapshot.
 *
 * Orchestrates:
 * 1. loadAvailabilityRecords (Prisma)
 * 2. buildAvailabilityReport (pure domain)
 * 3. resolveInventoryThresholds (pure domain)
 * 4. loadActiveProductionCounts (Prisma)
 * 5. Enrichment: AvailabilityRow → InventoryItem
 * 6. Summaries, health, data quality
 */
export async function buildInventoryControlSnapshot(
  organizationId: string,
  orgSlug: string,
): Promise<InventoryControlSnapshot> {
  // 1. Load raw availability data
  const { records, snapshotAt } = await loadAvailabilityRecords(organizationId);

  // 2. Build availability report (pure domain engine)
  const report = buildAvailabilityReport({ orgSlug, records, sourceBodega: "01+04+14+15" });

  // 3. Resolve tenant thresholds
  const thresholdRules = resolveInventoryThresholds(orgSlug);
  const thresholdMap = new Map(thresholdRules.map(r => [r.subLinea.toUpperCase(), r.threshold]));

  // 4. Load active production counts + accessory data + product metadata
  const textileSkus = report.rows.map((r: AvailabilityRow) => r.reference);
  const [productionCounts, accessoryRefs, accessoryAvail, textileMetadata] = await Promise.all([
    loadActiveProductionCounts(organizationId),
    loadAccessoryRefs(organizationId),
    loadAccessoryAvailability(organizationId),
    loadProductMetadata(organizationId, textileSkus),
  ]);

  // 5. Enrich rows into InventoryItem[] (textile)
  const textileItems: InventoryItem[] = report.rows.map((row: AvailabilityRow) => {
    const threshold = thresholdMap.get(row.subLinea.toUpperCase()) ?? null;
    const activeOpCount = productionCounts.get(row.reference.toUpperCase().trim()) ?? 0;
    const hasActiveProduction = activeOpCount > 0;

    const operationalState = deriveOperationalState(
      row.disponibleReal,
      threshold,
      hasActiveProduction,
      false,
    );

    const canonicalLine = resolveCanonicalLine(row.subLinea, false);
    const meta = textileMetadata.get(row.reference);

    return {
      reference: row.reference,
      description: row.description,
      subLinea: row.subLinea,
      subGrupo: row.subGrupo,
      subgrupoSag: row.subGrupo,
      grupoSag: meta?.grupoSag ?? undefined,
      productId: meta?.productId ?? null,
      grupoId: meta?.grupoId ?? null,
      subgrupoId: meta?.subgrupoId ?? null,
      sizes: [] as string[],
      colors: [] as string[],
      variantCount: 0,
      cost: meta?.costo ?? null,
      existenciaBodega01: row.existenciaBodega01,
      pedidosPendientes: row.pedidosPendientes,
      disponibleReal: row.disponibleReal,
      availabilityStatus: row.status,
      operationalState,
      threshold,
      hasActiveProduction,
      activeOpCount,
      vendorCount: 0,
      isAccessory: false,
      lineCategory: "textile" as const,
      canonicalLine,
      inventoryVisibility: deriveInventoryVisibility(row.disponibleReal, true),
    };
  });

  // 5b. Build accessory InventoryItem[]
  const accessoryItems: InventoryItem[] = accessoryRefs.map((ref) => {
    const rawAvail = accessoryAvail.get(ref.sku);
    const hasData = rawAvail !== undefined;
    const available = rawAvail ?? 0;
    const state = deriveAccessoryState(available, IMPORT_SCARCITY_MINIMUM);

    return {
      reference: ref.sku,
      description: ref.description,
      subLinea: "IMPORTACION",
      subGrupo: ref.subgrupoSag ?? "ACCESORIO",
      subgrupoSag: ref.subgrupoSag ?? "ACCESORIO",
      grupoSag: ref.grupoSag ?? "IMPORTACION",
      handlingUnit: ref.handlingUnit ?? null,
      productId: ref.id,
      grupoId: ref.grupoId,
      subgrupoId: ref.subgrupoId,
      sizes: [] as string[],
      colors: [] as string[],
      variantCount: 0,
      cost: ref.costo,
      existenciaBodega01: available,
      pedidosPendientes: 0,
      disponibleReal: available,
      availabilityStatus: available > 0 ? "disponible" : "sin_existencia",
      operationalState: state,
      threshold: IMPORT_SCARCITY_MINIMUM,
      hasActiveProduction: false,
      activeOpCount: 0,
      vendorCount: 0,
      isAccessory: true,
      lineCategory: "accessory" as const,
      canonicalLine: "IMPORTACION" as const,
      inventoryVisibility: deriveInventoryVisibility(available, hasData),
    };
  });

  // COMERCIAL-INVENTARIO-IMPORT-PIPELINE-CANONICALIZATION-01:
  // Dedup guard — if a productLine=5 SKU somehow entered the textile pipeline
  // (e.g. historical CCS snapshot), the accessory pipeline takes precedence.
  const accessorySkus = new Set(accessoryItems.map(i => i.reference));
  const dedupedTextile = textileItems.filter(i => !accessorySkus.has(i.reference));
  const items = [...dedupedTextile, ...accessoryItems];

  // 5c. Load variant summaries (sizes/colors/variantCount) in one batch
  // COMERCIAL-MALETAS-CANONICAL-INVENTORY-INTEGRATION-01
  const productIdToSku = new Map<string, string>();
  for (const item of items) {
    if (item.productId) productIdToSku.set(item.productId, item.reference);
  }
  const variantMap = await loadVariantSummaries(organizationId, productIdToSku);
  for (const item of items) {
    const vs = variantMap.get(item.reference);
    if (vs) {
      item.sizes = vs.sizes;
      item.colors = vs.colors;
      item.variantCount = vs.variantCount;
    }
  }

  // 6. Build summaries
  const lineSummaries = buildLineSummaries(items);
  const subGrupoSummaries = buildSubGrupoSummaries(items);
  const subgrupoCoverage = buildSubgrupoCoverage(items);
  const accesoriosBaja = buildAccesoriosBajaCantidad(items);
  const health = buildHealth(items, subgrupoCoverage, accesoriosBaja);
  const freshestAt = await resolveFreshestSnapshotAt(organizationId, snapshotAt);
  const dataQuality = computeDataQuality(freshestAt, records.length);

  return {
    orgSlug,
    computedAt: new Date().toISOString(),
    items,
    lineSummaries,
    subGrupoSummaries,
    health,
    dataQuality,
    availabilityReport: report,
    subgrupoCoverage,
    accesoriosBajaCantidad: accesoriosBaja,
  };
}
