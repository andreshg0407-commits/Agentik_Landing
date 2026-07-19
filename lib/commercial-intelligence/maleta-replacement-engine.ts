/**
 * maleta-replacement-engine.ts
 *
 * CASTILLITOS-EXECUTIVE-REPORTS-01
 * Maleta (portfolio case) Replacement Intelligence Engine.
 *
 * Rules (from CEO):
 *   LATIN KIDS:   if existencia Bodega 01 <= 30 → MALLETA_REPLACEMENT_REQUIRED
 *   CASTILLITOS:  if existencia Bodega 01 <= 20 → MALLETA_REPLACEMENT_REQUIRED
 *
 * This engine:
 * - Evaluates inventory against SubLinea-specific thresholds
 * - Identifies which sellers currently have each reference in their maletas
 * - Produces replacement items with motivo + recomendacion
 * - Generates NO actions, NO notifications — only recommendations
 *
 * No Prisma. No React. No server-only. Pure domain logic.
 */

import type {
  AvailabilityRow,
  SellerWarehouse,
  MaletaReplacementRule,
  MaletaReplacementItem,
  MaletaReplacementReport,
} from "./availability-types";

// ── Default Rules ────────────────────────────────────────────────────────────

/** Castillitos replacement rules as defined by the CEO. */
export const CASTILLITOS_REPLACEMENT_RULES: MaletaReplacementRule[] = [
  { subLinea: "LATIN KIDS", threshold: 30 },
  { subLinea: "CASTILLITOS", threshold: 20 },
];

// ── Default Seller Warehouses ────────────────────────────────────────────────

/** Castillitos seller warehouse mapping. */
export const CASTILLITOS_SELLER_WAREHOUSES: SellerWarehouse[] = [
  { sellerId: "ORLANDO",     sellerName: "Orlando",     bodegaCode: "35" },
  { sellerId: "CARLOS_LEON", sellerName: "Carlos Leon", bodegaCode: "36" },
  { sellerId: "LUIS",        sellerName: "Luis",        bodegaCode: "37" },
  { sellerId: "NESTOR",      sellerName: "Nestor",      bodegaCode: "38" },
  { sellerId: "CARLOS_VILLA",sellerName: "Carlos Villa", bodegaCode: "39" },
];

// ── Seller Inventory Record ──────────────────────────────────────────────────

/** A record indicating a seller has a reference in their maleta. */
export interface SellerMaletaRecord {
  sellerId: string;
  sellerName: string;
  reference: string;
  quantity: number;
}

// ── Engine ───────────────────────────────────────────────────────────────────

/** Build the maleta replacement report. */
export function buildMaletaReplacementReport(opts: {
  orgSlug: string;
  /** Availability rows (already computed from Bodega 01). */
  availabilityRows: AvailabilityRow[];
  /** Which sellers have which references in their maletas. */
  sellerInventory: SellerMaletaRecord[];
  /** Replacement rules (defaults to Castillitos rules). */
  rules?: MaletaReplacementRule[];
}): MaletaReplacementReport {
  const {
    orgSlug,
    availabilityRows,
    sellerInventory,
    rules = CASTILLITOS_REPLACEMENT_RULES,
  } = opts;

  const items: MaletaReplacementItem[] = [];

  // Build a lookup: reference → list of seller names
  const sellerByRef = new Map<string, string[]>();
  for (const si of sellerInventory) {
    const list = sellerByRef.get(si.reference) ?? [];
    if (!list.includes(si.sellerName)) {
      list.push(si.sellerName);
    }
    sellerByRef.set(si.reference, list);
  }

  for (const row of availabilityRows) {
    // Find applicable rule for this SubLinea
    const rule = rules.find(r =>
      row.subLinea.toUpperCase().includes(r.subLinea.toUpperCase()),
    );
    if (!rule) continue;

    // Check if below threshold
    if (row.existenciaBodega01 <= rule.threshold) {
      const vendedores = sellerByRef.get(row.reference) ?? [];
      const motivo = row.existenciaBodega01 === 0
        ? `Sin existencia en Bodega 01 — referencia ${row.subLinea} agotada`
        : `Existencia (${row.existenciaBodega01}) por debajo del umbral ${row.subLinea} (${rule.threshold})`;

      const recomendacion = vendedores.length > 0
        ? `Retirar muestras de ${vendedores.length} vendedor(es): ${vendedores.join(", ")}. ` +
          `Existencia insuficiente para mantener maletas.`
        : row.existenciaBodega01 === 0
          ? "Sin existencia. Verificar estado de produccion."
          : `Existencia baja (${row.existenciaBodega01}). Monitorear reposicion.`;

      items.push({
        reference: row.reference,
        description: row.description,
        existenciaActual: row.existenciaBodega01,
        subLinea: row.subLinea,
        subGrupo: row.subGrupo,
        vendedoresAfectados: vendedores,
        motivo,
        recomendacion,
        ruleSubLinea: rule.subLinea,
        ruleThreshold: rule.threshold,
      });
    }
  }

  // Sort: items with sellers first, then by existencia ascending
  items.sort((a, b) => {
    const aHas = a.vendedoresAfectados.length > 0 ? 0 : 1;
    const bHas = b.vendedoresAfectados.length > 0 ? 0 : 1;
    if (aHas !== bHas) return aHas - bHas;
    return a.existenciaActual - b.existenciaActual;
  });

  return {
    orgSlug,
    computedAt: new Date().toISOString(),
    totalItemsReviewed: availabilityRows.length,
    totalRequiringReplacement: items.length,
    items,
    rules,
  };
}
