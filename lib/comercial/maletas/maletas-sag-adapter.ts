/**
 * lib/comercial/maletas/maletas-sag-adapter.ts
 *
 * SAG → Maletas intelligence adapter.
 * Normalizes Prisma SaleRecord data into typed signals for the intelligence engine.
 *
 * SAG source codes confirmed by Castillitos administration:
 *   PD = PEDIDOS        — pending orders; affects demand pressure, NOT sales velocity
 *   AP = LIMPIEZA DE PEDIDOS — order cleanup; excluded from ALL calculations
 *   OFICIAL             — confirmed invoiced sale; affects velocity + demand
 *   REMISION            — remission sale; affects velocity + demand
 *
 * Disponible operativo (canonical formula):
 *   availableForCases = initialWarehouseQty (bodega) - reservedQty (reservas)
 *
 * Sprint: AGENTIK-COMERCIAL-MALETAS-PERSISTENCE-01
 * Patch:  AGENTIK-COMERCIAL-MALETAS-SAG-SOURCES-PATCH-01
 */

import type { SagSaleHint, OperationalAvailability } from "./maletas-intelligence-types";

// ─── SAG source code registry ─────────────────────────────────────────────────

/**
 * All known SAG source codes for the Maletas commercial module.
 * Extend when new source codes are confirmed by administration.
 */
export type SagSourceCode = "OFICIAL" | "REMISION" | "PD" | "AP";

export interface SagSourceSemantics {
  /** Human-readable name as confirmed by Castillitos */
  label:                string;
  /** True if this source represents a completed sale */
  isSale:               boolean;
  /** True if this source should contribute to velocity calculations */
  affectsSalesVelocity: boolean;
  /** True if this source represents pending commercial demand */
  affectsDemand:        boolean;
  /** True if this source pressures production requirements */
  affectsProduction:    boolean;
  /** True if this source affects commercial case coverage */
  affectsCoverage:      boolean;
  /** True if this source reduces available warehouse stock */
  affectsAvailability:  boolean;
  /** True if this source contributes to recognized revenue */
  affectsRevenue:       boolean;
  /** True if this source affects cash position */
  affectsCash:          boolean;
  /** True if this record can transition to an invoice (PD only) */
  canConvertToInvoice:  boolean;
  /** True if this source must be completely excluded from all calculations */
  excludeFromAll:       boolean;
}

/**
 * Canonical mapping of SAG source codes to their operational semantics.
 * Source of truth for Maletas — do not change without admin confirmation.
 *
 * Rules confirmed by Castillitos administration:
 *   PD = pedidos (pending orders — demand pressure, NOT sales, NOT cash)
 *   AP = limpieza de pedidos (excluded from everything)
 *   Disponible = bodega inicial - reservas (always net of PD reservations)
 */
export const SAG_SOURCE_SEMANTICS: Record<SagSourceCode, SagSourceSemantics> = {
  OFICIAL: {
    label:                "Factura oficial",
    isSale:               true,
    affectsSalesVelocity: true,
    affectsDemand:        true,
    affectsProduction:    false, // real sale consumed the demand — production already happened
    affectsCoverage:      true,
    affectsAvailability:  true,
    affectsRevenue:       true,
    affectsCash:          true,
    canConvertToInvoice:  false, // already an invoice
    excludeFromAll:       false,
  },
  REMISION: {
    label:                "Remisión",
    isSale:               true,
    affectsSalesVelocity: true,
    affectsDemand:        true,
    affectsProduction:    false,
    affectsCoverage:      true,
    affectsAvailability:  true,
    affectsRevenue:       true,  // remision is recognized revenue in this context
    affectsCash:          true,
    canConvertToInvoice:  false,
    excludeFromAll:       false,
  },
  PD: {
    label:                "Pedidos",
    isSale:               false,  // NOT a completed sale
    affectsSalesVelocity: false,  // PD does not count toward historical velocity
    affectsDemand:        true,   // PD is active commercial demand
    affectsProduction:    true,   // PD pending orders drive production requirements
    affectsCoverage:      true,   // PD pending orders consume future coverage
    affectsAvailability:  false,  // reservas already netted in disponible
    affectsRevenue:       false,  // NOT revenue until invoiced
    affectsCash:          false,  // NOT cash until invoiced
    canConvertToInvoice:  true,   // expected lifecycle: PD → OFICIAL/REMISION
    excludeFromAll:       false,
  },
  AP: {
    label:                "Limpieza de pedidos",
    isSale:               false,
    affectsSalesVelocity: false,
    affectsDemand:        false,  // AP cleans / cancels orders — no demand
    affectsProduction:    false,
    affectsCoverage:      false,
    affectsAvailability:  false,
    affectsRevenue:       false,
    affectsCash:          false,
    canConvertToInvoice:  false,
    excludeFromAll:       true,   // AP must never appear in any calculation
  },
};

/**
 * Resolve a raw sagSourceType string to a known SagSourceCode.
 * Unknown codes are treated as OFICIAL (conservative fallback).
 */
export function resolveSagSourceCode(raw: string): SagSourceCode {
  const upper = raw.trim().toUpperCase();
  if (upper === "PD")      return "PD";
  if (upper === "AP")      return "AP";
  if (upper === "REMISION") return "REMISION";
  return "OFICIAL"; // OFICIAL is the safe default for unknown codes
}

/** True if this source contributes to sales velocity (OFICIAL or REMISION only) */
export function isSaleSource(code: SagSourceCode): boolean {
  return SAG_SOURCE_SEMANTICS[code].affectsSalesVelocity;
}

/** True if this source represents pending orders (PD only) */
export function isPedidosSource(code: SagSourceCode): boolean {
  return code === "PD";
}

/** True if this source must be completely excluded */
export function isExcludedSource(code: SagSourceCode): boolean {
  return SAG_SOURCE_SEMANTICS[code].excludeFromAll;
}

// ─── Type for raw Prisma row ───────────────────────────────────────────────────

export interface RawSaleRecordRow {
  productCode:   string | null;
  sellerName:    string;
  saleDate:      Date;
  amount:        { toNumber: () => number } | number; // Decimal or number
  units:         number | null;
  sagSourceType: string;
}

// ─── Sale hint normalizer ─────────────────────────────────────────────────────

/**
 * Normalize a raw SaleRecord row into a SagSaleHint.
 *
 * Returns null for:
 *   - Records without productCode (invoice-level aggregates)
 *   - AP source (limpieza de pedidos — excluded from all intelligence)
 *
 * PD records are included as sourceType "PD" — the velocity engine
 * will NOT count them toward dailyVelocity but will extract pendingOrders signals.
 */
export function normalizeSaleRecordToHint(
  raw: RawSaleRecordRow,
): SagSaleHint | null {
  if (!raw.productCode) return null;

  const sourceCode = resolveSagSourceCode(raw.sagSourceType);

  // AP = limpieza de pedidos → always excluded
  if (isExcludedSource(sourceCode)) return null;

  const amount =
    typeof raw.amount === "number"
      ? raw.amount
      : typeof (raw.amount as { toNumber?: () => number }).toNumber === "function"
        ? (raw.amount as { toNumber: () => number }).toNumber()
        : Number(raw.amount);

  // sourceCode is guaranteed not "AP" here (returned null above)
  return {
    refCode:       raw.productCode.trim().toUpperCase(),
    sellerSagName: raw.sellerName.trim(),
    saleDate:      raw.saleDate.toISOString().split("T")[0],
    amount,
    units:         raw.units,
    sourceType:    sourceCode as "OFICIAL" | "REMISION" | "PD",
  };
}

// ─── Operational availability normalizer ─────────────────────────────────────

/**
 * Normalize raw SAG availability fields into OperationalAvailability.
 *
 * Formula confirmed by Castillitos administration:
 *   availableForCases = bodegaInicial - reservas
 *
 * The "reservas" column in SAG corresponds to the PD (pedidos) quantity — items
 * reserved for pending orders. They must be netted out before computing coverage.
 */
export function normalizeOperationalAvailability(raw: {
  reference:           string;
  initialWarehouseQty: number;  // SAG "bodega inicial" / "inventario" column
  reservedQty:         number;  // SAG "reservas" / "pedidos" column (PD-sourced)
  source?:             "SAG" | "Excel";
}): OperationalAvailability {
  const availableForCases = Math.max(0, raw.initialWarehouseQty - raw.reservedQty);

  return {
    reference:           raw.reference.trim().toUpperCase(),
    initialWarehouseQty: raw.initialWarehouseQty,
    reservedQty:         raw.reservedQty,
    availableForCases,
    source:              raw.source ?? "SAG",
  };
}

// ─── Prisma query builders ────────────────────────────────────────────────────

/**
 * Build query args for loading SALE records (OFICIAL + REMISION).
 * These are completed transactions that drive velocity calculations.
 *
 * Usage (V2):
 *   const rows = await prisma.saleRecord.findMany(buildSaleHintQuery(orgId));
 *   const hints = rows.map(normalizeSaleRecordToHint).filter(Boolean);
 */
export function buildSaleHintQuery(orgId: string, daysBack = 30) {
  const since = new Date();
  since.setDate(since.getDate() - daysBack);

  return {
    where: {
      organizationId: orgId,
      productCode:    { not: null },
      saleDate:       { gte: since },
      // AP excluded at query level — never loaded for Maletas intelligence
      sagSourceType:  { in: ["OFICIAL", "REMISION"] as string[] },
    },
    select: {
      productCode:   true,
      sellerName:    true,
      saleDate:      true,
      amount:        true,
      units:         true,
      sagSourceType: true,
    },
    orderBy: { saleDate: "desc" as const },
  };
}

/**
 * Build query args for loading PEDIDOS records (PD source).
 * These represent pending orders — used for commercial demand pressure, NOT velocity.
 *
 * Usage (V2):
 *   const rows = await prisma.saleRecord.findMany(buildPedidosQuery(orgId));
 *   // Aggregate units by productCode → pendingOrdersMap
 */
export function buildPedidosQuery(orgId: string, daysBack = 30) {
  const since = new Date();
  since.setDate(since.getDate() - daysBack);

  return {
    where: {
      organizationId: orgId,
      productCode:    { not: null },
      saleDate:       { gte: since },
      sagSourceType:  "PD" as string,
    },
    select: {
      productCode: true,
      units:       true,
      amount:      true,
    },
  };
}

// ─── V2 activation stubs ─────────────────────────────────────────────────────

/**
 * V2 activation — uncomment when Prisma is ready.
 *
 * import { prisma } from "@/lib/prisma";
 *
 * export async function loadSagSaleHintsForMaletas(
 *   orgId: string,
 *   daysBack = 30,
 * ): Promise<SagSaleHint[]> {
 *   const rows = await prisma.saleRecord.findMany(buildSaleHintQuery(orgId, daysBack));
 *   return rows
 *     .map(normalizeSaleRecordToHint)
 *     .filter((h): h is SagSaleHint => h !== null);
 * }
 *
 * export async function loadPedidosMapForMaletas(
 *   orgId: string,
 *   daysBack = 30,
 * ): Promise<Map<string, number>> {
 *   const rows = await prisma.saleRecord.findMany(buildPedidosQuery(orgId, daysBack));
 *   const map = new Map<string, number>();
 *   for (const row of rows) {
 *     if (!row.productCode) continue;
 *     const ref  = row.productCode.trim().toUpperCase();
 *     const qty  = row.units ?? 1;
 *     map.set(ref, (map.get(ref) ?? 0) + qty);
 *   }
 *   return map;
 * }
 */

// ─── Vendor SAG name resolution ────────────────────────────────────────────────

/**
 * Build a lookup map from SAG seller name → SalesRep id.
 */
export function buildSellerNameLookup(
  vendorRegistry: Array<{ id: string; sagName: string | null }>,
): Map<string, string> {
  const lookup = new Map<string, string>();
  for (const rep of vendorRegistry) {
    if (rep.sagName) {
      lookup.set(rep.sagName.toUpperCase().trim(), rep.id);
    }
  }
  return lookup;
}
