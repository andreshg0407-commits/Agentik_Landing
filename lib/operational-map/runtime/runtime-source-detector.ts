/**
 * lib/operational-map/runtime/runtime-source-detector.ts
 *
 * Runtime Source Detector — AGENTIK-SAG-RUNTIME-SOURCE-HYDRATION-01
 *
 * INTERNAL ONLY: SUPER_ADMIN / AGENTIK_ADMIN
 *
 * Detects what real data already exists in Prisma for each operational KPI.
 * This solves the "Sin fuente" false negative: many KPIs already have partial
 * or full data from previous integrations, dry runs, or snapshots.
 *
 * Architecture:
 *   1. Run O(12) aggregate queries across all relevant Prisma models.
 *   2. Map results to RuntimeModelStatus per model.
 *   3. Use KPI_RUNTIME_BINDINGS to produce per-KPI RuntimeDetectionResult[].
 *
 * Critical rule: runtime detection ≠ certification.
 *   - runtime_detected  → data exists, needs DBA certification
 *   - connected_partial → integration exists but is partial (e.g. CSV import)
 *   - snapshot_detected → snapshot model has data
 *   - used_by_agentik   → Agentik actively uses this data for decisions
 */

import { prisma } from "@/lib/prisma";
import type { KpiSourceValidationStatus, KpiSourceOrigin } from "@/lib/operational-map/certification/operational-kpi-source-service";

// ─── Types ────────────────────────────────────────────────────────────────────

export type RuntimeModelStatus = {
  model:         string;
  provider:      "sag" | "crm" | "bank" | "agentik";
  rowCount:      number;
  lastSyncAt:    Date | null;
  status:        "has_data" | "empty" | "unavailable";
  internalModule: string;
  limitationNote?: string;
};

export type RuntimeKpiBinding = {
  model:          string;
  provider:       "sag" | "crm" | "bank" | "agentik";
  sourceName:     string;
  internalModule: string;
  confidence:     number;
  sourceType:     string;
  limitationNote?: string;
};

export type RuntimeDetectionResult = {
  kpiKey:            string;
  sources:           Array<RuntimeKpiBinding & {
    rowCount:          number;
    lastSyncAt:        Date | null;
    detectedStatus:    RuntimeModelStatus["status"];
    validationStatus:  KpiSourceValidationStatus;
    sourceOrigin:      KpiSourceOrigin;
  }>;
};

// ─── KPI → Runtime Model Bindings (FASE 8) ───────────────────────────────────

const KPI_RUNTIME_BINDINGS: Record<string, RuntimeKpiBinding[]> = {
  // ── CRM — CRMQuote / CRMQuoteLine ──────────────────────────────────────────
  pedidos_dia: [
    { model: "CRMQuote", provider: "crm", sourceName: "CRM Pedidos (CRMQuote)", internalModule: "Pedidos CRM", sourceType: "agentik_model", confidence: 75 },
  ],
  pedidos_dia_crm: [
    { model: "CRMQuote", provider: "crm", sourceName: "CRM Pedidos (CRMQuote)", internalModule: "Pedidos CRM", sourceType: "agentik_model", confidence: 85 },
  ],
  pedidos_dia_consolidado: [
    { model: "CRMQuote", provider: "crm", sourceName: "CRM Pedidos Consolidado (CRMQuote)", internalModule: "Pedidos consolidados", sourceType: "agentik_model", confidence: 75 },
  ],
  pedidos_pendientes_despacho: [
    { model: "CRMQuote", provider: "crm", sourceName: "CRM Pedidos Pendientes (CRMQuote)", internalModule: "Pedidos pendientes despacho", sourceType: "agentik_model", confidence: 70 },
  ],
  pedido_en_curso: [
    { model: "CRMQuote", provider: "crm", sourceName: "CRM Pedido Activo (CRMQuote)", internalModule: "CRM Pedido en curso", sourceType: "agentik_model", confidence: 70 },
  ],
  historial_pedidos: [
    { model: "CRMQuote", provider: "crm", sourceName: "Historial Pedidos CRM (CRMQuote)", internalModule: "Histórico pedidos CRM", sourceType: "agentik_model", confidence: 70 },
  ],
  score_demanda: [
    { model: "CRMQuoteLine", provider: "crm", sourceName: "Demanda CRM (CRMQuoteLine)", internalModule: "Líneas pedido CRM", sourceType: "agentik_model", confidence: 65 },
    { model: "CommercialCoverageSnapshot", provider: "agentik", sourceName: "Score Demanda Maletas (CommercialCoverageSnapshot)", internalModule: "Cobertura maletas", sourceType: "agentik_model", confidence: 70 },
  ],
  presion_demanda: [
    { model: "CRMQuoteLine", provider: "crm", sourceName: "Presión Demanda CRM (CRMQuoteLine)", internalModule: "Demanda CRM", sourceType: "agentik_model", confidence: 65 },
    { model: "CommercialCoverageSnapshot", provider: "agentik", sourceName: "Presión Demanda Maletas (CommercialCoverageSnapshot)", internalModule: "Cobertura maletas", sourceType: "agentik_model", confidence: 70 },
  ],
  cartera_cliente: [
    { model: "CustomerProfile", provider: "crm", sourceName: "Clientes CRM (CustomerProfile)", internalModule: "Clientes CRM", sourceType: "agentik_model", confidence: 60 },
  ],
  cupo_credito_restante: [
    { model: "CustomerProfile", provider: "crm", sourceName: "Cupo Crédito Clientes (CustomerProfile)", internalModule: "Crédito CRM", sourceType: "agentik_model", confidence: 55 },
  ],
  score_riesgo_cobranza: [
    { model: "CustomerProfile", provider: "crm", sourceName: "Riesgo Cobranza (CustomerProfile)", internalModule: "Scoring clientes CRM", sourceType: "agentik_model", confidence: 55 },
  ],
  reps_activos_hoy: [
    { model: "CRMQuote", provider: "crm", sourceName: "Reps Activos CRM (CRMQuote)", internalModule: "Actividad vendedores CRM", sourceType: "agentik_model", confidence: 60 },
  ],
  ultima_visita_rep: [
    { model: "CRMQuote", provider: "crm", sourceName: "Última Actividad Rep CRM (CRMQuote)", internalModule: "Historial actividad CRM", sourceType: "agentik_model", confidence: 55 },
  ],
  visitas_registradas_hoy: [
    { model: "CRMQuote", provider: "crm", sourceName: "Actividad Hoy CRM (CRMQuote)", internalModule: "Actividad diaria CRM", sourceType: "agentik_model", confidence: 55 },
  ],

  // ── SAG Sales — SalesImportBatch (primary fallback) + SaleRecord (if loaded) ─
  // SalesImportBatch is the canonical evidence that SAG CSV data was ever imported.
  // SaleRecord may have rows OR may be empty if batches ran but records were trimmed.
  ventas_dia_fuente1: [
    { model: "SalesImportBatch", provider: "sag", sourceName: "Lotes CSV SAG (SalesImportBatch)", internalModule: "SAG import ventas", sourceType: "agentik_model", confidence: 80,
      limitationNote: "Cargado via CSV histórico. Tabla SAG directa pendiente confirmar con DBA." },
    { model: "SaleRecord", provider: "sag", sourceName: "Ventas SAG (SaleRecord)", internalModule: "SAG import ventas", sourceType: "agentik_model", confidence: 85,
      limitationNote: "Cargado via CSV histórico. Tabla SAG directa pendiente confirmar con DBA." },
  ],
  ventas_brutas_fuente1: [
    { model: "SalesImportBatch", provider: "sag", sourceName: "Lotes CSV SAG Brutas (SalesImportBatch)", internalModule: "SAG import ventas brutas", sourceType: "agentik_model", confidence: 80,
      limitationNote: "Import CSV SAG. Sin ODBC directo todavía." },
    { model: "SaleRecord", provider: "sag", sourceName: "Ventas Brutas SAG (SaleRecord)", internalModule: "SAG import ventas brutas", sourceType: "agentik_model", confidence: 85,
      limitationNote: "Import CSV SAG. Sin ODBC directo todavía." },
  ],
  ventas_netas: [
    { model: "SalesImportBatch", provider: "sag", sourceName: "Lotes CSV SAG Netas (SalesImportBatch)", internalModule: "SAG import ventas netas", sourceType: "agentik_model", confidence: 75 },
    { model: "SaleRecord", provider: "sag", sourceName: "Ventas Netas SAG (SaleRecord)", internalModule: "SAG import ventas netas", sourceType: "agentik_model", confidence: 80 },
  ],
  margen_bruto: [
    { model: "SalesImportBatch", provider: "sag", sourceName: "Lotes CSV SAG Margen (SalesImportBatch)", internalModule: "SAG import margen", sourceType: "agentik_model", confidence: 60 },
    { model: "SaleRecord", provider: "sag", sourceName: "Costo/Margen SAG (SaleRecord)", internalModule: "SAG import margen", sourceType: "agentik_model", confidence: 65 },
  ],
  costo_ventas: [
    { model: "SalesImportBatch", provider: "sag", sourceName: "Lotes CSV SAG Costo (SalesImportBatch)", internalModule: "SAG import costo", sourceType: "agentik_model", confidence: 60 },
    { model: "SaleRecord", provider: "sag", sourceName: "Costo Ventas SAG (SaleRecord)", internalModule: "SAG import costo", sourceType: "agentik_model", confidence: 65 },
  ],

  // ── SAG Collections — CollectionRecord ─────────────────────────────────────
  recaudos_dia: [
    { model: "CollectionRecord", provider: "sag", sourceName: "Recaudos SAG (CollectionRecord)", internalModule: "Recaudos SAG", sourceType: "agentik_model", confidence: 80 },
  ],
  recaudos_dia_tesoreria: [
    { model: "CollectionRecord", provider: "sag", sourceName: "Recaudos Tesorería SAG (CollectionRecord)", internalModule: "Recaudos tesorería SAG", sourceType: "agentik_model", confidence: 80 },
  ],
  cartera_cobrar_entradas: [
    { model: "CollectionRecord", provider: "sag", sourceName: "Cobros SAG (CollectionRecord)", internalModule: "Cobros SAG activos", sourceType: "agentik_model", confidence: 75 },
  ],
  cartera_reconocida: [
    { model: "CollectionRecord", provider: "sag", sourceName: "Cartera SAG (CollectionRecord)", internalModule: "Cartera reconocida SAG", sourceType: "agentik_model", confidence: 70 },
  ],
  cartera_vencida_total: [
    { model: "CollectionRecord", provider: "sag", sourceName: "Cartera Vencida SAG (CollectionRecord)", internalModule: "Cartera vencida SAG", sourceType: "agentik_model", confidence: 70 },
  ],
  saldo_vencido_cliente: [
    { model: "CollectionRecord", provider: "sag", sourceName: "Saldo Vencido SAG (CollectionRecord)", internalModule: "Saldo vencido por cliente SAG", sourceType: "agentik_model", confidence: 70 },
  ],
  dias_mora_promedio: [
    { model: "CollectionRecord", provider: "sag", sourceName: "Mora SAG (CollectionRecord)", internalModule: "Días mora SAG", sourceType: "agentik_model", confidence: 70 },
  ],
  score_riesgo_mora: [
    { model: "CollectionRecord", provider: "sag", sourceName: "Scoring Mora SAG (CollectionRecord)", internalModule: "Scoring mora SAG", sourceType: "agentik_model", confidence: 60 },
  ],
  tasa_recuperacion: [
    { model: "CollectionRecord", provider: "sag", sourceName: "Tasa Recuperación SAG (CollectionRecord)", internalModule: "Recuperación SAG", sourceType: "agentik_model", confidence: 65 },
  ],
  historial_pagos: [
    { model: "CollectionRecord", provider: "sag", sourceName: "Historial Cobros SAG (CollectionRecord)", internalModule: "Historial cobros SAG", sourceType: "agentik_model", confidence: 65 },
  ],

  // ── SAG Payments — PaymentRecord ────────────────────────────────────────────
  pagos_programados_7d: [
    { model: "PaymentRecord", provider: "sag", sourceName: "Pagos SAG (PaymentRecord)", internalModule: "Pagos programados SAG", sourceType: "agentik_model", confidence: 60 },
  ],
  promesas_pago_activas: [
    { model: "PaymentRecord", provider: "sag", sourceName: "Promesas Pago SAG (PaymentRecord)", internalModule: "Promesas de pago SAG", sourceType: "agentik_model", confidence: 55 },
  ],

  // ── Agentik / Maletas — CommercialCoverageSnapshot ─────────────────────────
  tasa_cobertura: [
    { model: "CommercialCoverageSnapshot", provider: "agentik", sourceName: "Cobertura Maletas (CommercialCoverageSnapshot)", internalModule: "Cobertura Maletas Comerciales", sourceType: "agentik_model", confidence: 85 },
  ],
  cobertura_ref: [
    { model: "CommercialCoverageSnapshot", provider: "agentik", sourceName: "Cobertura Referencia (CommercialCoverageSnapshot)", internalModule: "Cobertura por referencia", sourceType: "agentik_model", confidence: 85 },
  ],
  dias_cobertura_promedio: [
    { model: "CommercialCoverageSnapshot", provider: "agentik", sourceName: "Días Cobertura (CommercialCoverageSnapshot)", internalModule: "Días cobertura promedio", sourceType: "agentik_model", confidence: 85 },
  ],
  disponibilidad_ref: [
    { model: "CommercialCoverageSnapshot", provider: "agentik", sourceName: "Disponibilidad Referencia (CommercialCoverageSnapshot)", internalModule: "Disponibilidad por ref", sourceType: "agentik_model", confidence: 85 },
  ],
  score_cobertura: [
    { model: "CommercialCoverageSnapshot", provider: "agentik", sourceName: "Score Cobertura (CommercialCoverageSnapshot)", internalModule: "Score cobertura maletas", sourceType: "agentik_model", confidence: 85 },
  ],
  score_salud_inventario: [
    { model: "CommercialCoverageSnapshot", provider: "agentik", sourceName: "Salud Inventario (CommercialCoverageSnapshot)", internalModule: "Salud inventario maletas", sourceType: "agentik_model", confidence: 80 },
  ],
  velocidad_venta: [
    { model: "CommercialCoverageSnapshot", provider: "agentik", sourceName: "Velocidad Venta (CommercialCoverageSnapshot)", internalModule: "Velocidad venta diaria", sourceType: "agentik_model", confidence: 75 },
  ],
  materias_primas_stock: [
    { model: "CommercialCoverageSnapshot", provider: "agentik", sourceName: "Stock Maletas (CommercialCoverageSnapshot)", internalModule: "Inventario maletas", sourceType: "agentik_model", confidence: 70 },
  ],

  // ── Banking — BankMovement / BankSyncSession ────────────────────────────────
  disponible_banco_hoy: [
    { model: "BankMovement", provider: "bank", sourceName: "Movimientos Banco (BankMovement)", internalModule: "Movimientos bancarios", sourceType: "agentik_model", confidence: 75 },
  ],
  saldo_cuentas_bancarias: [
    { model: "BankMovement", provider: "bank", sourceName: "Saldo Cuentas (BankMovement)", internalModule: "Saldo cuentas bancarias", sourceType: "agentik_model", confidence: 80 },
  ],
  posicion_neta_liquidez: [
    { model: "BankMovement", provider: "bank", sourceName: "Posición Neta (BankMovement)", internalModule: "Posición neta liquidez", sourceType: "agentik_model", confidence: 70 },
  ],
  conciliacion_bancaria_pendiente: [
    { model: "BankSyncSession", provider: "bank", sourceName: "Sesiones Banco (BankSyncSession)", internalModule: "Sesiones sincronización banco", sourceType: "agentik_model", confidence: 70 },
  ],
  liquidez_operativa_dia: [
    { model: "BankMovement", provider: "bank", sourceName: "Liquidez Banco (BankMovement)", internalModule: "Liquidez diaria banco", sourceType: "agentik_model", confidence: 70 },
    { model: "FinancialRuntimeSnapshot", provider: "agentik", sourceName: "Runtime Financiero (FinancialRuntimeSnapshot)", internalModule: "Runtime financiero Agentik", sourceType: "agentik_model", confidence: 65 },
  ],
  flujo_caja_30d: [
    { model: "BankMovement", provider: "bank", sourceName: "Flujo Caja Banco (BankMovement)", internalModule: "Flujo de caja 30d", sourceType: "agentik_model", confidence: 60 },
  ],

  // ── Financial Runtime — FinancialRuntimeSnapshot ────────────────────────────
  ebitda_estimado: [
    { model: "FinancialRuntimeSnapshot", provider: "agentik", sourceName: "EBITDA Runtime (FinancialRuntimeSnapshot)", internalModule: "Runtime financiero", sourceType: "agentik_model", confidence: 55 },
  ],
  ingresos_diferidos: [
    { model: "FinancialRuntimeSnapshot", provider: "agentik", sourceName: "Ingresos Diferidos Runtime (FinancialRuntimeSnapshot)", internalModule: "Runtime financiero", sourceType: "agentik_model", confidence: 50 },
  ],
  obligaciones_financieras: [
    { model: "FinancialRuntimeSnapshot", provider: "agentik", sourceName: "Obligaciones Runtime (FinancialRuntimeSnapshot)", internalModule: "Runtime financiero", sourceType: "agentik_model", confidence: 50 },
  ],

  // ── Reconciliation ──────────────────────────────────────────────────────────
  cierre_mensual: [
    { model: "ReconciliationSession", provider: "agentik", sourceName: "Reconciliación (ReconciliationSession)", internalModule: "Motor reconciliación", sourceType: "agentik_model", confidence: 65 },
  ],

  // ── Operational Reservations ────────────────────────────────────────────────
  despachos_transito: [
    { model: "OperationalReservation", provider: "agentik", sourceName: "Reservas Operacionales (OperationalReservation)", internalModule: "Reservas despacho", sourceType: "agentik_model", confidence: 70 },
  ],
  despachos_en_transito: [
    { model: "OperationalReservation", provider: "agentik", sourceName: "Reservas en Tránsito (OperationalReservation)", internalModule: "Reservas en tránsito", sourceType: "agentik_model", confidence: 70 },
  ],
  pedidos_pendientes_sync_sag: [
    { model: "OperationalReservation", provider: "agentik", sourceName: "Sync SAG Reservas (OperationalReservation)", internalModule: "Pendientes sync SAG", sourceType: "agentik_model", confidence: 60 },
  ],
};

// ─── Model probes ─────────────────────────────────────────────────────────────

type ModelProbeResult = { rowCount: number; lastSyncAt: Date | null };

async function probeModel(
  modelName: string,
  orgId:     string,
): Promise<ModelProbeResult> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const delegate = (prisma as any)[modelName.charAt(0).toLowerCase() + modelName.slice(1)];
    if (!delegate) return { rowCount: 0, lastSyncAt: null };

    const count = await delegate.count({ where: { organizationId: orgId } });
    if (count === 0) return { rowCount: 0, lastSyncAt: null };

    // Try to find the most recent row — different models use different timestamp field names
    let lastSyncAt: Date | null = null;
    const timestampFields = ["snapshotAt", "syncedAt", "createdAt", "importedAt", "collectionDate", "issuedAt", "generatedAt", "startedAt"];
    for (const field of timestampFields) {
      try {
        const latest = await delegate.findFirst({
          where:   { organizationId: orgId },
          orderBy: { [field]: "desc" as const },
          select:  { [field]: true },
        });
        if (latest?.[field]) {
          lastSyncAt = latest[field] as Date;
          break;
        }
      } catch { /* field doesn't exist on this model */ }
    }

    return { rowCount: count, lastSyncAt };
  } catch {
    return { rowCount: 0, lastSyncAt: null };
  }
}

// ─── Main detector ────────────────────────────────────────────────────────────

/**
 * Detects which runtime data sources already exist in Prisma for an org.
 * Runs O(unique-models) queries, not one per KPI.
 */
export async function detectRuntimeSources(
  organizationId: string,
): Promise<RuntimeDetectionResult[]> {
  // 1. Collect unique models referenced by any KPI
  const modelSet = new Set<string>();
  for (const bindings of Object.values(KPI_RUNTIME_BINDINGS)) {
    for (const b of bindings) modelSet.add(b.model);
  }

  // 2. Probe each model once
  const modelStatusMap = new Map<string, RuntimeModelStatus>();
  await Promise.all(
    Array.from(modelSet).map(async (model) => {
      const result = await probeModel(model, organizationId);
      modelStatusMap.set(model, {
        model,
        provider: "sag", // overridden per binding below
        rowCount:  result.rowCount,
        lastSyncAt: result.lastSyncAt,
        status:    result.rowCount > 0 ? "has_data" : "empty",
        internalModule: model,
      });
    }),
  );

  // 3. Build per-KPI results
  const results: RuntimeDetectionResult[] = [];

  for (const [kpiKey, bindings] of Object.entries(KPI_RUNTIME_BINDINGS)) {
    const sources = bindings
      .map(binding => {
        const modelStatus = modelStatusMap.get(binding.model);
        if (!modelStatus || modelStatus.status !== "has_data") return null;

        // Derive validationStatus based on provider and data characteristics
        let validationStatus: KpiSourceValidationStatus;
        let sourceOrigin: KpiSourceOrigin = "runtime_detected";

        if (binding.provider === "agentik" && binding.model === "CommercialCoverageSnapshot") {
          validationStatus = "snapshot_detected";
        } else if (binding.provider === "sag" && (binding.model === "SaleRecord" || binding.model === "SalesImportBatch")) {
          // SAG Sales = CSV import, not live ODBC
          validationStatus = "connected_partial";
        } else if (binding.provider === "bank") {
          validationStatus = "runtime_detected";
        } else if (binding.provider === "agentik") {
          validationStatus = "used_by_agentik";
          sourceOrigin = "runtime_detected";
        } else {
          validationStatus = "runtime_detected";
        }

        return {
          ...binding,
          rowCount:         modelStatus.rowCount,
          lastSyncAt:       modelStatus.lastSyncAt,
          detectedStatus:   modelStatus.status,
          validationStatus,
          sourceOrigin,
        };
      })
      .filter((s): s is NonNullable<typeof s> => s !== null);

    if (sources.length > 0) {
      results.push({ kpiKey, sources });
    }
  }

  return results;
}

/**
 * Returns a summary of runtime detection for display in the panel header.
 */
export type RuntimeDetectionSummary = {
  totalKpisWithRuntime: number;
  totalKpisEmpty:       number;
  byModel:              Array<{ model: string; rowCount: number; lastSyncAt: Date | null }>;
};

export async function getRuntimeDetectionSummary(
  organizationId: string,
): Promise<RuntimeDetectionSummary> {
  const results  = await detectRuntimeSources(organizationId);
  const kpiKeys  = Object.keys(KPI_RUNTIME_BINDINGS);

  const modelSet = new Set<string>();
  for (const bindings of Object.values(KPI_RUNTIME_BINDINGS)) {
    for (const b of bindings) modelSet.add(b.model);
  }

  const byModel: RuntimeDetectionSummary["byModel"] = [];
  await Promise.all(
    Array.from(modelSet).map(async model => {
      const probe = await probeModel(model, organizationId);
      if (probe.rowCount > 0) {
        byModel.push({ model, rowCount: probe.rowCount, lastSyncAt: probe.lastSyncAt });
      }
    }),
  );

  return {
    totalKpisWithRuntime: results.length,
    totalKpisEmpty:       kpiKeys.length - results.length,
    byModel,
  };
}
