/**
 * lib/copilot/david/david-types.ts
 *
 * David Commercial Copilot — Core type contracts.
 *
 * David is a rule-based commercial operations interpreter.
 * All signals come from real data: CommercialCoverageSnapshot, reference-decision-engine,
 * availability maps, PD pressure, vendor case assignments.
 *
 * NO invented signals. NO speculative language.
 * Numbers when available. States when not.
 *
 * Sprint: AGENTIK-AGENT-DAVID-COMMERCIAL-TOOLS-01
 */

// ── Signal types ──────────────────────────────────────────────────────────────

export type DavidSignalType =
  | "coverage_critical"    // referencias agotadas o con producir_urgente
  | "production_urgent"    // referencias por debajo del 25% del mínimo
  | "pd_pressure_high"     // PD pendiente cubre > 60% del saldo en bodega
  | "vendor_depletion"     // vendedores con maletas agotadas en refs activas
  | "coverage_low"         // referencias bajo_minimo pero sin urgencia inmediata
  | "data_unavailable";    // sin fuente de datos de inventario activa

export type DavidSeverity = "critical" | "high" | "medium" | "low";
export type DavidDataState = "REAL" | "PARTIAL" | "EMPTY";

// ── Signal shape ──────────────────────────────────────────────────────────────

/**
 * A David signal represents a real, traceable commercial inventory condition.
 * Every signal links to a reference code or a count — never vague assertions.
 */
export interface DavidSignal {
  id:          string;
  type:        DavidSignalType;
  severity:    DavidSeverity;
  /** Enterprise-terse title. Max 80 chars. */
  title:       string;
  /** Operational body. Max 160 chars. Includes counts where available. */
  body:        string;
  /** Reference code if signal is ref-specific. Null for aggregate signals. */
  reference?:  string;
  /** Prisma model or runtime source that produced this signal. */
  source:      string;
  generatedAt: Date;
}

// ── Critical reference — serializable for rail display ───────────────────────

export interface DavidCriticalRef {
  reference:        string;
  description:      string;
  opState:          string;  // "agotado" | "producir_urgente" | "riesgo_pd" | etc.
  disponible:       number;
  minRequired:      number;
  suggestedQty:     number;
  pdPending:        number;
  line:             string;  // "LT" | "CS"
}

// ── Production suggestion ─────────────────────────────────────────────────────

export interface DavidProductionSuggestion {
  reference:   string;
  description: string;
  qty:         number;
  reason:      string;
  severity:    DavidSeverity;
  line:        string;
}

// ── KPIs ─────────────────────────────────────────────────────────────────────

export interface DavidKpis {
  totalRefs:           number;
  coverageCritical:    number;  // agotado + producir_urgente
  producirUrgente:     number;  // subset of coverageCritical
  coverageLow:         number;  // bajo_minimo
  operationalPressure: number;  // 0–1 aggregate pressure
  readyToReplenish:    number;  // refs with stock available for case replenishment
  topPdPressureRef:    string | null;
}

// ── Executive summary — server-side only ─────────────────────────────────────

export interface DavidCommercialSummary {
  orgId:                    string;
  generatedAt:              Date;
  /** Single operational sentence. No greetings. Max 100 chars. */
  executiveHeadline:        string;
  /** 1–2 operational facts. */
  operationalSummary:       string;
  /** Top recommended action phrase. */
  recommendedFocus:         string;
  kpis:                     DavidKpis;
  /** Top 3 most critical references (by operationalScore). */
  criticalRefs:             DavidCriticalRef[];
  /** Top production suggestion across all critical refs. */
  topProductionSuggestion:  DavidProductionSuggestion | null;
  signals:                  DavidSignal[];
  dataState:                DavidDataState;
}

// ── Serializable subset for client component props ────────────────────────────

export interface DavidSummarySerial {
  executiveHeadline:       string;
  operationalSummary:      string;
  recommendedFocus:        string;
  kpis:                    DavidKpis;
  criticalRefs:            DavidCriticalRef[];
  topProductionSuggestion: DavidProductionSuggestion | null;
  signalCount:             number;
  dataState:               DavidDataState;
  topSignalSeverity:       DavidSeverity | null;
}
