/**
 * lib/reconciliation/observability/execution-report.ts
 *
 * AGENTIK-RECON-EXECUTION-OBSERVABILITY-01
 * Execution Observability Layer — Types + Builders
 *
 * Produces a fully structured ExecutionReport from a rule engine run.
 * The report captures everything an auditor (or an operator during a SAG
 * meeting) needs to understand what happened:
 *
 *   Phase 1+2  LoaderDiagnosticsReport — per-source load stats
 *   Phase 3    RuleExecutionMetrics    — per-rule pass/fail breakdown
 *   Phase 4    MatchPipelineMetrics    — pair generation + verdict counts
 *   Phase 5    ExecutionNarrative      — deterministic natural-language summary
 *   Phase 6    governance fields       — executionId, durationMs, timestamp
 *   Phase 7    SourceReadinessEntry[]  — all sources with their readiness state
 *   Phase 8    allSources             — data for SAG meeting mode
 *
 * Design:
 *   - Pure functions. No Prisma. No side effects.
 *   - All output is JSON-serializable.
 *   - No AI. Narrative is deterministic from input numbers.
 *
 * IMPORTANT: Backend-only. Never import in client components.
 */

import type { LoadResult }                   from "../loader/record-loader";
import type { ReconciliationSourceContract } from "../source-contract";
import { RECONCILIATION_SOURCES }            from "../source-contract";

// ── Phase 1+2: Loader diagnostics ─────────────────────────────────────────────

export interface LoaderDiagnosticsReport {
  sourceType:           string;
  sourceLabel:          string;
  loaderUsed:           string;
  normalizationVersion: string;
  readiness:            string;
  readinessNote:        string;
  recordsLoaded:        number;
  loadTimeMs:           number;
  isEmpty:              boolean;
  emptyReason:          string | null;
}

// ── Phase 3: Rule execution metrics ───────────────────────────────────────────

export interface RuleBreakdownEntry {
  ruleId:    string;
  ruleLabel: string;
  group:     string;
  evaluated: number;
  passed:    number;
  partial:   number;
  failed:    number;
  passRate:  number; // 0–100
}

export interface RuleExecutionMetrics {
  totalRulesConfigured: number;
  totalRulesEnabled:    number;
  ruleBreakdown:        RuleBreakdownEntry[];
  avgScore:             number;
  maxScore:             number;
  minScore:             number;
  scoreDistribution: {
    high:   number; // score >= 85
    medium: number; // 60 <= score < 85
    low:    number; // score < 60
  };
}

// ── Phase 4: Match pipeline metrics ───────────────────────────────────────────

export interface MatchPipelineMetrics {
  recordsA:        number;
  recordsB:        number;
  pairsEvaluated:  number;
  pairsReconciled: number;
  pairsPartial:    number;
  pairsMismatch:   number;
  pairsSuspicious: number;
  pairsPending:    number;
  pairsNoCandidate: number;
  matchRate:        number; // 0–100 (reconciled / pairsEvaluated)
  capped:           boolean;
  cappedNote:       string | null;
}

// ── Phase 5: Deterministic narrative ──────────────────────────────────────────

export interface ExecutionNarrative {
  /** One-line summary for compact display. */
  headline:    string;
  /** Ordered sentences describing the execution. */
  lines:       string[];
  hasWarnings: boolean;
  warnings:    string[];
}

// ── Phase 7: Source readiness entry ───────────────────────────────────────────

export interface SourceReadinessEntry {
  sourceType:     string;
  sourceLabel:    string;
  shortLabel:     string;
  provider:       string;
  readiness:      string;
  readinessNote:  string;
  isAvailable:    boolean;
  requiresAction: boolean;
  /** Human-readable description of what's needed to activate this source. */
  actionLabel:    string | null;
}

// ── Root execution report ──────────────────────────────────────────────────────

export interface ExecutionReport {
  /** Stable string identifier for this execution (period:timestamp). */
  executionId:   string;
  sessionId:     string | null;
  /** ISO timestamp of when the engine run completed. */
  timestamp:     string;
  /** Total wall-clock ms from request start to response. */
  durationMs:    number;
  period:        string;
  loaderA:       LoaderDiagnosticsReport;
  loaderB:       LoaderDiagnosticsReport;
  rules:         RuleExecutionMetrics;
  pipeline:      MatchPipelineMetrics;
  narrative:     ExecutionNarrative;
  /** Readiness of all registered sources — for SAG meeting mode. */
  allSources:    SourceReadinessEntry[];
}

// ── Builder inputs ────────────────────────────────────────────────────────────

export interface BuildExecutionReportInput {
  startedAtMs:     number;
  sessionId:       string | null;
  period:          string;
  loadA:           LoadResult;
  loadB:           LoadResult;
  contractA:       ReconciliationSourceContract;
  contractB:       ReconciliationSourceContract;
  totalRules:      number;
  enabledRules:    number;
  ruleBreakdown:   Map<string, Omit<RuleBreakdownEntry, "passRate">>;
  pairScores:      number[];   // scores from evaluated pairs only
  pipeline: {
    recordsA:        number;
    recordsB:        number;
    pairsEvaluated:  number;
    pairsReconciled: number;
    pairsPartial:    number;
    pairsMismatch:   number;
    pairsSuspicious: number;
    pairsPending:    number;
    pairsNoCandidate: number;
    capped:           boolean;
  };
}

// ── Narrative builder (Phase 5) ───────────────────────────────────────────────

export function buildExecutionNarrative(
  input: BuildExecutionReportInput,
): ExecutionNarrative {
  const { loadA, loadB, contractA, contractB, pipeline } = input;
  const lines:    string[] = [];
  const warnings: string[] = [];

  // Source loads
  if (!loadA.isEmpty && !loadB.isEmpty) {
    lines.push(
      `Fuente A cargó ${loadA.recordCount.toLocaleString("es-CO")} registros (${contractA.shortLabel}). ` +
      `Fuente B cargó ${loadB.recordCount.toLocaleString("es-CO")} registros (${contractB.shortLabel}).`,
    );
  } else if (loadA.isEmpty) {
    lines.push(`Fuente A (${contractA.shortLabel}) no aportó registros — ${loadA.emptyReason ?? loadA.readinessNote}.`);
    warnings.push(`${contractA.shortLabel} sin registros para el período.`);
  } else {
    lines.push(`Fuente B (${contractB.shortLabel}) no aportó registros — ${loadB.emptyReason ?? loadB.readinessNote}.`);
    warnings.push(`${contractB.shortLabel} sin registros para el período.`);
  }

  // No-candidate records
  if (pipeline.pairsNoCandidate > 0) {
    lines.push(
      `${pipeline.pairsNoCandidate.toLocaleString("es-CO")} registro${pipeline.pairsNoCandidate !== 1 ? "s" : ""} ` +
      `en Fuente A no encontraron contrapartida en ${contractB.shortLabel}.`,
    );
  }

  // Reconciled
  if (pipeline.pairsReconciled > 0) {
    lines.push(
      `${pipeline.pairsReconciled.toLocaleString("es-CO")} par${pipeline.pairsReconciled !== 1 ? "es" : ""} ` +
      `conciliados automáticamente.`,
    );
  }

  // Partial
  if (pipeline.pairsPartial > 0) {
    lines.push(
      `${pipeline.pairsPartial.toLocaleString("es-CO")} par${pipeline.pairsPartial !== 1 ? "es" : ""} ` +
      `parcialmente conciliados — diferencia dentro del rango de tolerancia.`,
    );
  }

  // Mismatches
  if (pipeline.pairsMismatch > 0) {
    lines.push(
      `Se detectaron ${pipeline.pairsMismatch.toLocaleString("es-CO")} ` +
      `diferencia${pipeline.pairsMismatch !== 1 ? "s" : ""} financieras entre pares evaluados.`,
    );
    if (pipeline.pairsMismatch > 10) {
      warnings.push(`${pipeline.pairsMismatch} diferencias detectadas — revisar antes de cerrar la sesión.`);
    }
  }

  // Suspicious
  if (pipeline.pairsSuspicious > 0) {
    lines.push(
      `${pipeline.pairsSuspicious.toLocaleString("es-CO")} caso${pipeline.pairsSuspicious !== 1 ? "s" : ""} ` +
      `marcados como sospechosos — requieren revisión manual.`,
    );
    warnings.push(
      `${pipeline.pairsSuspicious} registro${pipeline.pairsSuspicious !== 1 ? "s" : ""} sospechoso${pipeline.pairsSuspicious !== 1 ? "s" : ""} detectado${pipeline.pairsSuspicious !== 1 ? "s" : ""}. Revisar antes de cerrar la sesión.`,
    );
  }

  // Match rate
  const matchRate = pipeline.pairsEvaluated > 0
    ? Math.round((pipeline.pairsReconciled / pipeline.pairsEvaluated) * 100)
    : 0;
  if (pipeline.pairsEvaluated > 0) {
    lines.push(`Tasa de conciliación automática: ${matchRate}%.`);
  }

  const headline =
    pipeline.pairsEvaluated === 0
      ? `Sin pares evaluados — verificar configuración de reglas y fuentes`
      : `${pipeline.pairsReconciled} conciliados · ${pipeline.pairsMismatch} diferencias · ${pipeline.pairsSuspicious} sospechosos · tasa ${matchRate}%`;

  return { headline, lines, hasWarnings: warnings.length > 0, warnings };
}

// ── Root builder (Phase 6) ────────────────────────────────────────────────────

export function buildExecutionReport(
  input: BuildExecutionReportInput,
): ExecutionReport {
  const now         = Date.now();
  const durationMs  = now - input.startedAtMs;
  const timestamp   = new Date(now).toISOString();
  const executionId = `${input.period}:${now}`;

  // Phase 1+2: Loader diagnostics
  const loaderA: LoaderDiagnosticsReport = {
    sourceType:           input.loadA.sourceType,
    sourceLabel:          input.contractA.label,
    loaderUsed:           input.loadA.loaderUsed,
    normalizationVersion: input.loadA.normalizationVersion,
    readiness:            input.loadA.readiness,
    readinessNote:        input.loadA.readinessNote,
    recordsLoaded:        input.loadA.recordCount,
    loadTimeMs:           input.loadA.loadTimeMs,
    isEmpty:              input.loadA.isEmpty,
    emptyReason:          input.loadA.emptyReason,
  };

  const loaderB: LoaderDiagnosticsReport = {
    sourceType:           input.loadB.sourceType,
    sourceLabel:          input.contractB.label,
    loaderUsed:           input.loadB.loaderUsed,
    normalizationVersion: input.loadB.normalizationVersion,
    readiness:            input.loadB.readiness,
    readinessNote:        input.loadB.readinessNote,
    recordsLoaded:        input.loadB.recordCount,
    loadTimeMs:           input.loadB.loadTimeMs,
    isEmpty:              input.loadB.isEmpty,
    emptyReason:          input.loadB.emptyReason,
  };

  // Phase 3: Rule metrics
  const breakdown: RuleBreakdownEntry[] = Array.from(input.ruleBreakdown.values()).map(e => ({
    ...e,
    passRate: e.evaluated > 0 ? Math.round((e.passed / e.evaluated) * 100) : 0,
  }));

  const scores    = input.pairScores;
  const avgScore  = scores.length > 0 ? Math.round(scores.reduce((s, v) => s + v, 0) / scores.length) : 0;
  const maxScore  = scores.length > 0 ? Math.max(...scores) : 0;
  const minScore  = scores.length > 0 ? Math.min(...scores) : 0;

  const rules: RuleExecutionMetrics = {
    totalRulesConfigured: input.totalRules,
    totalRulesEnabled:    input.enabledRules,
    ruleBreakdown:        breakdown,
    avgScore,
    maxScore,
    minScore,
    scoreDistribution: {
      high:   scores.filter(s => s >= 85).length,
      medium: scores.filter(s => s >= 60 && s < 85).length,
      low:    scores.filter(s => s < 60).length,
    },
  };

  // Phase 4: Pipeline metrics
  const { pipeline: p } = input;
  const pipeline: MatchPipelineMetrics = {
    recordsA:         p.recordsA,
    recordsB:         p.recordsB,
    pairsEvaluated:   p.pairsEvaluated,
    pairsReconciled:  p.pairsReconciled,
    pairsPartial:     p.pairsPartial,
    pairsMismatch:    p.pairsMismatch,
    pairsSuspicious:  p.pairsSuspicious,
    pairsPending:     p.pairsPending,
    pairsNoCandidate: p.pairsNoCandidate,
    matchRate: p.pairsEvaluated > 0
      ? Math.round((p.pairsReconciled / p.pairsEvaluated) * 100)
      : 0,
    capped:    p.capped,
    cappedNote: p.capped ? `Combinaciones A×B superaban el límite — evaluación truncada` : null,
  };

  // Phase 5: Narrative
  const narrative = buildExecutionNarrative(input);

  // Phase 7+8: All sources readiness
  const allSources: SourceReadinessEntry[] = Object.values(RECONCILIATION_SOURCES).map(s => ({
    sourceType:     s.sourceId,
    sourceLabel:    s.label,
    shortLabel:     s.shortLabel,
    provider:       s.provider,
    readiness:      s.readiness,
    readinessNote:  s.readinessNote,
    isAvailable:    s.readiness === "available",
    requiresAction: s.readiness !== "available" && s.readiness !== "unavailable",
    actionLabel:    deriveActionLabel(s),
  }));

  return {
    executionId,
    sessionId:  input.sessionId,
    timestamp,
    durationMs,
    period:     input.period,
    loaderA,
    loaderB,
    rules,
    pipeline,
    narrative,
    allSources,
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function deriveActionLabel(s: ReconciliationSourceContract): string | null {
  if (s.readiness === "available") return null;
  if (s.requiresCredential)  return "Requiere credencial o certificado";
  if (s.requiresUpload)      return "Requiere carga de archivo";
  if (s.requiresIntegration) return "Requiere integración de API";
  if (s.readiness === "pending_sag_validation") return "Validación PUC pendiente";
  return "No disponible";
}
