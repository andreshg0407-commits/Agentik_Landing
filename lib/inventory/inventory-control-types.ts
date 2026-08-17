/**
 * inventory-control-types.ts
 *
 * INVENTORY-CONTROL-CENTER-01 — Domain types.
 *
 * The Inventory Control Center is the official owner of commercial inventory.
 * Inventario Comercial = Bodega 01 (textile, wh10) + Bodega 24 (import, wh33).
 * Bodega 04 (wh13, PRODUCTO EN PROCESO) is tracked separately — not commercial.
 *
 * This module CONSUMES:
 *   - CommercialAvailabilityReport (availability-engine)
 *   - resolveInventoryThresholds (tenant-rule-resolver)
 *   - ProductionOrder presence (production domain — read-only)
 *
 * This module does NOT duplicate availability-engine logic.
 * disponibleReal calculation lives in availability-engine.ts.
 *
 * No Prisma. No React. No server-only. Pure domain types.
 */

import type {
  AvailabilityRow,
  AvailabilityStatus,
  CommercialAvailabilityReport,
} from "@/lib/commercial-intelligence/availability-types";

// ── Balance Source (AGENTIK-INVENTORY-COMMERCIAL-SAG-OFFICIAL-BALANCE-MIGRATION-01) ──

/**
 * Balance source label — unambiguous provenance for every InventoryItem.
 *
 * SAG_OFFICIAL:          Live SAG data, confirmed for this reference+bodega.
 * SAG_OFFICIAL_CACHE:    Stale SAG data from in-memory cache (SAG error, cache < 1hr).
 * SAG_OFFICIAL_NOT_FOUND: SAG query succeeded but this reference was absent from the view.
 *                         Does NOT imply zero — the view filters EXISTENCIA > 0.
 *                         PIL is NOT substituted as official balance.
 * PIL_LEGACY:            Feature flag = PIL_LEGACY (explicit mode, not a fallback).
 * UNAVAILABLE:           SAG query failed and no cache exists.
 */
export type InventoryBalanceSourceLabel =
  | "SAG_OFFICIAL"
  | "SAG_OFFICIAL_CACHE"
  | "SAG_OFFICIAL_NOT_FOUND"
  | "PIL_LEGACY"
  | "UNAVAILABLE";

// ── Variant Reconciliation ──────────────────────────────────────────────────

/**
 * Reconciliation status between SAG official balance and PIL variant sum.
 * MATCHED: delta < 1 unit
 * PARTIAL: delta exists but both sources have data
 * UNRECONCILED: large divergence (typical — PIL has massive negative rows)
 * STALE: PIL data is older than SAG by > 24 hours
 */
export type VariantReconciliationStatus =
  | "MATCHED"
  | "PARTIAL"
  | "UNRECONCILED"
  | "STALE";

// ── Sellable Units (MIGRATION-01 CIERRE DE SEGURIDAD) ───────────────────────

/**
 * Resolve non-negative sellable units from the signed official available balance.
 *
 * disponibleReal = official signed value (can be negative when RESERVADO > EXISTENCIA).
 * sellableUnits  = operational non-negative quantity for surtido and venta decisions.
 *
 * Consumers that need "how many can I sell/ship" MUST use this function.
 * Consumers that need "what does the official balance say" use disponibleReal directly.
 *
 * This is the ONLY authorized clamp point — individual consumers must NOT apply
 * their own Math.max(0, ...) to disponibleReal.
 */
export function resolveSellableUnits(officialAvailableUnits: number): number {
  return Math.max(0, officialAvailableUnits);
}

// ── Inventory Visibility (COMERCIAL-INVENTARIO-ACTIVO-HISTORICO-01) ──────────

/**
 * Derived visibility status for inventory segmentation.
 * Computed by deriveInventoryVisibility() — never persisted.
 * Reactivation is automatic: when SAG reports stock > 0, the ref returns to ACTIVE.
 */
export type InventoryVisibility = "ACTIVE" | "OUT_OF_STOCK" | "NO_DATA";

/**
 * Pure function — derives inventory visibility from availability data.
 *
 * @param disponibleReal Canonical disponible value (existencia - pedidos)
 * @param hasAvailabilityData Whether this item has a real availability record
 *   (e.g., exists in CommercialCoverageSnapshot for textile,
 *    or has PIL records in source bodegas for accessories)
 */
export function deriveInventoryVisibility(
  disponibleReal: number,
  hasAvailabilityData: boolean,
): InventoryVisibility {
  if (!hasAvailabilityData) return "NO_DATA";
  if (disponibleReal > 0) return "ACTIVE";
  return "OUT_OF_STOCK";
}

// ── Inventory Operational States ─────────────────────────────────────────────

/**
 * Operational state for a reference in inventory.
 *
 * Textile (LT/CS): disponible | bajo | sin_cobertura | alta_disponibilidad
 * Import/Accesorio: disponible | bajo | critico | recompra_futura
 *
 * Sprint: INVENTARIO-KPI-REALIGNMENT-01
 */
export type InventoryOperationalState =
  | "disponible"          // Stock adequate
  | "bajo"                // Stock below threshold — needs attention
  | "sin_cobertura"       // Zero stock (textile)
  | "alta_disponibilidad" // Stock well above threshold (textile)
  | "critico"             // Very low stock (accessory/import)
  | "recompra_futura"     // Zero stock on accessory — reorder signal
  // Legacy (kept for backward compatibility during transition)
  | "agotado"
  | "con_produccion"
  | "sin_produccion"
  | "pendiente_validar";

// ── Canonical Line (COMERCIAL-INVENTARIO-CANONICAL-STRUCTURE-01) ─────────────

/**
 * Canonical inventory grouping — the single source of truth for how every
 * product is classified in the Agentik inventory module.
 *
 * Resolution rules (no heuristics, no inference):
 *   lineaSag="CASTILLITOS" (CCS line="CS")  → CASTILLITOS
 *   lineaSag="LATIN KIDS"  (CCS line="LT")  → LATIN_KIDS
 *   productLine="5"        (isAccessory)     → IMPORTACION
 *   everything else                          → SIN_CLASIFICAR
 */
export type CanonicalLine =
  | "CASTILLITOS"
  | "LATIN_KIDS"
  | "IMPORTACION"
  | "SIN_CLASIFICAR";

/** Display labels for canonical lines. */
export const CANONICAL_LINE_LABELS: Record<CanonicalLine, string> = {
  CASTILLITOS: "Castillitos",
  LATIN_KIDS: "Latin Kids",
  IMPORTACION: "Importacion / Accesorios",
  SIN_CLASIFICAR: "Sin clasificar",
};

/** Enforced display order. */
export const CANONICAL_LINE_ORDER: CanonicalLine[] = [
  "CASTILLITOS",
  "LATIN_KIDS",
  "IMPORTACION",
  "SIN_CLASIFICAR",
];

/**
 * Resolves canonical line from subLinea and isAccessory flag.
 * Pure function — no DB, no inference.
 */
export function resolveCanonicalLine(
  subLinea: string,
  isAccessory: boolean,
): CanonicalLine {
  if (isAccessory) return "IMPORTACION";
  if (subLinea === "CASTILLITOS") return "CASTILLITOS";
  if (subLinea === "LATIN KIDS") return "LATIN_KIDS";
  return "SIN_CLASIFICAR";
}

// ── Catalog Enrichment Eligibility (COMERCIAL-INVENTARIO-AGOTADOS-HISTORICO-02)

/**
 * Pure function — determines if an inventory item is eligible for catalog
 * enrichment (photos, Shopify sync, creative AI, marketing).
 *
 * Only ACTIVE items qualify. OUT_OF_STOCK and NO_DATA are excluded.
 * Consumers: foto-estudio, Shopify publisher, catalog generator, marketing studio.
 */
export function isEligibleForCatalogEnrichment(item: {
  inventoryVisibility: InventoryVisibility;
}): boolean {
  return item.inventoryVisibility === "ACTIVE";
}

/**
 * Filters an inventory item array to only active operational items.
 * Consumers: Maletas, Tiendas, Pedidos, Produccion, Oportunidades, Catalogo, Fotos.
 *
 * Never returns OUT_OF_STOCK or NO_DATA items.
 */
export function getActiveCanonicalInventory<T extends { inventoryVisibility: InventoryVisibility }>(
  items: T[],
): T[] {
  return items.filter(i => i.inventoryVisibility === "ACTIVE");
}

// ── Inventory Item ───────────────────────────────────────────────────────────

/** Enriched inventory item — availability + criticality + production context.
 *
 * This is the canonical product record for all commercial consumers:
 * Maletas, Pedidos, Tiendas, Produccion, Marketing Studio.
 *
 * Consumers MUST NOT duplicate classification, availability, or variant data.
 * Sprint: COMERCIAL-MALETAS-CANONICAL-INVENTORY-INTEGRATION-01
 */
export interface InventoryItem {
  /** SAG reference code. */
  reference: string;
  /** Product description. */
  description: string;
  /** Commercial line (LATIN KIDS, CASTILLITOS, etc). */
  subLinea: string;
  /** Product type (PIJAMA, BLUSA, VESTIDO, etc). */
  subGrupo: string;
  /** Real SAG subgrupo (e.g. "PIJAMA CL 2-8") — from CommercialCoverageSnapshot.subgrupoSag. */
  subgrupoSag: string;
  /** SAG grupo name (e.g. "IMPORTACION", "PRODUCTO TERMINADO"). */
  grupoSag?: string;
  /** Handling unit for accessories (PEQUENO/MEDIANO/GRANDE). */
  handlingUnit?: string | null;

  // ── Identity (COMERCIAL-MALETAS-CANONICAL-INVENTORY-INTEGRATION-01) ──
  /** ProductEntity.id — null if no PE record found for this SKU. */
  productId: string | null;
  /** SAG grupo FK (numeric). */
  grupoId: number | null;
  /** SAG subgrupo FK (numeric). */
  subgrupoId: number | null;

  // ── Variants (COMERCIAL-MALETAS-CANONICAL-INVENTORY-INTEGRATION-01) ──
  /** Unique talla values from ProductVariant. */
  sizes: string[];
  /** Unique color values from ProductVariant. */
  colors: string[];
  /** Total number of ProductVariant records. */
  variantCount: number;

  // ── Cost (COMERCIAL-MALETAS-CANONICAL-INVENTORY-INTEGRATION-01) ──
  /** Product cost from ProductEntity.costo. */
  cost: number | null;

  /** Physical stock from CCS aggregate (includes production warehouses for textile).
   * For pure commercial stock, use disponibleReal.
   */
  existenciaBodega01: number;
  /** Pending orders. */
  pedidosPendientes: number;

  // ── Three-field SAG semantics (MIGRATION-01 FASE FINAL) ──────────────
  /**
   * On-hand units in the primary commercial warehouse.
   * SAG_OFFICIAL: SAG EXISTENCIA (saldos_articulos.n_saldo_actual).
   * PIL_LEGACY: PIL SUM(GREATEST(0, qty)) — legacy approximation.
   */
  onHandReal: number;
  /**
   * Reserved units (pending shipments, committed orders).
   * SAG_OFFICIAL: SAG RESERVADO (saldos_pedidos SUM).
   * PIL_LEGACY: 0 — PIL has no reserved concept.
   */
  reservedReal: number;
  /**
   * Commercially available stock = onHandReal - reservedReal.
   * SAG_OFFICIAL: SAG DISPONIBLE from vw_agentik_inventario.
   * PIL_LEGACY: same as onHandReal (no reserved concept in PIL).
   *
   * Can be negative when reservado > existencia.
   * NEVER equals EXISTENCIA — that is onHandReal.
   *
   * AGENTIK-INVENTORY-COMMERCIAL-SAG-OFFICIAL-BALANCE-MIGRATION-01.
   */
  disponibleReal: number;
  /**
   * True when SAG DISPONIBLE != EXISTENCIA - RESERVADO.
   * Indicates data inconsistency in the SAG view — original values preserved.
   */
  sagDataInvariantError: boolean;
  /** Availability status (from availability-engine). */
  availabilityStatus: AvailabilityStatus;

  /**
   * Stock in production process — not commercially available.
   * PIL wh13 net (PRODUCTO EN PROCESO, SAG B04), clamped >= 0.
   *
   * AGENTIK-INVENTORY-COMMERCIAL-VS-PRODUCTION-STOCK-CLARITY-01.
   */
  productionInProcess: number;

  /** Operational state (enriched with criticality + production). */
  operationalState: InventoryOperationalState;
  /** Tenant threshold for this subLinea (null if not configured). */
  threshold: number | null;

  /** Whether this reference has at least one active ProductionOrder. */
  hasActiveProduction: boolean;
  /** Number of active OPs for this reference. */
  activeOpCount: number;

  /** Number of vendors (maletas) carrying this reference. */
  vendorCount: number;

  /** True for productLine=5 (accessories/import). */
  isAccessory: boolean;
  /** Line category: "textile" (LT/CS) or "accessory" (IMPORT). */
  lineCategory: "textile" | "accessory";
  /** Canonical inventory grouping (COMERCIAL-INVENTARIO-CANONICAL-STRUCTURE-01). */
  canonicalLine: CanonicalLine;

  /**
   * Derived visibility status for inventory segmentation.
   * ACTIVE = disponibleReal > 0
   * OUT_OF_STOCK = disponibleReal <= 0 AND availability data exists
   * NO_DATA = no availability record in source bodegas
   *
   * Sprint: COMERCIAL-INVENTARIO-ACTIVO-HISTORICO-01
   */
  inventoryVisibility: InventoryVisibility;

  // ── SAG Official Balance (AGENTIK-INVENTORY-COMMERCIAL-SAG-OFFICIAL-BALANCE-MIGRATION-01) ──

  /**
   * Official on-hand units from SAG vw_agentik_inventario.
   * Source: saldos_articulos.n_saldo_actual (positive-only balance).
   * NULL when SAG source is unavailable (PIL_LEGACY mode).
   */
  sagOfficialExistencia: number | null;
  /**
   * Official reserved units from SAG vw_agentik_inventario.
   * Source: saldos_pedidos SUM (open orders).
   */
  sagOfficialReservado: number | null;
  /**
   * Official available units from SAG: existencia - reservado.
   * Can be negative. Preserved for audit — not silently clamped.
   */
  sagOfficialDisponible: number | null;
  /** SAG cost (n_costo_promedio) for this warehouse. */
  sagOfficialCosto: number | null;
  /** Most recent inventory-affecting movement date from SAG. */
  sagOfficialLastMovement: Date | null;

  // ── Variant Reconciliation ──
  /** PIL SUM(GREATEST(0, quantity)) for this reference + commercial warehouse. */
  variantPositiveUnits: number;
  /** PIL SUM(quantity) for this reference + commercial warehouse. */
  variantNetUnits: number;
  /** sagOfficialDisponible - variantPositiveUnits (null if SAG unavailable). */
  variantReconciliationDelta: number | null;
  /** Reconciliation status. */
  variantReconciliationStatus: VariantReconciliationStatus;

  /** Source of the disponibleReal value. */
  balanceSource: InventoryBalanceSourceLabel;

  // ── Lifecycle/Domain fields (shared with canonical enrichment) ──
  /** SAG product line ID — used for domain resolution */
  productLine?: string | null;
  /** SAG line name — used for domain resolution */
  lineaSag?: string | null;
  /** Last modification date in SAG — used for lifecycle resolution */
  lastModifiedSag?: Date | null;
  /** Last sale date in SAG — used for lifecycle resolution */
  lastSaleSag?: Date | null;
}

// ── Sales Portfolio Eligibility (COMERCIAL-MALETAS-CANONICAL-INVENTORY-INTEGRATION-01)

/**
 * Pure function — determines if an inventory item is eligible for inclusion
 * in a sales portfolio (maleta).
 *
 * Eligible if ALL of:
 *   - inventoryVisibility === "ACTIVE"
 *   - disponibleReal > 0
 *   - canonicalLine is resolved (not SIN_CLASIFICAR)
 *   - not OUT_OF_STOCK, not NO_DATA
 *
 * Photos are NOT a condition — they are enrichment, not eligibility.
 */
export function isEligibleForSalesPortfolio(item: {
  inventoryVisibility: InventoryVisibility;
  disponibleReal: number;
  canonicalLine: CanonicalLine;
}): boolean {
  return (
    item.inventoryVisibility === "ACTIVE" &&
    item.disponibleReal > 0 &&
    item.canonicalLine !== "SIN_CLASIFICAR"
  );
}

// ── Line Summary ─────────────────────────────────────────────────────────────

/** Summary for a product line (CASTILLITOS, LATIN KIDS, etc). */
export interface InventoryLineSummary {
  subLinea: string;
  totalReferences: number;
  disponibles: number;
  criticos: number;
  agotados: number;
  conProduccion: number;
  sinProduccion: number;
  totalExistencia: number;
  totalDisponibleReal: number;
  threshold: number | null;
}

// ── SubGrupo Summary ─────────────────────────────────────────────────────────

/** Summary for a product type within a line. */
export interface InventorySubGrupoSummary {
  subGrupo: string;
  subLinea: string;
  totalReferences: number;
  disponibles: number;
  criticos: number;
  agotados: number;
  totalExistencia: number;
  totalDisponibleReal: number;
}

// ── Inventory Health ─────────────────────────────────────────────────────────

/** Overall inventory health indicators.
 *
 * Sprint: INVENTARIO-KPI-REALIGNMENT-01
 */
export interface InventoryHealth {
  totalReferences: number;
  totalExistencia: number;
  totalDisponibleReal: number;
  totalPedidos: number;
  disponibles: number;
  criticos: number;
  agotados: number;
  conProduccion: number;
  sinProduccion: number;
  pendienteValidar: number;
  coberturaComercialPct: number;

  // ── New KPIs (INVENTARIO-KPI-REALIGNMENT-01) ──
  /** Total units available across all main warehouses. */
  totalDisponibleBodega: number;
  /** Total units for Latin Kids line. */
  totalLT: number;
  /** Total units for Castillitos line. */
  totalCS: number;
  /** Total units for Import/accessories line. */
  totalImportacion: number;
  /** Subgrupos with sufficient coverage. */
  subgruposCubiertos: number;
  /** Subgrupos at risk (some refs below threshold). */
  subgruposEnRiesgo: number;
  /** Subgrupos with zero coverage. */
  subgruposSinCobertura: number;
  /** Accessories below operational threshold. */
  accesoriosBajaCantidad: number;

  // ── Production (AGENTIK-INVENTORY-COMMERCIAL-VS-PRODUCTION-STOCK-CLARITY-01) ──
  /** Total units in production process (wh13) — not commercially available. */
  totalProductionInProcess: number;

  // ── Visibility counts (COMERCIAL-INVENTARIO-ACTIVO-HISTORICO-01) ──
  /** Items with disponibleReal > 0. */
  activeCount: number;
  /** Items with disponibleReal <= 0 and valid data. */
  outOfStockCount: number;
  /** Items without availability data. */
  noDataCount: number;
}

// ── Subgrupo Coverage (INVENTARIO-KPI-REALIGNMENT-01) ───────────────────────

/** Coverage state for a subgrupo within a textile line. */
export type SubgrupoCoverageState = "cubierto" | "riesgo" | "sin_cobertura";

/** Coverage analysis for a single subgrupo. */
export interface SubgrupoCoverage {
  subgrupoSag: string;
  subLinea: string;
  referenciasActivas: number;
  unidadesDisponibles: number;
  tallasDisponibles: number;
  coloresDisponibles: number;
  estado: SubgrupoCoverageState;
}

// ── Accessory Low Stock (INVENTARIO-KPI-REALIGNMENT-01) ─────────────────────

/** Stock state for an accessory group. */
export type AccesorioStockState = "suficiente" | "bajo" | "critico";

/** Low-stock analysis for an accessory category. */
export interface AccesorioBajaCantidad {
  categoria: string;
  referenciasActivas: number;
  unidadesDisponibles: number;
  estado: AccesorioStockState;
}

// ── Data Quality ─────────────────────────────────────────────────────────────

/** Data quality metadata for the inventory snapshot. */
export interface InventoryDataQuality {
  snapshotAt: string | null;
  daysSinceSnapshot: number | null;
  freshnessLabel: "HOY" | "RECIENTE" | "DESACTUALIZADO" | "SIN_DATOS";
  confidence: number;
  confidenceReason: string;
  warnings: string[];
  sources: string[];
  /** SAG balance source metadata (MIGRATION-01). */
  sagSourcePeriod?: string | null;
  sagSourceStatus?: "FRESH" | "AGING" | "STALE" | "UNAVAILABLE" | "DEGRADED";
  sagFetchDurationMs?: number;
  /** Active balance source for this snapshot. */
  balanceSource?: InventoryBalanceSourceLabel;

  // ── Data gap metrics (MIGRATION-01 CIERRE DE SEGURIDAD) ──
  /** Items with balanceSource = SAG_OFFICIAL or SAG_OFFICIAL_CACHE. */
  officialBalanceReferences?: number;
  /** Items with balanceSource = SAG_OFFICIAL_NOT_FOUND. */
  officialNotFoundReferences?: number;
  /** Items with balanceSource = UNAVAILABLE. */
  unavailableReferences?: number;
  /** Items with disponibleReal < 0. */
  negativeAvailableReferences?: number;
}

// ── Complete Snapshot ─────────────────────────────────────────────────────────

/** Pre-loaded non-commercial PIL row for canonical enrichment. */
export interface NonCommercialPilRow {
  productId: string;
  warehouseId: string;
  quantity: number;
}

/**
 * Top-level balance source status for the snapshot.
 * PIL_LEGACY:       Using internal PIL records, SAG comparison not available.
 * SAG_OFFICIAL:     Using SAG vw_agentik_inventario as authority.
 * SAG_UNAVAILABLE:  SAG was requested but query failed or returned no data.
 *
 * CASTILLITOS-COMMERCIAL-TRUTH-CLOSURE — Carril B.
 */
export type BalanceSourceStatus = "PIL_LEGACY" | "SAG_OFFICIAL" | "SAG_UNAVAILABLE";

/** Complete inventory control center snapshot. */
export interface InventoryControlSnapshot {
  orgSlug: string;
  computedAt: string;

  /**
   * Top-level balance source status. Indicates which authority governs
   * the disponibleReal values across this snapshot.
   * CASTILLITOS-COMMERCIAL-TRUTH-CLOSURE — Carril B.
   */
  balanceSourceStatus: BalanceSourceStatus;

  /**
   * Human-readable note explaining the balance source status.
   * CASTILLITOS-COMMERCIAL-TRUTH-CLOSURE — Carril B.
   */
  balanceSourceNote: string;

  /**
   * ISO timestamp of the SAG balance snapshot, or null when PIL_LEGACY
   * or SAG was unavailable.
   * CASTILLITOS-COMMERCIAL-TRUTH-CLOSURE — Carril B.
   */
  sourceAsOf: string | null;

  /** All inventory items, enriched with criticality + production. */
  items: InventoryItem[];
  /** Summary by line. */
  lineSummaries: InventoryLineSummary[];
  /** Summary by subGrupo (within each line). */
  subGrupoSummaries: InventorySubGrupoSummary[];
  /** Overall health. */
  health: InventoryHealth;
  /** Data quality. */
  dataQuality: InventoryDataQuality;

  /** Underlying availability report (for reference, not for UI duplication). */
  availabilityReport: CommercialAvailabilityReport;

  // ── New data (INVENTARIO-KPI-REALIGNMENT-01) ──
  /** Subgrupo coverage analysis for textile lines. */
  subgrupoCoverage: SubgrupoCoverage[];
  /** Accessories with low stock. */
  accesoriosBajaCantidad: AccesorioBajaCantidad[];

  /**
   * Pre-loaded non-commercial PIL rows (production, staging, container, vendor/store warehouses).
   * Used by canonical enrichment to avoid a duplicate PIL query.
   * Internal — not consumed by UI.
   */
  _nonCommercialPil?: NonCommercialPilRow[];
}
