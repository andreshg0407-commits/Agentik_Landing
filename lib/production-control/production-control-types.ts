/**
 * production-control-types.ts
 *
 * PRODUCTION-CONTROL-CENTER-01 — Phase 2: Domain Types.
 *
 * Snapshot model for the Production Control Center.
 * Consumes ProductionFlowSnapshot + direct OP queries.
 *
 * No Prisma. No React. No server-only. Pure domain types.
 */

import type {
  ProductionFlowStatus,
  ProductionDelayRiskLevel,
  ProductionFlowConfidence,
} from "@/lib/production-intelligence/production-flow-types";

// ── Production Control Snapshot ────────────────────────────────────────────

export interface ProductionControlSnapshot {
  orgSlug: string;
  computedAt: string;

  /** KPI metrics for the header strip. */
  kpis: ProductionKpis;
  /** All OP rows for the main table. */
  orders: ProductionControlOrder[];
  /** Stage summary (per production stage). */
  stages: ProductionStageSummary[];
  /** Operational alerts. */
  alerts: ProductionAlert[];
  /** Data quality assessment. */
  dataQuality: ProductionDataQuality;
}

// ── KPIs ────────────────────────────────────────────────────────────────────

export interface ProductionKpis {
  opActivas: number;
  unidadesComprometidas: number;
  unidadesTerminadas: number;
  unidadesPendientes: number;
  opRetrasadas: number;
  opSinMovimiento: number;
  diasPromedioProduccion: number;
  referenciasUnicas: number;
}

// ── Order Row ─────────────────────────────────────────────────────────────

export interface ProductionControlOrder {
  id: string;
  opNumber: string;
  referenceCode: string;
  description: string;
  subLinea: string;
  subGrupo: string;
  quantityOrdered: number;
  quantityInBodega01: number | null;
  quantityPending: number | null;
  completionPct: number | null;
  activationDate: string;
  daysOpen: number;
  currentStage: string;
  currentStageLabel: string;
  lastMovementDate: string | null;
  productionStatus: ProductionFlowStatus;
  delayRiskLevel: ProductionDelayRiskLevel;
  isClosed: boolean;
}

// ── Stage Summary ─────────────────────────────────────────────────────────

export interface ProductionStageSummary {
  stageId: string;
  stageLabel: string;
  stageOrder: number;
  opCount: number;
  referenceCount: number;
  unitsCommitted: number;
  oldestOpDate: string | null;
  newestOpDate: string | null;
}

// ── Alerts ────────────────────────────────────────────────────────────────

export type ProductionAlertType =
  | "op_detenida"
  | "op_sin_movimiento"
  | "op_antigua"
  | "referencia_critica"
  | "produccion_retrasada"
  | "transferencia_pendiente";

export type ProductionAlertSeverity = "info" | "warning" | "critical";

export interface ProductionAlert {
  type: ProductionAlertType;
  severity: ProductionAlertSeverity;
  title: string;
  description: string;
  opNumber: string | null;
  referenceCode: string | null;
  daysOpen: number | null;
}

// ── Data Quality ──────────────────────────────────────────────────────────

export interface ProductionDataQuality {
  lastSync: string | null;
  confidence: ProductionFlowConfidence;
  totalOrders: number;
  totalLines: number;
  warnings: string[];
}

// ── Filter Keys ───────────────────────────────────────────────────────────

export type ProductionFilterKey =
  | "todas"
  | "activas"
  | "retrasadas"
  | "sin_movimiento"
  | "proximas"
  | "finalizadas"
  | "castillitos"
  | "latin_kids"
  | "importacion";
