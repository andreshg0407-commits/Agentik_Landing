/**
 * lib/connectors/adapters/sag-pya-soap/orders/current-order-ingestion.ts
 *
 * AGENTIK-CURRENT-SAG-ORDER-INGESTION-01 — P0.
 *
 * Ruta DEDICADA de ingestión de pedidos cliente (PD) desde la fuente
 * CURRENT (LUDISAM), fuera del presupuesto de tiempo del cron compartido
 * (SAG_HEAVY_MODULES se salta orders/movements cuando elapsed > 60s).
 *
 * CONTRATO DE FUENTE — LOCKED:
 *   CUTOVER = 2026-07-21
 *   HISTORICAL (CASTILLO-ALZATE) válido SOLO hasta 2026-07-20.
 *   CURRENT (LUDISAM) autoritativo DESDE 2026-07-21.
 *   HISTORICAL JAMÁS suple/parchea/une registros >= 2026-07-21.
 *
 * Reutiliza las leyes existentes SIN duplicarlas:
 *   - getSagConnection("CURRENT")            (router dual — intocado)
 *   - mapSagOrder                            (semántica PD certificada: clase 4 + fuente PD)
 *   - customerOrderStorage.upsertMany        (idempotente por organizationId+erpMovId)
 *   - syncOrderLines                         (MOVIMIENTOS_ITEMS, idempotente por erpItemId)
 *
 * La única SQL propia es la selección PD-only con las MISMAS columnas del
 * query de movements certificado + filtro clase 4 + piso de fecha en el
 * cutover — un pull liviano (solo pedidos), determinista y reanudable.
 *
 * READ-ONLY contra SAG. Escribe únicamente CustomerOrderRecord/CustomerOrderLine.
 * SERVER ONLY.
 */

import "server-only";

import { consultaSagJson } from "@/lib/connectors/pya/client";
import { getSagConnection } from "@/lib/connectors/pya/sag-source-router";
import { mapSagOrder } from "@/lib/connectors/adapters/sag-pya-soap/mappers";
import { customerOrderStorage } from "@/lib/connectors/adapters/sag-pya-soap/storage";
import { syncOrderLines, type OrderLinesSyncMetrics } from "./sag-order-lines-sync";
import { CASTILLITOS_SOURCE_SEMANTIC_RULES } from "@/lib/sag/master-data/source-semantic-rules";
import type { RunContext, UnifiedSagOrder } from "@/lib/connectors/core/types";
import {
  CURRENT_CUTOVER,
  CURRENT_CUTOVER_ISO,
  resolveIngestionFloor,
  isCurrentEligible,
} from "./current-order-cutover-law";

export { CURRENT_CUTOVER, CURRENT_CUTOVER_ISO, resolveIngestionFloor, isCurrentEligible };

// ── Query PD-only (mismas columnas certificadas del movements query) ─────────

function buildCurrentPdQuery(floorIsoDate: string): string {
  return [
    "SELECT",
    "  m.ka_nl_movimiento, m.ka_ni_fuente, m.n_numero_documento,",
    "  m.ka_nl_tercero, m.sc_beneficiario, m.d_fecha_documento,",
    "  m.ss_moneda, m.ddt_fecha_new,",
    "  m.ka_nl_tercero_vend,",
    "  SUM(ISNULL(mi.n_valor, 0))      AS total_valor,",
    "  SUM(ISNULL(mi.n_iva, 0))        AS total_iva,",
    "  SUM(ISNULL(mi.n_descuento, 0))  AS total_descuento,",
    "  f.sc_cobrar_pagar, f.k_n_clase_fuente, f.ka_ni_forma_pago_fte,",
    "  MAX(t.n_nit)                     AS nit_tercero",
    "FROM MOVIMIENTOS m",
    "LEFT JOIN MOVIMIENTOS_ITEMS mi ON mi.ka_nl_movimiento = m.ka_nl_movimiento",
    "LEFT JOIN FUENTES f ON f.ka_ni_fuente = m.ka_ni_fuente",
    "LEFT JOIN TERCEROS t ON t.ka_nl_tercero = m.ka_nl_tercero",
    "WHERE m.sc_anulado = 'N'",
    "  AND f.k_n_clase_fuente = 4",
    `  AND m.d_fecha_documento >= '${floorIsoDate}'`,
    "GROUP BY",
    "  m.ka_nl_movimiento, m.ka_ni_fuente, m.n_numero_documento,",
    "  m.ka_nl_tercero, m.sc_beneficiario, m.d_fecha_documento,",
    "  m.ss_moneda, m.ddt_fecha_new, m.ka_nl_tercero_vend,",
    "  f.sc_cobrar_pagar, f.k_n_clase_fuente, f.ka_ni_forma_pago_fte",
    "ORDER BY m.ka_nl_movimiento",
  ].join(" ");
}

// ── Fuente → código (mismo registro semántico certificado del adapter) ───────

const FUENTE_TO_CODE = new Map(
  CASTILLITOS_SOURCE_SEMANTIC_RULES.map(r => [r.kaNiFuente, r.codigoFuente]),
);
function fuenteToCode(kaNiFuente: number): string | null {
  return FUENTE_TO_CODE.get(kaNiFuente) ?? null;
}

// ── Resultado ────────────────────────────────────────────────────────────────

export interface CurrentOrderIngestionResult {
  success: boolean;
  dryRun: boolean;
  floorDate: string;
  headersRead: number;
  headersEligible: number;
  headersRejectedPreCutover: number;
  headersImported: number;
  headersErrored: number;
  minOrderDate: string | null;
  maxOrderDate: string | null;
  lines: OrderLinesSyncMetrics | null;
  durationMs: number;
  error?: string;
}

// ── Ingestión dedicada ──────────────────────────────────────────────────────

export async function runCurrentOrderIngestion(opts: {
  organizationId: string;
  /** Reanudación: piso opcional; SIEMPRE se clampa al cutover. */
  sinceDate?: Date | null;
  /** true → lee la fuente pero no escribe nada. */
  dryRun?: boolean;
  /** true → omite el paso de líneas (solo headers). */
  skipLines?: boolean;
}): Promise<CurrentOrderIngestionResult> {
  const t0 = Date.now();
  const floor = resolveIngestionFloor(opts.sinceDate);
  const floorIso = floor.toISOString().slice(0, 10);

  // Router dual INTOCADO: la conexión SIEMPRE es CURRENT.
  const cfg = getSagConnection("CURRENT");

  // Anti-contaminación (gate A): si por configuración ambas fuentes apuntaran
  // a la misma base, esta ruta se niega a correr antes que mezclar períodos.
  try {
    const hist = getSagConnection("HISTORICAL");
    if (hist.database === cfg.database) {
      throw new Error(
        `[CURRENT-ORDER-INGESTION] CURRENT y HISTORICAL resuelven a la misma base (${cfg.database}) — contrato de cutover violado; abortado.`,
      );
    }
  } catch (e) {
    if ((e as Error).message.includes("contrato de cutover")) throw e;
    // HISTORICAL env ausente: aceptable — CURRENT sigue siendo CURRENT.
  }

  const result: CurrentOrderIngestionResult = {
    success: false,
    dryRun: !!opts.dryRun,
    floorDate: floorIso,
    headersRead: 0,
    headersEligible: 0,
    headersRejectedPreCutover: 0,
    headersImported: 0,
    headersErrored: 0,
    minOrderDate: null,
    maxOrderDate: null,
    lines: null,
    durationMs: 0,
  };

  try {
    // 1. Pull PD-only desde CURRENT (liviano — solo pedidos, no todo movements)
    const rawRows: unknown[] = await consultaSagJson(cfg, buildCurrentPdQuery(floorIso));
    result.headersRead = rawRows.length;

    // 2. Mapper certificado (clase 4 + fuente PD) + guardia de cutover
    const orders: UnifiedSagOrder[] = [];
    for (const row of rawRows) {
      const ord = mapSagOrder(row as Record<string, unknown>, opts.organizationId, fuenteToCode);
      if (!ord) continue;
      if (!isCurrentEligible(ord.orderDate)) { result.headersRejectedPreCutover++; continue; }
      orders.push(ord);
    }
    result.headersEligible = orders.length;
    for (const o of orders) {
      const d = o.orderDate.toISOString().slice(0, 10);
      if (!result.minOrderDate || d < result.minOrderDate) result.minOrderDate = d;
      if (!result.maxOrderDate || d > result.maxOrderDate) result.maxOrderDate = d;
    }

    // 3. Storage canónico (idempotente por organizationId+erpMovId — cero duplicados)
    if (!opts.dryRun && orders.length > 0) {
      const ctx = {
        runId: `current-order-ingestion-${Date.now()}`,
        connectorId: "current-order-ingestion",
        orgId: opts.organizationId,
        source: "sag_pya_soap",
        module: "orders",
      } as RunContext;
      const up = await customerOrderStorage.upsertMany(orders, ctx);
      result.headersImported = up.imported;
      result.headersErrored = up.errored;
    }

    // 4. Líneas CURRENT para headers >= cutover (idempotente por erpItemId)
    if (!opts.skipLines) {
      const lineResult = await syncOrderLines({
        organizationId: opts.organizationId,
        sagConfig: cfg,
        sagDatabase: cfg.database!,
        sinceDate: floor,
        onlyMissing: true,
        dryRun: opts.dryRun,
      });
      result.lines = lineResult.metrics;
    }

    result.success = result.headersErrored === 0;
  } catch (e) {
    result.error = (e as Error).message;
    result.success = false;
  }

  result.durationMs = Date.now() - t0;
  return result;
}
