/**
 * lib/inventory/inventory-panel-destination.ts
 *
 * COMERCIAL-INVENTARIO-CANONICAL-STATUS-INTEGRATION-01 — Panel Destination
 *
 * Pure deterministic resolver: CanonicalInventoryItemStatus → PanelDestination.
 *
 * No Prisma. No React. No server-only. No side effects.
 */

import type { CommercialReferenceStatus, StockDistributionFlag } from "./commercial-reference-status";
import type { CanonicalLine } from "./inventory-control-types";

// ── Panel destinations ─────────────────────────────────────────────────────

export type PanelDestination =
  | "CASTILLITOS"
  | "LATIN_KIDS"
  | "IMPORTACION"
  | "SIN_CLASIFICAR"
  | "AGOTADOS"
  | "VAULT"
  | "EXTERNAL_EXCLUDED";

export const PANEL_DESTINATION_LABELS: Record<PanelDestination, string> = {
  CASTILLITOS: "Castillitos",
  LATIN_KIDS: "Latin Kids",
  IMPORTACION: "Importacion / Accesorios",
  SIN_CLASIFICAR: "Sin clasificar",
  AGOTADOS: "Agotados",
  VAULT: "Vault",
  EXTERNAL_EXCLUDED: "Externas excluidas",
};

export const PANEL_DESTINATION_ORDER: PanelDestination[] = [
  "CASTILLITOS",
  "LATIN_KIDS",
  "IMPORTACION",
  "SIN_CLASIFICAR",
  "AGOTADOS",
  "VAULT",
];

// ── Vault subcategories ─────────────────────────────────────────────────────

export type VaultSubcategory =
  | "BAJA_ACTIVIDAD_NO_COMERCIAL"
  | "DORMANT"
  | "ARCHIVE_REVIEW"
  | "SIN_DATOS_DE_ACTIVIDAD"
  | "STOCK_SOLO_PRODUCCION"
  | "STOCK_SOLO_STAGING"
  | "STOCK_SOLO_CONTENEDOR"
  | "STOCK_SOLO_TIENDA_O_VENDEDOR"
  | "SIN_STOCK"
  | "DATOS_INSUFICIENTES";

export const VAULT_SUBCATEGORY_LABELS: Record<VaultSubcategory, string> = {
  BAJA_ACTIVIDAD_NO_COMERCIAL: "Baja actividad no comercial",
  DORMANT: "Dormante",
  ARCHIVE_REVIEW: "Revision de archivo",
  SIN_DATOS_DE_ACTIVIDAD: "Sin datos de actividad",
  STOCK_SOLO_PRODUCCION: "Stock solo en produccion",
  STOCK_SOLO_STAGING: "Stock solo en staging",
  STOCK_SOLO_CONTENEDOR: "Stock solo en contenedor",
  STOCK_SOLO_TIENDA_O_VENDEDOR: "Stock solo en tienda o vendedor",
  SIN_STOCK: "Sin stock",
  DATOS_INSUFICIENTES: "Datos insuficientes",
};

// ── Resolver input ──────────────────────────────────────────────────────────

export interface PanelDestinationInput {
  exclusionReason: string | null;
  commercialReferenceStatus: CommercialReferenceStatus;
  stockDistribution: StockDistributionFlag;
  compatibleCommercialStock: number;
  canonicalLine: CanonicalLine;
  /**
   * True if the item has a certified commercial history — i.e., a CCS record exists
   * (inventoryVisibility !== "NO_DATA"), meaning this reference was at some point
   * tracked in commercial bodegas.
   *
   * Distinguishes "commercially known but temporarily out of stock" (→ AGOTADOS)
   * from "never commercially available" (→ VAULT).
   *
   * Does NOT imply current stock. Only historical commercial presence.
   */
  hasCertifiedCommercialHistory: boolean;
}

// ── Resolver ────────────────────────────────────────────────────────────────

/**
 * Resolve the panel destination for an inventory item.
 *
 * Precedence (mandatory, never reordered):
 *   1. Excluded by Business Domain Gate → EXTERNAL_EXCLUDED
 *   2. DORMANT → VAULT
 *   3. ARCHIVE_REVIEW → VAULT
 *   4. UNKNOWN → VAULT
 *   5. NON_COMMERCIAL + commercial presence → AGOTADOS (known ref, temporarily out of stock)
 *   6. NON_COMMERCIAL without commercial presence → VAULT (never commercially relevant)
 *   7. In scope but compatibleCommercialStock <= 0 → AGOTADOS
 *   8. ACTIVE_AVAILABLE or LOW_ACTIVITY_AVAILABLE → classify by line
 */
export function resolveInventoryPanelDestination(input: PanelDestinationInput): PanelDestination {
  // 1. External excluded
  if (input.exclusionReason !== null) return "EXTERNAL_EXCLUDED";

  // 2-4. Lifecycle-based VAULT (stock irrelevant)
  const s = input.commercialReferenceStatus;
  if (s === "DORMANT") return "VAULT";
  if (s === "ARCHIVE_REVIEW") return "VAULT";
  if (s === "UNKNOWN") return "VAULT";

  // 5-6. NON_COMMERCIAL: commercially known refs → AGOTADOS, unknown → VAULT
  if (s === "ACTIVE_NON_COMMERCIAL" || s === "LOW_ACTIVITY_NON_COMMERCIAL") {
    return input.hasCertifiedCommercialHistory ? "AGOTADOS" : "VAULT";
  }

  // 7. AVAILABLE status but zero commercial stock → AGOTADOS
  if (input.compatibleCommercialStock <= 0) return "AGOTADOS";

  // 8. Classify by canonical line
  switch (input.canonicalLine) {
    case "CASTILLITOS": return "CASTILLITOS";
    case "LATIN_KIDS": return "LATIN_KIDS";
    case "IMPORTACION": return "IMPORTACION";
    case "SIN_CLASIFICAR": return "SIN_CLASIFICAR";
  }
}

// ── Vault subcategory resolver ──────────────────────────────────────────────

export function resolveVaultSubcategory(
  status: CommercialReferenceStatus,
  stockDistribution: StockDistributionFlag,
): VaultSubcategory {
  if (status === "ARCHIVE_REVIEW") return "ARCHIVE_REVIEW";
  if (status === "DORMANT") return "DORMANT";
  if (status === "UNKNOWN") {
    if (stockDistribution === "NO_ACTIVITY_DATA") return "SIN_DATOS_DE_ACTIVIDAD";
    return "DATOS_INSUFICIENTES";
  }

  // ACTIVE_NON_COMMERCIAL or LOW_ACTIVITY_NON_COMMERCIAL
  if (status === "LOW_ACTIVITY_NON_COMMERCIAL") {
    return resolveStockSubcategory(stockDistribution);
  }

  // ACTIVE_NON_COMMERCIAL
  return resolveStockSubcategory(stockDistribution);
}

function resolveStockSubcategory(stockDistribution: StockDistributionFlag): VaultSubcategory {
  switch (stockDistribution) {
    case "STOCK_ONLY_PRODUCTION": return "STOCK_SOLO_PRODUCCION";
    case "STOCK_ONLY_STAGING": return "STOCK_SOLO_STAGING";
    case "STOCK_ONLY_CONTAINER": return "STOCK_SOLO_CONTENEDOR";
    case "STOCK_ONLY_VENDOR_OR_STORE": return "STOCK_SOLO_TIENDA_O_VENDEDOR";
    case "NO_STOCK_ANYWHERE": return "SIN_STOCK";
    default: return "DATOS_INSUFICIENTES";
  }
}

// ── Vault action label (informational only) ─────────────────────────────────

export function resolveVaultActionLabel(subcategory: VaultSubcategory): string {
  switch (subcategory) {
    case "ARCHIVE_REVIEW": return "Archivar";
    case "DORMANT": return "Confirmar vigencia";
    case "SIN_DATOS_DE_ACTIVIDAD": return "Corregir clasificacion";
    case "STOCK_SOLO_PRODUCCION": return "Transferir a bodega comercial";
    case "STOCK_SOLO_STAGING": return "Transferir a bodega comercial";
    case "STOCK_SOLO_CONTENEDOR": return "Revisar";
    case "STOCK_SOLO_TIENDA_O_VENDEDOR": return "Revisar";
    case "BAJA_ACTIVIDAD_NO_COMERCIAL": return "Confirmar vigencia";
    case "SIN_STOCK": return "Revisar";
    case "DATOS_INSUFICIENTES": return "Corregir clasificacion";
  }
}
