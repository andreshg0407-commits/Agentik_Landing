/**
 * lib/comercial/tiendas/store-snapshot-source-filters.ts
 *
 * AGENTIK-STORES-TRUTH-AUDIT-01 — F1 (ajuste por ley operativa confirmada).
 *
 * Normalización PURA de las filas PIL que el source-service aplica ANTES del
 * assembler, en este orden:
 *
 *   1. dedupePilRows — la sincronización SAG puede generar filas PIL
 *      duplicadas para el mismo (bodega, producto, variante). Se agregan por
 *      SUMA de unidades conservando el updatedAt más reciente (ley introducida
 *      por Opus en la integración de F1, aquí extraída a módulo puro
 *      certificable). Identidad del duplicado: warehousePk + productId
 *      (con referenceCode declarado como respaldo cuando no hay productId,
 *      para no fusionar productos distintos sin identidad) + variantKey.
 *
 *   2. filterOperationalRows — LEY OPERATIVA: el StoreSnapshot operativo
 *      excluye referencias con disponibilidad <= 0. Como las unidades vienen
 *      acotadas a >= 0 (clamp del source), excluir filas con units <= 0
 *      equivale exactamente a excluir referencias cuya disponibilidad total
 *      es <= 0: una referencia sobrevive si y solo si conserva al menos una
 *      fila con unidades positivas. El descarte se reporta (sin silencios).
 *
 * Este filtro es EXCLUSIVAMENTE de lectura: no elimina ni modifica ningún
 * registro histórico — ProductInventoryLevel queda intacto en la base.
 *
 * Certificación: __tests__/store-snapshot-source-filters.test.ts
 */

import type { SnapshotInventoryRow } from "./store-snapshot-assembler";

/** Identidad del duplicado PIL: bodega + producto (o referencia declarada) + variante. */
export function pilDedupKey(row: SnapshotInventoryRow): string {
  const productKey = row.productId ?? `code:${row.referenceCode}`;
  return `${row.warehousePk}::${productKey}::${row.variantKey}`;
}

export interface PilDedupResult {
  readonly rows: readonly SnapshotInventoryRow[];
  /** Filas absorbidas por suma (0 = fuente sin duplicados). */
  readonly mergedRowCount: number;
}

/**
 * Agrega filas PIL duplicadas: suma de unidades + updatedAt más reciente.
 * Pura y determinista; conserva el orden de primera aparición.
 */
export function dedupePilRows(rows: readonly SnapshotInventoryRow[]): PilDedupResult {
  const byKey = new Map<string, { row: SnapshotInventoryRow; units: number; updatedAt: string | null }>();
  let mergedRowCount = 0;

  for (const row of rows) {
    const key = pilDedupKey(row);
    const existing = byKey.get(key);
    if (existing) {
      mergedRowCount += 1;
      existing.units += row.units;
      if (row.updatedAt && (!existing.updatedAt || row.updatedAt > existing.updatedAt)) {
        existing.updatedAt = row.updatedAt;
      }
    } else {
      byKey.set(key, { row, units: row.units, updatedAt: row.updatedAt });
    }
  }

  return {
    rows: [...byKey.values()].map(acc => ({ ...acc.row, units: acc.units, updatedAt: acc.updatedAt })),
    mergedRowCount,
  };
}

export interface OperationalFilterResult {
  readonly rows: readonly SnapshotInventoryRow[];
  /** Filas excluidas por disponibilidad <= 0 (transparencia, sin silencios). */
  readonly excludedZeroAvailabilityCount: number;
}

/**
 * LEY OPERATIVA: excluye del universo operativo las filas sin disponibilidad
 * (units <= 0). Solo lectura — jamás toca registros históricos.
 * Aplicar SIEMPRE después de dedupePilRows (la disponibilidad que se juzga
 * es la agregada del duplicado, no la de una fila suelta).
 */
export function filterOperationalRows(rows: readonly SnapshotInventoryRow[]): OperationalFilterResult {
  const kept: SnapshotInventoryRow[] = [];
  let excluded = 0;
  for (const row of rows) {
    if (row.units > 0) kept.push(row);
    else excluded += 1;
  }
  return { rows: kept, excludedZeroAvailabilityCount: excluded };
}
