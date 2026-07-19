/**
 * lib/copilot/accountability-engine.ts
 *
 * Agentik Copilot — Accountability Engine V1
 *
 * Phase 3 of Sprint AGENTIK-COPILOT-ACCOUNTABILITY-01
 *
 * Detects operational gaps, stalls, and escalation needs from the
 * current compound operation + progress state.
 *
 * An accountability signal is different from an operational signal:
 *   - Operational signal: "something is wrong in the business"
 *   - Accountability signal: "Copilot hasn't resolved something it should have"
 *
 * V1: deterministic, no DB. V2: driven by real timeline + resolution history.
 */

import type { CompoundOperation }        from "./compound-operations";
import type { OperationProgressSnapshot } from "./operation-progress";
import type { ExecutiveIntent }           from "./executive-intent";

// ── Types ─────────────────────────────────────────────────────────────────────

export type AccountabilitySignalType =
  | "stalled_operation"
  | "blocked_step"
  | "no_progress"
  | "unresolved_intent"
  | "delayed_execution"
  | "degraded_runtime";

export type AccountabilitySeverity = "critical" | "elevated" | "normal";

export interface AccountabilitySignal {
  id:                    string;
  severity:              AccountabilitySeverity;
  type:                  AccountabilitySignalType;
  title:                 string;
  description:           string;
  relatedOperationId:    string;
  escalationRecommended: boolean;
}

// ── Detection rules ───────────────────────────────────────────────────────────

interface AccountabilityRule {
  id:       AccountabilitySignalType;
  evaluate: (
    operation:    CompoundOperation,
    progress:     OperationProgressSnapshot,
    runtimeState: string,
    intent:       ExecutiveIntent | null,
    pendingApprovals: number,
  ) => AccountabilitySignal | null;
}

const ACCOUNTABILITY_RULES: AccountabilityRule[] = [

  // Rule 1: Runtime degraded — data confidence risk
  {
    id: "degraded_runtime",
    evaluate: (op, _progress, runtimeState) => {
      if (runtimeState !== "DEGRADED" && runtimeState !== "STALE") return null;
      const isDegrade = runtimeState === "DEGRADED";
      return {
        id:                    `acc-runtime-${op.id}`,
        severity:              isDegrade ? "elevated" : "normal",
        type:                  "degraded_runtime",
        title:                 isDegrade ? "Contexto degradado — plan puede ser impreciso" : "Datos desactualizados — sincronización pendiente",
        description:           isDegrade
          ? "El motor de señales no tiene datos completos. Los pasos del plan pueden no reflejar el estado real."
          : "Las fuentes de datos tienen retraso. Confirmar estado antes de ejecutar pasos críticos.",
        relatedOperationId:    op.id,
        escalationRecommended: isDegrade,
      };
    },
  },

  // Rule 2: Operation is blocked (status = blocked)
  {
    id: "blocked_step",
    evaluate: (op, progress) => {
      if (progress.blockedSteps === 0 && op.status !== "blocked") return null;
      const count = progress.blockedSteps;
      return {
        id:                    `acc-blocked-${op.id}`,
        severity:              op.riskLevel === "critical" ? "critical" : "elevated",
        type:                  "blocked_step",
        title:                 count > 1
          ? `${count} pasos bloqueados en "${op.title}"`
          : `Paso bloqueado en "${op.title}"`,
        description:           "Hay pasos del plan que no pueden avanzar por dependencias sin resolver. Revisión directa requerida.",
        relatedOperationId:    op.id,
        escalationRecommended: op.riskLevel === "critical",
      };
    },
  },

  // Rule 3: Operation stalled (no movement, runtime issues)
  {
    id: "stalled_operation",
    evaluate: (op, progress, runtimeState) => {
      if (progress.status !== "stalled") return null;
      if (runtimeState === "HEALTHY") return null; // stalled for non-runtime reason handled elsewhere
      return {
        id:                    `acc-stall-${op.id}`,
        severity:              "elevated",
        type:                  "stalled_operation",
        title:                 `Plan pausado — "${op.title}"`,
        description:           `El plan operativo está pausado. ${progress.stalledSteps} paso${progress.stalledSteps > 1 ? "s" : ""} en espera de sincronización de datos.`,
        relatedOperationId:    op.id,
        escalationRecommended: false,
      };
    },
  },

  // Rule 4: Intent persists unresolved for multiple sessions
  {
    id: "unresolved_intent",
    evaluate: (op, _progress, _runtime, intent) => {
      if (!intent) return null;
      const sessions = (intent as any).sessionCount ?? 1;
      if (sessions < 2) return null;
      return {
        id:                    `acc-intent-${op.id}`,
        severity:              sessions >= 3 ? "elevated" : "normal",
        type:                  "unresolved_intent",
        title:                 `Intención sin resolver — ${sessions} sesiones`,
        description:           `"${intent.title}" permanece activa desde hace ${sessions} sesiones sin resolución completa.`,
        relatedOperationId:    op.id,
        escalationRecommended: sessions >= 4,
      };
    },
  },

  // Rule 5: Blocked critical operation with no pending approvals — delayed execution
  {
    id: "delayed_execution",
    evaluate: (op, _progress, _runtime, _intent, pendingApprovals) => {
      const approvalSteps = op.steps.filter(s => s.requiresApproval).length;
      if (approvalSteps === 0) return null;
      if (op.riskLevel !== "critical" && op.riskLevel !== "high") return null;
      if (pendingApprovals > 0) return null; // approvals already queued — not delayed
      return {
        id:                    `acc-delay-${op.id}`,
        severity:              op.riskLevel === "critical" ? "elevated" : "normal",
        type:                  "delayed_execution",
        title:                 `Aprobación pendiente — "${op.title}"`,
        description:           `${approvalSteps} paso${approvalSteps > 1 ? "s" : ""} requieren aprobación para avanzar. Sin aprobador activo la ejecución está detenida.`,
        relatedOperationId:    op.id,
        escalationRecommended: op.riskLevel === "critical",
      };
    },
  },

  // Rule 6: No progress — operation in proposed state with no active steps
  {
    id: "no_progress",
    evaluate: (op, progress) => {
      if (progress.activeSteps > 0 || progress.completedSteps > 0) return null;
      if (op.status === "completed" || op.status === "monitoring") return null;
      return {
        id:                    `acc-noprog-${op.id}`,
        severity:              "normal",
        type:                  "no_progress",
        title:                 "Sin progreso registrado",
        description:           "El plan operativo no tiene pasos activos o completados. Iniciar ejecución del primer paso.",
        relatedOperationId:    op.id,
        escalationRecommended: false,
      };
    },
  },
];

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Computes accountability signals from the current operation state.
 * Returns signals sorted by severity: critical → elevated → normal.
 */
export function computeAccountabilitySignals(
  operation:        CompoundOperation,
  progress:         OperationProgressSnapshot,
  runtimeState:     string,
  intent:           ExecutiveIntent | null,
  pendingApprovals: number,
): AccountabilitySignal[] {
  const SEV_ORDER: Record<AccountabilitySeverity, number> = {
    critical: 0, elevated: 1, normal: 2,
  };

  return ACCOUNTABILITY_RULES
    .map(rule => rule.evaluate(operation, progress, runtimeState, intent, pendingApprovals))
    .filter((s): s is AccountabilitySignal => s !== null)
    .sort((a, b) => SEV_ORDER[a.severity] - SEV_ORDER[b.severity]);
}

/**
 * Determines if escalation is needed based on accountability signals.
 */
export function resolveEscalationNeed(signals: AccountabilitySignal[]): boolean {
  return signals.some(s => s.escalationRecommended);
}

/**
 * Returns a single-line operational risk summary for rail display.
 */
export function summarizeOperationalRisk(signals: AccountabilitySignal[]): string {
  if (signals.length === 0)             return "Sin bloqueos detectados";
  const critical = signals.find(s => s.severity === "critical");
  if (critical)                         return critical.title;
  const elevated = signals.find(s => s.severity === "elevated");
  if (elevated)                         return elevated.title;
  if (signals.length === 1)             return signals[0]!.title;
  return `${signals.length} señales de seguimiento activas`;
}
