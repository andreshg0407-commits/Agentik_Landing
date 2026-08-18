/**
 * lib/comercial/importaciones/import-sag-b24-inventory.ts
 *
 * SAG B24 inventory authority for the Importaciones module.
 *
 * Queries vw_agentik_inventario via SAG SOAP for warehouse 24 (IMPORTACION).
 * Returns per-reference stock data: existencia, reservado, disponible,
 * and last movement date.
 *
 * This is the AUTHORITY for import stock — PIL is diagnostic only.
 * When SAG is unreachable, stockTruthState = SOURCE_DOWN and all
 * stock values fall back to null (fail-closed).
 *
 * Sprint: IMPORTS-CANONICAL-REPORTS-RUNTIME-05A2R1
 */

import { consultaSagJson } from "@/lib/connectors/pya/client";
import { getSagConnection } from "@/lib/connectors/pya/sag-source-router";

// ── Types ─────────────────────────────────────────────────────────────────

export type StockTruthState = "SAG_B24_CERTIFIED" | "SOURCE_DOWN";

export interface SagB24Stock {
  existencia: number;
  reservado: number;
  disponible: number;
  fechaUltimoMovimiento: string | null;
}

export interface SagB24InventoryResult {
  stockTruthState: StockTruthState;
  /** Map from CODIGO_PRODUCTO (reference code) → aggregated B24 stock */
  stockMap: Map<string, SagB24Stock>;
  /** Error message when SOURCE_DOWN */
  error: string | null;
}

// ── Raw SAG row shape ────────────────────────────────────────────────────

interface SagB24Row {
  CODIGO_PRODUCTO: string;
  BODEGA: string;
  EXISTENCIA: number;
  RESERVADO: number;
  DISPONIBLE: number;
  FECHA_ULTIMO_MOVIMIENTO: string | null;
}

// ── Query ────────────────────────────────────────────────────────────────

const SAG_B24_QUERY = `
  SELECT CODIGO_PRODUCTO, BODEGA, EXISTENCIA, RESERVADO, DISPONIBLE, FECHA_ULTIMO_MOVIMIENTO
  FROM vw_agentik_inventario
  WHERE BODEGA LIKE '24 -%'
`;

/**
 * Queries SAG vw_agentik_inventario for all B24 warehouse rows.
 * Aggregates by CODIGO_PRODUCTO (a reference may have multiple B24 sub-warehouses).
 *
 * Fail-closed: returns SOURCE_DOWN with empty map on any SAG failure.
 */
export async function loadSagB24Inventory(): Promise<SagB24InventoryResult> {
  try {
    const config = getSagConnection("CURRENT");
    const rows = (await consultaSagJson(config, SAG_B24_QUERY)) as unknown as SagB24Row[];

    const stockMap = new Map<string, SagB24Stock>();

    for (const row of rows) {
      const code = row.CODIGO_PRODUCTO;
      const existing = stockMap.get(code);
      const existencia = Number(row.EXISTENCIA ?? 0);
      const reservado = Number(row.RESERVADO ?? 0);
      const disponible = Number(row.DISPONIBLE ?? 0);
      const fecha = row.FECHA_ULTIMO_MOVIMIENTO ?? null;

      if (existing) {
        existing.existencia += existencia;
        existing.reservado += reservado;
        existing.disponible += disponible;
        // Keep the most recent movement date
        if (fecha && (!existing.fechaUltimoMovimiento || fecha > existing.fechaUltimoMovimiento)) {
          existing.fechaUltimoMovimiento = fecha;
        }
      } else {
        stockMap.set(code, {
          existencia,
          reservado,
          disponible,
          fechaUltimoMovimiento: fecha,
        });
      }
    }

    return { stockTruthState: "SAG_B24_CERTIFIED", stockMap, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : "SAG B24 query failed";
    console.error(`[IMPORT-SAG-B24] loadSagB24Inventory FAILED: ${message}`);
    return {
      stockTruthState: "SOURCE_DOWN",
      stockMap: new Map(),
      error: message,
    };
  }
}
