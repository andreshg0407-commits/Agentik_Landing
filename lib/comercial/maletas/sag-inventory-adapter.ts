/**
 * lib/comercial/maletas/sag-inventory-adapter.ts
 *
 * SagInventoryItem — canonical live inventory view from SAG.
 *
 * Phase 5: SAG adapter layer.
 *
 * SAG source codes:
 *   OFICIAL   = factura emitida (sale, revenue, cash)
 *   REMISION  = remisión emitida (sale, no immediate cash)
 *   PD        = pedido pendiente (demand pressure, NOT revenue yet)
 *   AP        = limpieza de pedidos (cleanup, NEVER affects stock or production)
 *
 * Key invariants:
 *   disponible = bodega inicial (inventario) - reservas (pedidos)
 *   PD qty = reservas = pedidos column in SAG export
 *   AP NEVER affects disponible, never triggers production
 *
 * V1: Derived from MaletasOperationalContext (built from Excel + SAG adapter).
 * V2: Direct SAG query via Prisma InventorySnapshot model.
 *
 * Sprint: AGENTIK-COMERCIAL-MALETAS-FUNCTIONAL-REALIGNMENT-01
 */

import type { CommercialCaseLine, MaletasOperationalContext } from "./maletas-types";

// ─── Core inventory item ───────────────────────────────────────────────────────

export interface SagInventoryItem {
  /** SAG reference code — UPPERCASE */
  reference:           string;
  description:         string;
  line:                CommercialCaseLine;
  /** Operational category — V2: from SAG catalogue. V1: inferred from description */
  category:            string;
  /** Product type — V2: from SAG catalogue. V1: inferred */
  productType:         string;
  size?:               string;
  color?:              string;

  // ── SAG availability fields ──────────────────────────────────────────────
  /** bodega inicial — full warehouse quantity before reservations */
  initialWarehouseQty: number;
  /** reservas — quantities reserved for PD (pending) orders */
  reservedQty:         number;
  /** disponible operativo = initialWarehouseQty - reservedQty */
  availableForCases:   number;
  /** SAG PD source: pending commercial orders that will consume stock */
  pendingPDQty:        number;
  /**
   * SAG AP source: limpieza de pedidos.
   * NEVER triggers production alerts. NEVER reduces availability.
   * Tracked for audit only.
   */
  apCleanupQty:        number;
}

// ─── Category/type inference from description ──────────────────────────────────
// V1 heuristic — V2 replaces with SAG catalogue lookup.
// Exported so other modules (API routes, operational inventory loaders) can reuse.

export function inferCategory(description: string): string {
  const upper = description.toUpperCase();
  if (upper.includes("BEBE") && upper.includes("NIÑA")) return "NIÑA BEBE";
  if (upper.includes("BEBE") && upper.includes("NIÑO")) return "NIÑO BEBE";
  if (upper.includes("KIDS") && upper.includes("NIÑA")) return "NIÑA KIDS";
  if (upper.includes("KIDS") && upper.includes("NIÑO")) return "NIÑO KIDS";
  if (upper.includes("NIÑA")) return "NIÑA";
  if (upper.includes("NIÑO")) return "NIÑO";
  if (upper.includes("BEBE")) return "BEBE";
  return "GENERAL";
}

export function inferProductType(description: string): string {
  const upper = description.toUpperCase();
  if (upper.includes("PIJAMA")) return "PIJAMA";
  if (upper.includes("VESTIDO")) return "VESTIDO";
  if (upper.includes("CONJUNTO")) return "CONJUNTO";
  if (upper.includes("BLUSA")) return "BLUSA";
  if (upper.includes("BUZO") || upper.includes("CAMIBUSO")) return "BUZO/CAMIBUSO";
  if (upper.includes("CAMISETA")) return "CAMISETA";
  if (upper.includes("POLO")) return "POLO";
  if (upper.includes("MAMELUCO")) return "MAMELUCO";
  return "OTRO";
}

// ─── Context bridge (Phase 5 — V1) ────────────────────────────────────────────
//
// Reconstructs SagInventoryItem[] from MaletasOperationalContext.
// Works because the context encodes the same SAG data:
//   CaseItem.currentUnits           = disponible (= inventario - pedidos)
//   CoverageSignal.pendingOrdersQty = pedidos (SAG PD reservas)
//
// Derivation:
//   pendingPDQty     = coverageSignal.pendingOrdersQty ?? 0
//   reservedQty      = pendingPDQty  (pedidos = reservas)
//   availableForCases = item.currentUnits
//   initialWarehouseQty = availableForCases + reservedQty
//   apCleanupQty     = 0  (AP excluded at normalizer — never reaches context)

export function deriveSagInventoryFromContext(
  context: MaletasOperationalContext,
): SagInventoryItem[] {
  const intel = context.intelligence;

  // Coverage map for PD qty lookup
  const covByRef = new Map<string, number>();
  for (const cov of intel?.coverage ?? []) {
    covByRef.set(cov.refCode.toUpperCase(), cov.pendingOrdersQty ?? 0);
  }

  // Deduplicate: one SagInventoryItem per reference (not per rep assignment)
  const seen = new Set<string>();
  const items: SagInventoryItem[] = [];

  for (const item of context.items) {
    const refKey = item.reference.toUpperCase();
    if (seen.has(refKey)) continue;
    seen.add(refKey);

    const pendingPDQty     = covByRef.get(refKey) ?? 0;
    const reservedQty      = pendingPDQty;
    const availableForCases = Math.max(0, item.currentUnits);
    const initialWarehouseQty = availableForCases + reservedQty;

    items.push({
      reference:           item.reference.toUpperCase(),
      description:         item.description,
      line:                item.line,
      category:            inferCategory(item.description),
      productType:         inferProductType(item.description),
      initialWarehouseQty,
      reservedQty,
      availableForCases,
      pendingPDQty,
      apCleanupQty:        0, // AP excluded upstream — never in context
    });
  }

  return items;
}

/**
 * Build a lookup map: UPPERCASE reference → SagInventoryItem.
 * Used by alert engine and case status engine for O(1) access.
 */
export function buildInventoryMap(
  items: SagInventoryItem[],
): Map<string, SagInventoryItem> {
  const map = new Map<string, SagInventoryItem>();
  for (const item of items) {
    map.set(item.reference.toUpperCase(), item);
  }
  return map;
}
