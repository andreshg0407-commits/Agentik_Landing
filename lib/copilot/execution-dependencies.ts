/**
 * lib/copilot/execution-dependencies.ts
 *
 * Agentik Copilot — Execution Dependency Engine V1
 *
 * Phase 2 of Sprint AGENTIK-EXECUTION-LAYER-V2-FOUNDATION-01
 *
 * Identifies and classifies execution dependencies before dispatch.
 * A dependency is a pre-condition that must be satisfied before a bundle
 * can safely execute. Blocking dependencies prevent all execution.
 *
 * V1: deterministic from context state — no DB, no external calls.
 * V2: driven by Prisma.CopilotDependencyLog + live integration health.
 */

import type { CompoundOperation } from "./compound-operations";

// ── Types ──────────────────────────────────────────────────────────────────────

export type ExecutionDependencyType =
  | "integration"    // A data connector or external system must be healthy
  | "approval"       // A human approval must be obtained
  | "runtime"        // The Copilot runtime must be healthy
  | "financial"      // A financial constraint must be met (e.g. approval budget)
  | "data_sync"      // Data sources must be synchronized
  | "permissions";   // User must have required roles/permissions

export interface ExecutionDependency {
  id:            string;
  type:          ExecutionDependencyType;
  description:   string;               // Human-readable condition
  blocking:      boolean;              // true = blocks execution entirely
  resolved:      boolean;              // V1: always false for non-trivial deps
  relatedModule: string;
}

// ── Dependency detection rules ─────────────────────────────────────────────────

interface DependencyRule {
  id: string;
  evaluate: (
    operation:    CompoundOperation,
    runtimeState: string,
    pendingApprovals: number,
  ) => ExecutionDependency | null;
}

const DEPENDENCY_RULES: DependencyRule[] = [

  // Runtime degraded → blocking dependency
  {
    id: "runtime_degraded",
    evaluate: (_op, runtimeState) => {
      if (runtimeState !== "DEGRADED" && runtimeState !== "STALE") return null;
      const isDegrade = runtimeState === "DEGRADED";
      return {
        id:            "dep-runtime",
        type:          "runtime",
        description:   isDegrade
          ? "El motor de señales está degradado — la precisión del plan no está garantizada"
          : "Sincronización pendiente — los datos pueden tener retraso",
        blocking:      isDegrade,      // DEGRADED = blocking; STALE = warning only
        resolved:      false,
        relatedModule: "integrations",
      };
    },
  },

  // Operations with integration steps need healthy connectors
  {
    id: "integration_health",
    evaluate: (op, runtimeState) => {
      const hasIntegrationStep = op.steps.some(s => s.module === "integrations");
      if (!hasIntegrationStep) return null;
      if (runtimeState === "HEALTHY") return null;
      return {
        id:            "dep-integration",
        type:          "integration",
        description:   "Los conectores de datos deben estar activos antes del despacho",
        blocking:      runtimeState === "DEGRADED",
        resolved:      false,
        relatedModule: "integrations",
      };
    },
  },

  // Steps requiring approval need pending approver
  {
    id: "approval_required",
    evaluate: (op, _runtime, pendingApprovals) => {
      const approvalSteps = op.steps.filter(s => s.requiresApproval).length;
      if (approvalSteps === 0) return null;
      return {
        id:            "dep-approval",
        type:          "approval",
        description:   `${approvalSteps} paso${approvalSteps > 1 ? "s" : ""} requieren aprobación de ORG_ADMIN antes del despacho`,
        blocking:      pendingApprovals === 0,    // blocking if no approver queued
        resolved:      pendingApprovals > 0,
        relatedModule: op.involvedModules[0] ?? "executive",
      };
    },
  },

  // Financial operations need close state validated
  {
    id: "financial_close_state",
    evaluate: (op) => {
      const hasFinancialStep = op.steps.some(s =>
        s.module === "finanzas/cierre" || s.module === "finanzas/conciliacion"
      );
      if (!hasFinancialStep) return null;
      return {
        id:            "dep-financial",
        type:          "financial",
        description:   "El estado del período contable debe validarse antes de ejecutar pasos financieros",
        blocking:      false,    // Warning only — not blocking
        resolved:      false,
        relatedModule: "finanzas/cierre",
      };
    },
  },

  // Multi-module operations need data sync across modules
  {
    id: "data_sync_multimodule",
    evaluate: (op, runtimeState) => {
      if (op.involvedModules.length < 2) return null;
      if (runtimeState === "HEALTHY") return null;
      return {
        id:            "dep-datasync",
        type:          "data_sync",
        description:   "La operación afecta múltiples módulos — se requiere sincronización completa",
        blocking:      runtimeState === "DEGRADED",
        resolved:      false,
        relatedModule: op.involvedModules[0] ?? "executive",
      };
    },
  },

  // High/critical operations need elevated permissions
  {
    id: "elevated_permissions",
    evaluate: (op) => {
      if (op.riskLevel !== "critical" && op.riskLevel !== "high") return null;
      return {
        id:            "dep-permissions",
        type:          "permissions",
        description:   "La operación requiere rol ORG_ADMIN o ORG_OWNER para autorizar el despacho",
        blocking:      false,    // Checked at dispatch time — not pre-blocking
        resolved:      false,
        relatedModule: op.involvedModules[0] ?? "executive",
      };
    },
  },
];

// ── Public API ──────────────────────────────────────────────────────────────────

/**
 * Resolves all execution dependencies for a compound operation.
 */
export function resolveExecutionDependencies(
  operation:        CompoundOperation,
  runtimeState:     string,
  pendingApprovals: number,
): ExecutionDependency[] {
  return DEPENDENCY_RULES
    .map(rule => rule.evaluate(operation, runtimeState, pendingApprovals))
    .filter((d): d is ExecutionDependency => d !== null);
}

/**
 * Returns only the blocking (unresolved) dependencies.
 */
export function detectExecutionBlockers(
  dependencies: ExecutionDependency[],
): ExecutionDependency[] {
  return dependencies.filter(d => d.blocking && !d.resolved);
}

/**
 * Returns a concise human-readable summary of execution dependencies.
 */
export function summarizeExecutionDependencies(
  dependencies: ExecutionDependency[],
): string {
  if (dependencies.length === 0) return "Sin dependencias detectadas";

  const blockers  = dependencies.filter(d => d.blocking && !d.resolved);
  const warnings  = dependencies.filter(d => !d.blocking);

  const parts: string[] = [];
  if (blockers.length > 0) {
    parts.push(`${blockers.length} bloqueo${blockers.length > 1 ? "s" : ""} crítico${blockers.length > 1 ? "s" : ""}`);
  }
  if (warnings.length > 0) {
    parts.push(`${warnings.length} advertencia${warnings.length > 1 ? "s" : ""}`);
  }

  return parts.join(" · ");
}
