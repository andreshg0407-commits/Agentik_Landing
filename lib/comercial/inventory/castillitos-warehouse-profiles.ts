/**
 * lib/comercial/inventory/castillitos-warehouse-profiles.ts
 *
 * INVENTORY-CANONICAL-TRUTH-04A3 — Unified Warehouse Registry
 *
 * Single source of truth for warehouse classification for tenant Castillitos (LUDISAM).
 * Authority: BODEGAS.csv (user-certified) + warehouse-master.ts (PIL layer).
 *
 * 04A2 corrections applied:
 *   - ALL franchises → EXCLUDED ("NO TENER EN CUENTA" per CSV)
 *   - DEXCATO → EXCLUDED ("NO TENER EN CUENTA" per CSV)
 *   - PAGINA WEB → EXCLUDED ("NO TENER EN CUENTA" per CSV)
 *   - IMPORTACION (B24) → COMMERCIAL (separate domain, not SUPPLY_CHAIN)
 *   - Active import containers (42-49) → EXCLUDED (containers per CSV)
 *
 * Decision scopes (04A3):
 *   GLOBAL_SELLABLE: principal + stores + vendors + import (panorama)
 *   TEXTILE_REPLENISHMENT_SOURCE: B01 only (replenishment decisions)
 *   IMPORT_REPLENISHMENT_SOURCE: B24 only (import replenishment)
 *   STORE_STOCK: per-store bodega
 *   SELLER_PORTFOLIO_STOCK: per-vendor bodega
 *   PRODUCTION_WIP: B04 (visible, never sellable)
 */

import type { WarehouseProfile, WarehouseRole, WarehouseCommercialScope } from "./canonical-inventory-types";

interface BodegaEntry {
  bodegaId: number;
  code: string;
  name: string;
  sagClase: string;
  role: WarehouseRole;
  scope: WarehouseCommercialScope;
  active: boolean;
}

const CASTILLITOS_BODEGAS: BodegaEntry[] = [
  // ── SELLABLE_PRINCIPAL ──
  { bodegaId: 10, code: "01", name: "BODEGA PRINCIPAL",      sagClase: "P", role: "PRINCIPAL",        scope: "COMMERCIAL",    active: true },

  // ── SELLABLE_STORE ──
  { bodegaId: 11, code: "02", name: "BODEGA SANDIEGO",       sagClase: "P", role: "STORE",            scope: "COMMERCIAL",    active: true },
  { bodegaId: 31, code: "00", name: "BODEGA CENTRO",         sagClase: "P", role: "STORE",            scope: "COMMERCIAL",    active: true },
  { bodegaId: 32, code: "23", name: "GRAN PLAZA",            sagClase: "P", role: "STORE",            scope: "COMMERCIAL",    active: true },
  { bodegaId: 39, code: "29", name: "BODEGA CALDAS",         sagClase: "P", role: "STORE",            scope: "COMMERCIAL",    active: true },

  // ── SELLABLE_IMPORT ──
  { bodegaId: 33, code: "24", name: "IMPORTACION",           sagClase: "T", role: "IMPORT_STAGING",   scope: "COMMERCIAL",    active: true },

  // ── SELLER_PORTFOLIO ──
  { bodegaId: 45, code: "35", name: "VEND ORLANDO",         sagClase: "P", role: "VENDOR_SUITCASE",  scope: "COMMERCIAL",    active: true },
  { bodegaId: 46, code: "36", name: "VEND CARLOS LEON",     sagClase: "P", role: "VENDOR_SUITCASE",  scope: "COMMERCIAL",    active: true },
  { bodegaId: 47, code: "37", name: "VEND LUIS",            sagClase: "P", role: "VENDOR_SUITCASE",  scope: "COMMERCIAL",    active: true },
  { bodegaId: 48, code: "38", name: "VEND NESTOR",          sagClase: "P", role: "VENDOR_SUITCASE",  scope: "COMMERCIAL",    active: true },
  { bodegaId: 49, code: "39", name: "VEND CARLOS VILLA",    sagClase: "P", role: "VENDOR_SUITCASE",  scope: "COMMERCIAL",    active: true },
  { bodegaId: 50, code: "40", name: "VEND FREDY",           sagClase: "P", role: "VENDOR_SUITCASE",  scope: "COMMERCIAL",    active: true },

  // ── RAW_MATERIAL ──
  { bodegaId: 14, code: "05", name: "MATERIA PRIMA",        sagClase: "P", role: "RAW_MATERIAL",     scope: "SUPPLY_CHAIN",  active: true },
  { bodegaId: 15, code: "06", name: "TELAS",                sagClase: "P", role: "RAW_MATERIAL",     scope: "SUPPLY_CHAIN",  active: true },
  { bodegaId: 16, code: "07", name: "RETAZOS",              sagClase: "P", role: "RAW_MATERIAL",     scope: "SUPPLY_CHAIN",  active: true },

  // ── WIP (PRODUCTION_WIP) ──
  { bodegaId: 13, code: "04", name: "PRODUCTO EN PROCESO",  sagClase: "T", role: "WIP",              scope: "SUPPLY_CHAIN",  active: true },

  // ── EXCLUDED — Franchises ("NO TENER EN CUENTA" per CSV) ──
  { bodegaId: 12, code: "03", name: "BODEGA MAYORCA",       sagClase: "P", role: "FRANCHISE",        scope: "EXCLUDED",      active: true },
  { bodegaId: 17, code: "08", name: "F1 - PAQUE BERRIO",    sagClase: "T", role: "FRANCHISE",        scope: "EXCLUDED",      active: true },
  { bodegaId: 18, code: "10", name: "F6 - BELLO",           sagClase: "T", role: "FRANCHISE",        scope: "EXCLUDED",      active: true },
  { bodegaId: 19, code: "09", name: "F3 - BOLIVAR",         sagClase: "T", role: "FRANCHISE",        scope: "EXCLUDED",      active: true },
  { bodegaId: 20, code: "11", name: "F7 - ARMENIA",         sagClase: "T", role: "FRANCHISE",        scope: "EXCLUDED",      active: true },
  { bodegaId: 21, code: "12", name: "F9 - PEREIRA",         sagClase: "T", role: "FRANCHISE",        scope: "EXCLUDED",      active: true },
  { bodegaId: 22, code: "13", name: "F16 - CENT MAY BOGOT", sagClase: "T", role: "FRANCHISE",        scope: "EXCLUDED",      active: true },
  { bodegaId: 23, code: "14", name: "F17 - MAYORCA",        sagClase: "T", role: "FRANCHISE",        scope: "EXCLUDED",      active: true },
  { bodegaId: 24, code: "15", name: "F10 - IBAGUE",         sagClase: "T", role: "FRANCHISE",        scope: "EXCLUDED",      active: true },
  { bodegaId: 29, code: "21", name: "F19 - MONTERIA",       sagClase: "T", role: "FRANCHISE",        scope: "EXCLUDED",      active: true },

  // ── EXCLUDED — Import containers ("NO TENER EN CUENTA" per CSV) ──
  { bodegaId: 36, code: "26", name: "IMPORTACION PARTE 2",  sagClase: "T", role: "IMPORT_STAGING",   scope: "EXCLUDED",      active: false },
  { bodegaId: 37, code: "27", name: "IMPORTACION PARTE 1",  sagClase: "T", role: "IMPORT_STAGING",   scope: "EXCLUDED",      active: false },
  { bodegaId: 41, code: "30", name: "IMPO CONTENEDOR 2",    sagClase: "T", role: "IMPORT_STAGING",   scope: "EXCLUDED",      active: false },
  { bodegaId: 42, code: "31", name: "IMPO CONTENEDOR 2-1",  sagClase: "T", role: "IMPORT_STAGING",   scope: "EXCLUDED",      active: false },
  { bodegaId: 43, code: "32", name: "IMPO CONTENEDOR 3",    sagClase: "T", role: "IMPORT_STAGING",   scope: "EXCLUDED",      active: false },
  { bodegaId: 44, code: "33", name: "IMPO CONTENEDOR 4",    sagClase: "T", role: "IMPORT_STAGING",   scope: "EXCLUDED",      active: false },
  { bodegaId: 51, code: "34", name: "IMPO CONTENEDOR 5",    sagClase: "T", role: "IMPORT_STAGING",   scope: "EXCLUDED",      active: false },
  { bodegaId: 53, code: "42", name: "IMPO CONTENEDOR 6",    sagClase: "T", role: "IMPORT_STAGING",   scope: "EXCLUDED",      active: true },
  { bodegaId: 54, code: "43", name: "IMPO CONTENEDOR 7",    sagClase: "T", role: "IMPORT_STAGING",   scope: "EXCLUDED",      active: true },
  { bodegaId: 55, code: "44", name: "IMPO CONTENEDOR 7-1",  sagClase: "T", role: "IMPORT_STAGING",   scope: "EXCLUDED",      active: true },
  { bodegaId: 56, code: "45", name: "IMPO CONTENEDOR 7-2",  sagClase: "T", role: "IMPORT_STAGING",   scope: "EXCLUDED",      active: true },
  { bodegaId: 57, code: "46", name: "IMPO CONETNEDOR 7-3",  sagClase: "T", role: "IMPORT_STAGING",   scope: "EXCLUDED",      active: true },
  { bodegaId: 59, code: "48", name: "IMPO CONTENEDOR 9-1",  sagClase: "P", role: "IMPORT_STAGING",   scope: "EXCLUDED",      active: true },
  { bodegaId: 60, code: "49", name: "IMPO CONTENEDOR 10-1", sagClase: "P", role: "IMPORT_STAGING",   scope: "EXCLUDED",      active: true },

  // ── EXCLUDED — Special purpose ("NO TENER EN CUENTA" / "APARTE" per CSV) ──
  { bodegaId: 25, code: "16", name: "MUESTRAS",             sagClase: "P", role: "SPECIAL",          scope: "EXCLUDED",      active: true },
  { bodegaId: 26, code: "18", name: "ARREGLOS",             sagClase: "P", role: "SPECIAL",          scope: "EXCLUDED",      active: true },
  { bodegaId: 27, code: "19", name: "SEGUNDAS Y SALDOS",    sagClase: "P", role: "SPECIAL",          scope: "EXCLUDED",      active: true },
  { bodegaId: 28, code: "20", name: "TEMPORAL FLAMINGO",    sagClase: "P", role: "SPECIAL",          scope: "EXCLUDED",      active: true },
  { bodegaId: 30, code: "22", name: "PAGINA WEB",           sagClase: "P", role: "SPECIAL",          scope: "EXCLUDED",      active: false },
  { bodegaId: 34, code: "25", name: "NO USAR",              sagClase: "T", role: "INACTIVE",         scope: "EXCLUDED",      active: false },
  { bodegaId: 38, code: "28", name: "PLAN SEPARE",          sagClase: "P", role: "SPECIAL",          scope: "EXCLUDED",      active: true },
  { bodegaId: 52, code: "41", name: "DEXCATO. MC",          sagClase: "T", role: "SPECIAL",          scope: "EXCLUDED",      active: true },
  { bodegaId: 58, code: "47", name: "MARCA SAMUEL",         sagClase: "T", role: "INACTIVE",         scope: "EXCLUDED",      active: true },
];

// ── Lookup maps ─────────────────────────────────────────────────────────────

const BY_BODEGA_ID = new Map<number, BodegaEntry>(
  CASTILLITOS_BODEGAS.map(b => [b.bodegaId, b]),
);

const BY_CODE = new Map<string, BodegaEntry>(
  CASTILLITOS_BODEGAS.map(b => [b.code, b]),
);

// View uses "XX - NAME" format for BODEGA column
const BY_VIEW_BODEGA = new Map<string, BodegaEntry>();
for (const b of CASTILLITOS_BODEGAS) {
  // Match patterns like "01 - BODEGA PRINCIPAL", "00 - BODEGA CENTRO"
  BY_VIEW_BODEGA.set(`${b.code} - ${b.name}`, b);
  // Also match just the code prefix (first 2 chars of BODEGA string)
  BY_VIEW_BODEGA.set(b.code, b);
}

// ── Public API ──────────────────────────────────────────────────────────────

export function getWarehouseProfile(bodegaId: number): WarehouseProfile | null {
  const entry = BY_BODEGA_ID.get(bodegaId);
  if (!entry) return null;
  return toProfile(entry);
}

export function getWarehouseProfileByCode(code: string): WarehouseProfile | null {
  const entry = BY_CODE.get(code.trim());
  if (!entry) return null;
  return toProfile(entry);
}

/**
 * Resolve warehouse profile from vw_agentik_inventario BODEGA column.
 * Handles format "XX - NAME" by extracting the code prefix.
 */
export function getWarehouseProfileByViewBodega(bodega: string): WarehouseProfile | null {
  const trimmed = bodega.trim();
  // Try exact match first
  let entry = BY_VIEW_BODEGA.get(trimmed);
  if (entry) return toProfile(entry);
  // Extract code prefix (first part before " - ")
  const dashIdx = trimmed.indexOf(" - ");
  if (dashIdx > 0) {
    const code = trimmed.substring(0, dashIdx).trim();
    entry = BY_CODE.get(code);
    if (entry) return toProfile(entry);
  }
  return null;
}

export function getAllWarehouseProfiles(): WarehouseProfile[] {
  return CASTILLITOS_BODEGAS.map(toProfile);
}

export function getCommercialWarehouseProfiles(): WarehouseProfile[] {
  return CASTILLITOS_BODEGAS
    .filter(b => b.scope === "COMMERCIAL")
    .map(toProfile);
}

export function getSupplyChainWarehouseProfiles(): WarehouseProfile[] {
  return CASTILLITOS_BODEGAS
    .filter(b => b.scope === "SUPPLY_CHAIN")
    .map(toProfile);
}

export function isCommercialWarehouse(bodegaId: number): boolean {
  return BY_BODEGA_ID.get(bodegaId)?.scope === "COMMERCIAL";
}

export function isCommercialWarehouseByCode(code: string): boolean {
  return BY_CODE.get(code.trim())?.scope === "COMMERCIAL";
}

// ── Decision Scope Resolvers (04A3) ─────────────────────────────────────────

export type DecisionScope =
  | "GLOBAL_SELLABLE"
  | "TEXTILE_REPLENISHMENT_SOURCE"
  | "IMPORT_REPLENISHMENT_SOURCE"
  | "STORE_STOCK"
  | "SELLER_PORTFOLIO_STOCK"
  | "PRODUCTION_WIP";

/**
 * Get warehouse profiles for a specific decision scope.
 *
 * GLOBAL_SELLABLE: all COMMERCIAL bodegas (panorama view)
 * TEXTILE_REPLENISHMENT_SOURCE: B01 only (replenishment decisions)
 * IMPORT_REPLENISHMENT_SOURCE: B24 only (import replenishment)
 * STORE_STOCK: retail stores only
 * SELLER_PORTFOLIO_STOCK: vendor suitcases only
 * PRODUCTION_WIP: B04 only (visible, never sellable)
 */
export function getWarehouseProfilesByScope(scope: DecisionScope): WarehouseProfile[] {
  switch (scope) {
    case "GLOBAL_SELLABLE":
      return CASTILLITOS_BODEGAS
        .filter(b => b.scope === "COMMERCIAL")
        .map(toProfile);
    case "TEXTILE_REPLENISHMENT_SOURCE":
      return CASTILLITOS_BODEGAS
        .filter(b => b.role === "PRINCIPAL" && b.scope === "COMMERCIAL")
        .map(toProfile);
    case "IMPORT_REPLENISHMENT_SOURCE":
      return CASTILLITOS_BODEGAS
        .filter(b => b.role === "IMPORT_STAGING" && b.scope === "COMMERCIAL")
        .map(toProfile);
    case "STORE_STOCK":
      return CASTILLITOS_BODEGAS
        .filter(b => b.role === "STORE" && b.scope === "COMMERCIAL")
        .map(toProfile);
    case "SELLER_PORTFOLIO_STOCK":
      return CASTILLITOS_BODEGAS
        .filter(b => b.role === "VENDOR_SUITCASE" && b.scope === "COMMERCIAL")
        .map(toProfile);
    case "PRODUCTION_WIP":
      return CASTILLITOS_BODEGAS
        .filter(b => b.role === "WIP")
        .map(toProfile);
  }
}

/** Get the bodega IDs for a decision scope. */
export function getBodegaIdsForScope(scope: DecisionScope): number[] {
  return getWarehouseProfilesByScope(scope).map(p => p.bodegaId);
}

/** Get the bodega codes for a decision scope. */
export function getBodegaCodesForScope(scope: DecisionScope): string[] {
  return getWarehouseProfilesByScope(scope).map(p => p.code);
}

/** Check if a bodega ID belongs to a decision scope. */
export function isBodegaInScope(bodegaId: number, scope: DecisionScope): boolean {
  return getWarehouseProfilesByScope(scope).some(p => p.bodegaId === bodegaId);
}

function toProfile(entry: BodegaEntry): WarehouseProfile {
  return {
    bodegaId: entry.bodegaId,
    code: entry.code,
    name: entry.name,
    sagClase: entry.sagClase,
    role: entry.role,
    commercialScope: entry.scope,
    active: entry.active,
  };
}
