/**
 * lib/castillitos/cash-kpis.ts
 *
 * SPRINT 1 — CORE CASH: KPI helpers de verdad financiera
 *
 * Pregunta que responde: ¿Dónde está el dinero?
 *
 * ─── Fuente de datos ────────────────────────────────────────────────────────
 *
 *   SaleRecord.comprobanteCode = k_sc_codigo_fuente (clave semántica SAG)
 *
 *   Los comprobantes R1/R2/A1/A2/B1-CP/RC-RA/AN se importan como SaleRecord
 *   via el pipeline SAG → SalesImportBatch → SaleRecord.
 *
 *   Clasificación de cada código: lib/castillitos/cash-sources.ts
 *   Nunca hardcodear códigos en este archivo — usar los Sets exportados.
 *
 * ─── Ley de separación F1/F2 ────────────────────────────────────────────────
 *
 *   recaudoF1 y recaudoF2 NUNCA se suman en la misma métrica.
 *   anticiposF1 y anticiposF2 se reportan por separado.
 *   Si una función recibe ambos universos, los devuelve desagregados.
 *
 * ─── Contrato de integridad ──────────────────────────────────────────────────
 *
 *   Si no hay datos para un KPI → amount: 0, count: 0, status: "no_data"
 *   Si el soporte técnico no existe aún → status: "pending_integration"
 *   Nunca retornar null sin explicación.
 *   Nunca inventar saldos que no existen en SaleRecord.
 *
 * ─── KPIs exportados ────────────────────────────────────────────────────────
 *
 *   getCashKpis(orgId, opts?)     → CashKpis    (resumen completo)
 *   getCashKpisByDate(orgId, date) → CashKpis   (día específico)
 *
 * ─── Uso esperado ────────────────────────────────────────────────────────────
 *
 *   Torre de Control (executive/page.tsx):
 *     cajaRecibidaHoy, recaudoF1Hoy, recaudoF2Hoy, cashHealthStatus
 *
 *   Módulo Finanzas (finance/page.tsx):
 *     anticiposPorAplicar, consignacionesPendientes
 *
 *   Conciliación Inteligente (reconciliation/):
 *     consignacionesPendientes, recibosTiendaPorConciliar, diferenciaConciliacion
 *
 *   Centro de Decisiones (alerts/page.tsx):
 *     cashHealthStatus, consignacionesPendientes (para alertas)
 */

import { prisma }             from "@/lib/prisma";
import {
  getExecutiveCashArray,
  getF1CollectionCodeArray,
  getF2CollectionCodeArray,
  getPendingDepositArray,
  getPendingApplicationArray,
  getReconciliationOnlyArray,
} from "@/lib/castillitos/cash-sources";

// ── Value types ───────────────────────────────────────────────────────────────

/**
 * Estado de disponibilidad de un KPI.
 *
 *   ok                 — dato calculado con data real
 *   no_data            — query exitosa pero sin registros (monto = 0)
 *   pending_integration — soporte técnico incompleto (retorna 0, no falsea)
 */
export type KpiStatus = "ok" | "no_data" | "pending_integration";

/** Valor de un KPI de caja. */
export interface CashKpiValue {
  /** Monto en COP (0 si no hay datos o pending_integration). */
  amount: number;
  /** Cantidad de documentos/comprobantes. */
  count:  number;
  /** Estado de disponibilidad del KPI. */
  status: KpiStatus;
  /** Nota opcional para debug / UI tooltip. */
  note?:  string;
}

/**
 * Semáforo global de salud de caja.
 *
 *   saludable  — no hay consignaciones ni anticipos pendientes significativos
 *   atencion   — hay pendientes pero dentro de rango tolerable
 *   critico    — consignaciones o anticipos viejos/altos; requiere intervención
 *   sin_datos  — no hay datos importados aún
 */
export type CashHealthStatus = "saludable" | "atencion" | "critico" | "sin_datos";

/** Resultado completo de getCashKpis(). */
export interface CashKpis {
  /** ¿Hay datos de comprobantes de caja para esta org? */
  hasData:                    boolean;
  currency:                   string;
  /** Fecha y hora del cálculo (UTC). */
  asOf:                       Date;
  /** Día de referencia de los KPIs "hoy". */
  referenceDate:              Date;

  // ── CAJA REAL (R1 + R2 + A1 + A2 + AN) ────────────────────────────────

  /**
   * Caja total recibida en el día de referencia.
   * Incluye F1 + F2 para visión de tesorería global.
   * Para CEO dashboard: separar usando recaudoF1Hoy y recaudoF2Hoy.
   */
  cajaRecibidaHoy:            CashKpiValue;

  /**
   * Recaudo F1 oficial del día (R1 + A1 + AN).
   * ÚNICA cifra que entra al headline ejecutivo de cobros oficiales.
   */
  recaudoF1Hoy:               CashKpiValue;

  /**
   * Recaudo F2 operativo del día (R2 + A2).
   * Separado de F1. NUNCA sumar directamente a recaudoF1Hoy.
   */
  recaudoF2Hoy:               CashKpiValue;

  // ── ANTICIPOS POR APLICAR (A1 + A2) ───────────────────────────────────

  /**
   * Anticipos F1 pendientes de aplicar a factura oficial (A1).
   * Son caja real pero NO cobro cerrado hasta cruzar con documento F1.
   */
  anticiposF1PorAplicar:      CashKpiValue;

  /**
   * Anticipos F2 pendientes de aplicar a remisión (A2).
   * Son caja real pero NO cobro cerrado hasta cruzar con documento F2.
   */
  anticiposF2PorAplicar:      CashKpiValue;

  /**
   * Total anticipos por aplicar (F1 + F2 combinados).
   * Para KPI "Anticipos por aplicar" en Finanzas/Tesorería.
   */
  anticiposPorAplicar:        CashKpiValue;

  // ── CONSIGNACIONES PENDIENTES (B1/B2/H1/H2/CP) ────────────────────────

  /**
   * Dinero recibido sin identificar (B1/B2/H1/H2/CP).
   * NUNCA contar como cobro cerrado.
   * Presentar como "pendiente por aplicar".
   * Alimenta Conciliación Inteligente.
   */
  consignacionesPendientes:   CashKpiValue;

  // ── RECIBOS DE TIENDA — SOLO CONCILIACIÓN (RC/RS/RG/RA) ───────────────

  /**
   * Abonos Sistecredito en tiendas pendientes de conciliar (RC/RS/RG/RA).
   * NO son venta. NO duplican cobros.
   * Solo visibles en Conciliación Inteligente.
   * Ventana: mes en curso.
   */
  recibosTiendaPorConciliar:  CashKpiValue;

  // ── DIFERENCIA DE CONCILIACIÓN (derivado) ─────────────────────────────

  /**
   * Total en limbo de conciliación = consignaciones + recibos tienda.
   * Representa dinero recibido que NO está formalmente cerrado.
   * Si = 0 → todo conciliado o sin datos.
   * Si > 0 → requiere acción en Conciliación Inteligente.
   */
  diferenciaConciliacion:     CashKpiValue;

  // ── SEMÁFORO EJECUTIVO ─────────────────────────────────────────────────

  /** Estado global de salud de caja. Para Torre de Control. */
  cashHealthStatus:           CashHealthStatus;

  /** Razón del cashHealthStatus (para tooltip / debug). */
  cashHealthReason:           string;
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function toNumber(d: unknown): number {
  if (d == null) return 0;
  if (typeof d === "number") return d;
  // Prisma Decimal → number
  if (typeof (d as { toNumber?: () => number }).toNumber === "function") {
    return (d as { toNumber: () => number }).toNumber();
  }
  return Number(d);
}

/** UTC start of a day (00:00:00.000). */
function dayStart(d: Date): Date {
  const out = new Date(d);
  out.setUTCHours(0, 0, 0, 0);
  return out;
}

/** UTC end of a day (23:59:59.999). */
function dayEnd(d: Date): Date {
  const out = new Date(d);
  out.setUTCHours(23, 59, 59, 999);
  return out;
}

/** First day of UTC month. */
function monthStart(d: Date): Date {
  const out = new Date(d);
  out.setUTCDate(1);
  out.setUTCHours(0, 0, 0, 0);
  return out;
}

// ── Core aggregate query ──────────────────────────────────────────────────────

/**
 * Agrega SaleRecord por comprobanteCode dentro de un conjunto de códigos
 * y opcionalmente dentro de un rango de fechas.
 *
 * Retorna amount (suma COP) y count (número de registros).
 * Si la query falla (tabla vacía, org sin datos): { amount: 0, count: 0 }.
 */
async function aggregateSaleRecords(
  organizationId: string,
  codes:          string[],
  from?:          Date,
  to?:            Date,
): Promise<{ amount: number; count: number }> {
  if (codes.length === 0) return { amount: 0, count: 0 };

  const dateFilter = from && to
    ? { saleDate: { gte: from, lte: to } }
    : from
      ? { saleDate: { gte: from } }
      : {};

  try {
    const r = await prisma.saleRecord.aggregate({
      where: {
        organizationId,
        comprobanteCode: { in: codes },
        ...dateFilter,
      },
      _sum:   { amount: true },
      _count: { id:     true },
    });
    return {
      amount: toNumber(r._sum.amount),
      count:  r._count.id,
    };
  } catch {
    // Table exists but org has no matching data — return 0
    return { amount: 0, count: 0 };
  }
}

/** Converts aggregate result to a CashKpiValue. */
function toKpiValue(
  r:    { amount: number; count: number },
  note?: string,
): CashKpiValue {
  const status: KpiStatus = r.count > 0 ? "ok" : "no_data";
  return { amount: r.amount, count: r.count, status, note };
}

/** KpiValue for features not yet connected to a data source. */
function pendingIntegration(note: string): CashKpiValue {
  return { amount: 0, count: 0, status: "pending_integration", note };
}

// ── Health status derivation ──────────────────────────────────────────────────

const PENDING_CRITICAL_THRESHOLD  = 50_000_000;  // $50M en limbo → crítico
const PENDING_ATTENTION_THRESHOLD =  5_000_000;  // $5M en limbo → atención

function deriveCashHealth(kpis: {
  hasData:                   boolean;
  consignacionesPendientes:  CashKpiValue;
  recibosTiendaPorConciliar: CashKpiValue;
  anticiposPorAplicar:       CashKpiValue;
}): { status: CashHealthStatus; reason: string } {
  if (!kpis.hasData) {
    return { status: "sin_datos", reason: "No hay comprobantes de caja importados para esta organización." };
  }

  const totalLimbo =
    kpis.consignacionesPendientes.amount +
    kpis.recibosTiendaPorConciliar.amount;

  const totalAnticipoPendiente = kpis.anticiposPorAplicar.amount;

  if (totalLimbo >= PENDING_CRITICAL_THRESHOLD) {
    return {
      status: "critico",
      reason: `${fmtCOP(totalLimbo)} en consignaciones + recibos de tienda sin conciliar. Requiere intervención inmediata.`,
    };
  }

  if (totalAnticipoPendiente >= PENDING_CRITICAL_THRESHOLD) {
    return {
      status: "critico",
      reason: `${fmtCOP(totalAnticipoPendiente)} en anticipos pendientes de aplicar. Riesgo de caja sin documento asociado.`,
    };
  }

  if (totalLimbo >= PENDING_ATTENTION_THRESHOLD || totalAnticipoPendiente >= PENDING_ATTENTION_THRESHOLD) {
    return {
      status: "atencion",
      reason: `${fmtCOP(totalLimbo + totalAnticipoPendiente)} en pendientes. Revisar antes de cierre del período.`,
    };
  }

  return {
    status: "saludable",
    reason: "Sin consignaciones pendientes significativas. Caja en orden.",
  };
}

function fmtCOP(n: number): string {
  if (n >= 1_000_000_000) return "$" + (n / 1_000_000_000).toFixed(1) + "B";
  if (n >= 1_000_000)     return "$" + (n / 1_000_000).toFixed(0) + "M";
  return "$" + new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 }).format(n);
}

// ── Options ───────────────────────────────────────────────────────────────────

export interface CashKpisOptions {
  /**
   * Fecha de referencia para los KPIs "hoy".
   * Default: ahora (UTC).
   */
  referenceDate?: Date;
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Calcula todos los KPIs de caja Sprint 1 para la organización.
 *
 * Fuente: SaleRecord filtrado por comprobanteCode (k_sc_codigo_fuente).
 * Clasificación de códigos: lib/castillitos/cash-sources.ts
 *
 * Nunca inventa datos. Si no hay soporte → status: "pending_integration".
 */
export async function getCashKpis(
  organizationId: string,
  opts?: CashKpisOptions,
): Promise<CashKpis> {
  const now  = new Date();
  const ref  = opts?.referenceDate ?? now;
  const today = { from: dayStart(ref), to: dayEnd(ref) };
  const thisMonth = { from: monthStart(ref), to: dayEnd(ref) };

  // ── Code sets (from cash-sources registry, never hardcoded here) ──────────
  const execCashCodes     = getExecutiveCashArray();          // R1 + R2 + A1 + A2 + AN
  const f1CollCodes       = getF1CollectionCodeArray();       // R1 + A1 + AN
  const f2CollCodes       = getF2CollectionCodeArray();       // R2 + A2
  const anticiposF1Codes  = getPendingApplicationArray()      // A1 + A2 — filter F1 below
    .filter(c => f1CollCodes.includes(c));
  const anticiposF2Codes  = getPendingApplicationArray()
    .filter(c => f2CollCodes.includes(c));
  const allAnticiposCodes = getPendingApplicationArray();     // A1 + A2
  const pendingDepCodes   = getPendingDepositArray();         // B1/B2/H1/H2/CP
  const reconOnlyCodes    = getReconciliationOnlyArray();     // RC/RS/RG/RA

  // ── Run all queries in parallel ───────────────────────────────────────────
  const [
    cajaTodayRaw,
    f1TodayRaw,
    f2TodayRaw,
    anticiposF1Raw,
    anticiposF2Raw,
    consignacionesRaw,
    recibosTiendaRaw,
    hasAnyRaw,
  ] = await Promise.all([
    // Caja total recibida hoy (F1 + F2, executive cash only)
    aggregateSaleRecords(organizationId, execCashCodes, today.from, today.to),
    // Recaudo F1 oficial hoy
    aggregateSaleRecords(organizationId, f1CollCodes, today.from, today.to),
    // Recaudo F2 operativo hoy
    aggregateSaleRecords(organizationId, f2CollCodes, today.from, today.to),
    // Anticipos F1 pendientes de aplicar (acumulado — sin fecha límite superior)
    aggregateSaleRecords(organizationId, anticiposF1Codes.length > 0 ? anticiposF1Codes : ["__none__"]),
    // Anticipos F2 pendientes de aplicar
    aggregateSaleRecords(organizationId, anticiposF2Codes.length > 0 ? anticiposF2Codes : ["__none__"]),
    // Consignaciones pendientes — acumulado (B1/B2/H1/H2/CP)
    aggregateSaleRecords(organizationId, pendingDepCodes),
    // Recibos tienda mes en curso (RC/RS/RG/RA)
    aggregateSaleRecords(organizationId, reconOnlyCodes, thisMonth.from, thisMonth.to),
    // ¿Existe algún comprobante de caja para esta org?
    aggregateSaleRecords(organizationId, [
      ...execCashCodes,
      ...pendingDepCodes,
      ...reconOnlyCodes,
    ]),
  ]);

  const hasData = hasAnyRaw.count > 0;

  // ── Compose individual KPIs ───────────────────────────────────────────────
  const cajaRecibidaHoy  = toKpiValue(cajaTodayRaw,
    "Suma de comprobantes R1+R2+A1+A2+AN con saleDate = hoy");
  const recaudoF1Hoy     = toKpiValue(f1TodayRaw,
    "Solo comprobantes F1 oficial (R1, A1, AN). Cifra para headline ejecutivo");
  const recaudoF2Hoy     = toKpiValue(f2TodayRaw,
    "Solo comprobantes F2 (R2, A2). Nunca sumar a recaudoF1Hoy");

  const anticiposF1 = toKpiValue(anticiposF1Raw,
    "Anticipos A1 (F1 oficial) pendientes de cruzar con factura");
  const anticiposF2 = toKpiValue(anticiposF2Raw,
    "Anticipos A2 (F2) pendientes de cruzar con remisión");
  const anticiposPorAplicar: CashKpiValue = {
    amount: anticiposF1.amount + anticiposF2.amount,
    count:  anticiposF1.count  + anticiposF2.count,
    status: (anticiposF1.status === "ok" || anticiposF2.status === "ok") ? "ok" : "no_data",
    note:   "F1 + F2 combinados. Ver anticiposF1PorAplicar / anticiposF2PorAplicar para separación.",
  };

  const consignacionesPendientes = toKpiValue(consignacionesRaw,
    "Consignaciones B1/B2/H1/H2/CP sin identificar. NO cobro cerrado. Puente de conciliación");
  const recibosTiendaPorConciliar = toKpiValue(recibosTiendaRaw,
    "Abonos RC/RS/RG/RA Sistecredito en tiendas. Mes en curso. Solo conciliación");

  // diferenciaConciliacion = total en limbo (consignaciones + recibos tienda)
  // Si ambos son 0 → todo conciliado o sin datos. No requiere tabla extra.
  const diferenciaAmount = consignacionesPendientes.amount + recibosTiendaPorConciliar.amount;
  const diferenciaCount  = consignacionesPendientes.count  + recibosTiendaPorConciliar.count;
  const diferenciaConciliacion: CashKpiValue = {
    amount: diferenciaAmount,
    count:  diferenciaCount,
    status: diferenciaCount > 0 ? "ok" : hasData ? "no_data" : "no_data",
    note:   "Total en limbo = consignaciones pendientes + recibos tienda sin conciliar. 0 = todo conciliado o sin datos.",
  };

  // ── Health status ─────────────────────────────────────────────────────────
  const health = deriveCashHealth({
    hasData,
    consignacionesPendientes,
    recibosTiendaPorConciliar,
    anticiposPorAplicar,
  });

  return {
    hasData,
    currency:                  "COP",
    asOf:                      now,
    referenceDate:             ref,
    cajaRecibidaHoy,
    recaudoF1Hoy,
    recaudoF2Hoy,
    anticiposF1PorAplicar:     anticiposF1,
    anticiposF2PorAplicar:     anticiposF2,
    anticiposPorAplicar,
    consignacionesPendientes,
    recibosTiendaPorConciliar,
    diferenciaConciliacion,
    cashHealthStatus:          health.status,
    cashHealthReason:          health.reason,
  };
}

/**
 * getCashKpisByDate — variante con fecha de referencia explícita.
 *
 * Útil para: informes históricos, comparación día a día, drill-down de fecha.
 */
export async function getCashKpisByDate(
  organizationId: string,
  date:           Date,
): Promise<CashKpis> {
  return getCashKpis(organizationId, { referenceDate: date });
}

// ── Utilidades adicionales para alertas y conciliación ───────────────────────

/**
 * Resumen rápido solo de consignaciones pendientes.
 * Para generador de alertas (org-alerts.ts) y Centro de Decisiones.
 */
export async function getConsignacionesPendientesResumen(
  organizationId: string,
): Promise<{ amount: number; count: number; hasData: boolean }> {
  const r = await aggregateSaleRecords(organizationId, getPendingDepositArray());
  return { amount: r.amount, count: r.count, hasData: r.count > 0 };
}

/**
 * Resumen rápido solo de recibos de tienda por conciliar (mes en curso).
 * Para Conciliación Inteligente — flujo "Banco vs Cobros" y "Cartera vs Recaudos".
 */
export async function getRecibosTiendaResumen(
  organizationId: string,
  from?:          Date,
): Promise<{ amount: number; count: number; hasData: boolean; byStore: Record<string, number> }> {
  const since = from ?? monthStart(new Date());
  const codes  = getReconciliationOnlyArray();

  if (codes.length === 0) return { amount: 0, count: 0, hasData: false, byStore: {} };

  try {
    const rows = await prisma.saleRecord.groupBy({
      by:    ["comprobanteCode"],
      where: {
        organizationId,
        comprobanteCode: { in: codes },
        saleDate: { gte: since },
      },
      _sum:   { amount: true },
      _count: { id:     true },
    });

    const byStore: Record<string, number> = {};
    let total = 0;
    let count = 0;

    for (const row of rows) {
      const amt = toNumber(row._sum.amount);
      byStore[row.comprobanteCode ?? "UNKNOWN"] = amt;
      total += amt;
      count += row._count.id;
    }

    return { amount: total, count, hasData: count > 0, byStore };
  } catch {
    return { amount: 0, count: 0, hasData: false, byStore: {} };
  }
}

/**
 * Desglose de anticipos por universo (F1 vs F2).
 * Para panel de Tesorería — muestra anticipos separados por naturaleza.
 */
export async function getAnticiposDesglose(
  organizationId: string,
): Promise<{
  f1: { amount: number; count: number };
  f2: { amount: number; count: number };
  total: { amount: number; count: number };
}> {
  const f1Codes = getPendingApplicationArray().filter(c =>
    getF1CollectionCodeArray().includes(c),
  );
  const f2Codes = getPendingApplicationArray().filter(c =>
    getF2CollectionCodeArray().includes(c),
  );

  const [f1, f2] = await Promise.all([
    aggregateSaleRecords(organizationId, f1Codes.length > 0 ? f1Codes : ["__none__"]),
    aggregateSaleRecords(organizationId, f2Codes.length > 0 ? f2Codes : ["__none__"]),
  ]);

  return {
    f1,
    f2,
    total: { amount: f1.amount + f2.amount, count: f1.count + f2.count },
  };
}
