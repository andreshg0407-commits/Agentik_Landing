/**
 * lib/operational-inventory/operational-inventory-status.ts
 *
 * Status helpers for the Operational Inventory Layer.
 *
 * These functions compute derived states from OperationalInventoryItem
 * without touching SAG directly.
 *
 * Sprint: AGENTIK-OPERATIONAL-INVENTORY-BRIDGE-01
 */

import type { OperationalInventoryItem } from "./operational-inventory-types";

// ─── Item-level status ────────────────────────────────────────────────────────

export type OperationalItemStatus =
  | "disponible"     // operationalAvailableQty > 0
  | "bajo_stock"     // operationalAvailableQty > 0 but <= 20% of physical
  | "agotado"        // operationalAvailableQty === 0
  | "sin_datos";     // physicalQty === 0 and no data

/**
 * Computes the operational status of a single inventory item.
 */
export function computeOperationalStatus(
  item: OperationalInventoryItem,
): OperationalItemStatus {
  if (item.physicalQty === 0 && item.operationalAvailableQty === 0) {
    return "sin_datos";
  }
  if (item.operationalAvailableQty === 0) return "agotado";
  const lowThreshold = Math.max(1, Math.round(item.physicalQty * 0.2));
  if (item.operationalAvailableQty <= lowThreshold) return "bajo_stock";
  return "disponible";
}

// ─── Coverage risk ────────────────────────────────────────────────────────────

export type CoverageRisk = "ok" | "riesgo" | "critico";

/**
 * Computes coverage risk for a reference given a minimum quantity threshold.
 *
 * ok      — operationalAvailableQty >= minQty
 * riesgo  — operationalAvailableQty > 0 but < minQty
 * critico — operationalAvailableQty === 0
 */
export function computeCoverageRisk(
  item:   OperationalInventoryItem,
  minQty: number,
): CoverageRisk {
  if (item.operationalAvailableQty === 0) return "critico";
  if (item.operationalAvailableQty < minQty) return "riesgo";
  return "ok";
}

// ─── Pressure level ──────────────────────────────────────────────────────────

export type PressureLevel = "alta" | "media" | "baja" | "ninguna";

/**
 * Computes the pressure level for a reference.
 *
 * alta    — depleted (0 units) or productionPressureQty > physicalQty * 0.5
 * media   — bajo_stock or portfoliosUnderPressure >= 2
 * baja    — portfoliosUnderPressure === 1 or approaching minimum
 * ninguna — no pressure
 */
export function computePressureLevel(
  item: OperationalInventoryItem,
): PressureLevel {
  if (item.operationalAvailableQty === 0 || item.portfoliosDepleted > 0) return "alta";
  if (item.portfoliosUnderPressure >= 2) return "alta";
  if (item.portfoliosUnderPressure === 1) return "media";
  const pct = item.physicalQty > 0
    ? item.operationalAvailableQty / item.physicalQty
    : 1;
  if (pct <= 0.2) return "media";
  if (pct <= 0.4) return "baja";
  return "ninguna";
}

// ─── Snapshot freshness ──────────────────────────────────────────────────────

/**
 * Returns a human-readable staleness label for a snapshot.
 */
export function formatSnapshotAge(snapshotAt: string | null): string {
  if (!snapshotAt) return "sin datos";
  const diffMs = Date.now() - new Date(snapshotAt).getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return "ahora mismo";
  if (diffMin < 60) return `hace ${diffMin} min`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `hace ${diffHr} h`;
  return `hace ${Math.floor(diffHr / 24)} d`;
}

// ─── Summary across all items ─────────────────────────────────────────────────

export interface OperationalInventorySummary {
  total:          number;
  disponible:     number;
  bajoStock:      number;
  agotado:        number;
  sinDatos:       number;
  /** 0–100: percentage of items with operationalAvailableQty > 0 */
  healthScore:    number;
}

export function computeInventorySummary(
  items: OperationalInventoryItem[],
): OperationalInventorySummary {
  let disponible = 0, bajoStock = 0, agotado = 0, sinDatos = 0;
  for (const item of items) {
    const s = computeOperationalStatus(item);
    if (s === "disponible")  disponible++;
    else if (s === "bajo_stock") bajoStock++;
    else if (s === "agotado")    agotado++;
    else                         sinDatos++;
  }
  const total = items.length;
  const healthScore = total > 0
    ? Math.round(((disponible + bajoStock) / total) * 100)
    : 0;
  return { total, disponible, bajoStock, agotado, sinDatos, healthScore };
}
