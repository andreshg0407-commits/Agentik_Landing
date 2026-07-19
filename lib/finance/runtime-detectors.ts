/**
 * lib/finance/runtime-detectors.ts
 *
 * FASE 3 — Runtime Detector Engine
 *
 * Compares previousSnapshot vs currentSnapshot and emits
 * FinancialRuntimeEvent[] only when real thresholds are crossed.
 *
 * Rules:
 *   - NO event emitted if delta is within noise threshold.
 *   - NO repeated identical events (deduplication by type + bucket).
 *   - Events are directional: degradation vs recovery tracked separately.
 *   - All events are deterministic and org-scoped.
 *
 * Sprint: AGENTIK-FINANCIAL-LIVE-ORCHESTRATION-01
 */

import type { FinancialRuntimeSnapshot } from "./runtime-snapshots";
import { snapshotDelta } from "./runtime-snapshots";
import {
  buildEventId,
  type FinancialRuntimeEvent,
  type FinancialRuntimeEventType,
  type FinancialRuntimeSeverity,
} from "./runtime-events";

// ── Thresholds ────────────────────────────────────────────────────────────────

const CONFIDENCE_DROP_THRESHOLD    = 0.20;  // >20% drop triggers LOW_CONFIDENCE
const CONFIDENCE_RECOVER_THRESHOLD = 0.15;  // >15% gain triggers SYNC_RESTORED
const GRAPH_INTEGRITY_IMPROVE      = 15;    // >15% improvement triggers GRAPH_RECOVERED
const RECON_HEALTH_DROP            = 10;    // >10% drop triggers RECON_BREAK

// ── Event builder ─────────────────────────────────────────────────────────────

function makeEvent(
  orgId:              string,
  type:               FinancialRuntimeEventType,
  severity:           FinancialRuntimeSeverity,
  title:              string,
  summary:            string,
  source?:            string,
  confidence?:        number,
  previousConfidence?: number,
): FinancialRuntimeEvent {
  return {
    id:                 buildEventId(orgId, type),
    organizationId:     orgId,
    type,
    severity,
    title,
    summary,
    source,
    confidence,
    previousConfidence,
    createdAt:          new Date(),
    eventDispatchable:  true,
  };
}

// ── Individual detectors ──────────────────────────────────────────────────────

function detectLowConfidence(
  orgId:    string,
  previous: FinancialRuntimeSnapshot,
  current:  FinancialRuntimeSnapshot,
  delta:    ReturnType<typeof snapshotDelta>,
): FinancialRuntimeEvent | null {
  // Trigger: confidence dropped more than threshold
  if (delta.confidenceDelta >= -CONFIDENCE_DROP_THRESHOLD) return null;
  const prevPct = Math.round(previous.liquidityConfidence * 100);
  const currPct = Math.round(current.liquidityConfidence  * 100);
  return makeEvent(
    orgId,
    "LOW_CONFIDENCE",
    currPct < 30 ? "critical" : "warning",
    `Liquidez degradada · confianza cayó de ${prevPct}% a ${currPct}%`,
    `Confianza de liquidez cayó ${prevPct - currPct}% — verificar fuentes bancarias y recaudos.`,
    "LiquidityState",
    current.liquidityConfidence,
    previous.liquidityConfidence,
  );
}

function detectSyncRestored(
  orgId:    string,
  previous: FinancialRuntimeSnapshot,
  current:  FinancialRuntimeSnapshot,
  delta:    ReturnType<typeof snapshotDelta>,
): FinancialRuntimeEvent | null {
  // Trigger: confidence recovered significantly
  if (delta.confidenceDelta <= CONFIDENCE_RECOVER_THRESHOLD) return null;
  // Only emit if previous was actually low
  if (previous.liquidityConfidence > 0.5) return null;
  const prevPct = Math.round(previous.liquidityConfidence * 100);
  const currPct = Math.round(current.liquidityConfidence  * 100);
  return makeEvent(
    orgId,
    "SYNC_RESTORED",
    "info",
    `Confianza financiera recuperada · ${prevPct}% → ${currPct}%`,
    `Fuentes de datos restablecidas. Confianza de liquidez subió ${currPct - prevPct}%.`,
    "LiquidityState",
    current.liquidityConfidence,
    previous.liquidityConfidence,
  );
}

function detectGraphDegraded(
  orgId:    string,
  previous: FinancialRuntimeSnapshot,
  current:  FinancialRuntimeSnapshot,
  delta:    ReturnType<typeof snapshotDelta>,
): FinancialRuntimeEvent | null {
  // Trigger: more unresolved nodes or integrity dropped
  if (delta.unresolvedDelta <= 0 && delta.graphIntegrityDelta >= 0) return null;
  if (current.unresolvedCount === 0) return null;
  return makeEvent(
    orgId,
    "GRAPH_DEGRADED",
    current.graphIntegrityPct < 50 ? "critical" : "warning",
    `Grafo financiero degradado · ${current.unresolvedCount} sin resolver`,
    `Integridad bajó a ${current.graphIntegrityPct.toFixed(0)}%. ${delta.unresolvedDelta > 0 ? `+${delta.unresolvedDelta} nuevas relaciones sin resolver.` : ""}`,
    "FinancialGraph",
    current.graphIntegrityPct / 100,
    previous.graphIntegrityPct / 100,
  );
}

function detectGraphRecovered(
  orgId:    string,
  previous: FinancialRuntimeSnapshot,
  current:  FinancialRuntimeSnapshot,
  delta:    ReturnType<typeof snapshotDelta>,
): FinancialRuntimeEvent | null {
  // Trigger: integrity improved substantially
  if (delta.graphIntegrityDelta < GRAPH_INTEGRITY_IMPROVE) return null;
  // Only emit if previous had issues
  if (previous.graphIntegrityPct > 85) return null;
  return makeEvent(
    orgId,
    "GRAPH_RECOVERED",
    "info",
    `Integridad de grafo recuperada · ${previous.graphIntegrityPct.toFixed(0)}% → ${current.graphIntegrityPct.toFixed(0)}%`,
    `Relaciones sin resolver pasaron de ${previous.unresolvedCount} a ${current.unresolvedCount}.`,
    "FinancialGraph",
    current.graphIntegrityPct / 100,
    previous.graphIntegrityPct / 100,
  );
}

function detectReconBreak(
  orgId:    string,
  previous: FinancialRuntimeSnapshot,
  current:  FinancialRuntimeSnapshot,
  delta:    ReturnType<typeof snapshotDelta>,
): FinancialRuntimeEvent | null {
  if (delta.reconHealthDelta >= -RECON_HEALTH_DROP) return null;
  const prevPct = previous.reconciliationHealth.toFixed(0);
  const currPct = current.reconciliationHealth.toFixed(0);
  return makeEvent(
    orgId,
    "RECON_BREAK",
    current.reconciliationHealth < 50 ? "critical" : "warning",
    `Conciliación empeoró · ${prevPct}% → ${currPct}%`,
    `Salud de conciliación cayó ${(-delta.reconHealthDelta).toFixed(0)}%. Revisar movimientos pendientes.`,
    "BankMovement",
  );
}

function detectCloseBlocker(
  orgId:    string,
  previous: FinancialRuntimeSnapshot,
  current:  FinancialRuntimeSnapshot,
  delta:    ReturnType<typeof snapshotDelta>,
): FinancialRuntimeEvent | null {
  // Trigger: new blockers appeared
  if (delta.closeBlockersDelta <= 0) return null;
  return makeEvent(
    orgId,
    "CLOSE_BLOCKER",
    "critical",
    `${current.closeBlockers} bloqueo(s) de cierre financiero`,
    `Aparecieron ${delta.closeBlockersDelta} nuevo(s) bloqueo(s) desde el último snapshot. Cierre inhabilitado.`,
    "CloseState",
  );
}

function detectStaleSource(
  orgId:   string,
  current: FinancialRuntimeSnapshot,
  delta:   ReturnType<typeof snapshotDelta>,
): FinancialRuntimeEvent | null {
  // Trigger: newly stale sources appeared
  if (delta.staleSourcesDelta <= 0 || current.staleSources === 0) return null;
  return makeEvent(
    orgId,
    "STALE_SOURCE",
    current.staleSources >= 3 ? "critical" : "warning",
    `${current.staleSources} fuente(s) desactualizadas detectadas`,
    `${delta.staleSourcesDelta} nueva(s) fuente(s) superaron umbral de frescura. Datos pueden ser imprecisos.`,
    "DataFreshness",
  );
}

function detectBankUnmatched(
  orgId:    string,
  previous: FinancialRuntimeSnapshot,
  current:  FinancialRuntimeSnapshot,
  delta:    ReturnType<typeof snapshotDelta>,
): FinancialRuntimeEvent | null {
  // Trigger: banking just disconnected
  if (!delta.bankingLost) return null;
  return makeEvent(
    orgId,
    "BANK_UNMATCHED",
    "critical",
    "Conexión bancaria perdida",
    "Sin datos bancarios conectados — liquidez y conciliación no trazables.",
    "BankAccount",
  );
}

function detectLiquidityRisk(
  orgId:   string,
  current: FinancialRuntimeSnapshot,
): FinancialRuntimeEvent | null {
  // Trigger: overall CRITICAL state with low liquidity confidence
  if (current.overallState !== "CRITICAL") return null;
  if (current.liquidityConfidence > 0.3) return null;
  return makeEvent(
    orgId,
    "LIQUIDITY_RISK",
    "critical",
    "Riesgo de liquidez — datos insuficientes para evaluación",
    `Estado global CRÍTICO · confianza de liquidez: ${Math.round(current.liquidityConfidence * 100)}%.`,
    "LiquidityState",
    current.liquidityConfidence,
  );
}

// ── Main detector ─────────────────────────────────────────────────────────────

export function detectFinancialRuntimeEvents(
  previous: FinancialRuntimeSnapshot,
  current:  FinancialRuntimeSnapshot,
): FinancialRuntimeEvent[] {
  const orgId = current.organizationId;
  const delta = snapshotDelta(previous, current);

  const candidates: Array<FinancialRuntimeEvent | null> = [
    detectLowConfidence(orgId, previous, current, delta),
    detectSyncRestored(orgId, previous, current, delta),
    detectGraphDegraded(orgId, previous, current, delta),
    detectGraphRecovered(orgId, previous, current, delta),
    detectReconBreak(orgId, previous, current, delta),
    detectCloseBlocker(orgId, previous, current, delta),
    detectStaleSource(orgId, current, delta),
    detectBankUnmatched(orgId, previous, current, delta),
    detectLiquidityRisk(orgId, current),
  ];

  // Deduplicate by ID (same bucket = same event)
  const seen = new Set<string>();
  const events: FinancialRuntimeEvent[] = [];

  for (const e of candidates) {
    if (!e) continue;
    if (seen.has(e.id)) continue;
    seen.add(e.id);
    events.push(e);
  }

  // Sort: critical → warning → info
  const SORDER: Record<FinancialRuntimeSeverity, number> = { critical: 0, warning: 1, info: 2 };
  return events.sort((a, b) => SORDER[a.severity] - SORDER[b.severity]);
}

// ── First-run event detector (no previous snapshot) ──────────────────────────

export function detectInitialStateEvents(
  current: FinancialRuntimeSnapshot,
): FinancialRuntimeEvent[] {
  const orgId  = current.organizationId;
  const events: FinancialRuntimeEvent[] = [];

  if (!current.bankingConnected) {
    events.push(makeEvent(
      orgId, "BANK_UNMATCHED", "critical",
      "Sin conexión bancaria — primer estado registrado",
      "No hay cuentas bancarias conectadas. Liquidez y conciliación no disponibles.",
      "BankAccount",
    ));
  }

  if (current.closeBlockers > 0) {
    events.push(makeEvent(
      orgId, "CLOSE_BLOCKER", "critical",
      `${current.closeBlockers} bloqueo(s) de cierre en estado inicial`,
      "Cierre financiero bloqueado desde el primer snapshot registrado.",
      "CloseState",
    ));
  }

  if (current.staleSources >= 3) {
    events.push(makeEvent(
      orgId, "STALE_SOURCE", "warning",
      `${current.staleSources} fuentes desactualizadas en estado inicial`,
      "Múltiples fuentes de datos desactualizadas al inicio del monitoreo.",
      "DataFreshness",
    ));
  }

  return events;
}
