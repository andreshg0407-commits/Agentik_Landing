/**
 * lib/copilot/capability-governance.ts
 *
 * Agentik Copilot — Capability Governance V1
 *
 * Phase B4 of Sprint AGENTIK-STRATEGIC-MEMORY-AND-CAPABILITIES-01
 *
 * Evaluates whether a capability can be activated given the current
 * runtime state, tenant state, approval state, and capability metadata.
 *
 * V1: deterministic rule engine — no DB, no async.
 */

import type { AgentCapability }              from "./capability-registry";
import type { CapabilityAvailabilityResult } from "./capability-resolver";

// ── Types ──────────────────────────────────────────────────────────────────────

export interface CapabilityGovernance {
  allowed:          boolean;
  reason:           string;
  blockedBy:        string[];       // Rule IDs that caused blocking
  riskLevel:        "low" | "medium" | "high" | "critical";
  requiresApproval: boolean;
  warnings:         string[];       // Non-blocking concerns
}

// ── Governance rules ───────────────────────────────────────────────────────────

interface GovernanceRule {
  id:       string;
  evaluate: (
    cap:              AgentCapability,
    runtimeState:     string,
    tenantState:      string,
    pendingApprovals: number,
  ) => { blocked: boolean; warning?: boolean; message: string } | null;
}

const GOVERNANCE_RULES: GovernanceRule[] = [

  // Rule 1: Runtime DEGRADED blocks ALL integration capabilities
  {
    id: "runtime_degraded_blocks_integration",
    evaluate(cap, runtimeState) {
      if (runtimeState === "DEGRADED" && cap.type === "integration") {
        return {
          blocked: true,
          message: "Runtime degradado — capacidades de integración no disponibles",
        };
      }
      return null;
    },
  },

  // Rule 2: Runtime DEGRADED restricts execution capabilities to supervised
  {
    id: "runtime_degraded_restricts_execution",
    evaluate(cap, runtimeState) {
      if (runtimeState === "DEGRADED" && cap.type === "execution") {
        if (!cap.executionModes.includes("supervised")) {
          return {
            blocked: true,
            message: "Runtime degradado — ejecución sin supervisión no permitida",
          };
        }
        return {
          blocked: false,
          warning: true,
          message: "Runtime degradado — supervisión adicional requerida para ejecución",
        };
      }
      return null;
    },
  },

  // Rule 3: Tenant INACTIVE blocks execution and communication capabilities
  {
    id: "tenant_inactive_blocks_execution",
    evaluate(cap, _runtime, tenantState) {
      if (
        tenantState === "inactive" &&
        (cap.type === "execution" || cap.type === "communication")
      ) {
        return {
          blocked: true,
          message: "Tenant inactivo — capacidades de ejecución y comunicación deshabilitadas",
        };
      }
      return null;
    },
  },

  // Rule 4: Missing approval for ORG_ADMIN-required capabilities
  {
    id: "missing_approval_restricts_execution",
    evaluate(cap, _runtime, _tenant, pendingApprovals) {
      if (
        cap.requiredPermissions.includes("ORG_ADMIN") &&
        cap.riskLevel !== "low" &&
        pendingApprovals === 0
      ) {
        return {
          blocked: false,
          warning: true,
          message: "Requiere aprobación ORG_ADMIN — operación restringida hasta autorización",
        };
      }
      return null;
    },
  },

  // Rule 5: Critical-risk capabilities always require explicit approval
  {
    id: "critical_risk_requires_approval",
    evaluate(cap, _runtime, _tenant, pendingApprovals) {
      if (cap.riskLevel === "critical" && pendingApprovals === 0) {
        return {
          blocked: true,
          message: "Capacidad de riesgo crítico — aprobación explícita requerida",
        };
      }
      return null;
    },
  },

  // Rule 6: Runtime STALE warns on integration + analytical capabilities
  {
    id: "stale_runtime_warns_integration",
    evaluate(cap, runtimeState) {
      if (runtimeState === "STALE" && (cap.type === "integration" || cap.type === "analytical")) {
        return {
          blocked: false,
          warning: true,
          message: "Datos pendientes de sincronización — resultados pueden estar desactualizados",
        };
      }
      return null;
    },
  },
];

// ── Public API ──────────────────────────────────────────────────────────────────

/**
 * Evaluates governance rules for a single capability.
 * Returns a comprehensive governance decision.
 */
export function evaluateCapabilityGovernance(
  cap:              AgentCapability,
  runtimeState:     string,
  tenantState:      string,
  pendingApprovals: number,
): CapabilityGovernance {
  const blockedBy:  string[] = [];
  const warnings:   string[] = [];
  let primaryReason = "";

  for (const rule of GOVERNANCE_RULES) {
    const result = rule.evaluate(cap, runtimeState, tenantState, pendingApprovals);
    if (!result) continue;

    if (result.blocked) {
      blockedBy.push(rule.id);
      if (!primaryReason) primaryReason = result.message;
    } else if (result.warning) {
      warnings.push(result.message);
    }
  }

  const allowed = blockedBy.length === 0;

  // Determine risk level from blockers
  let riskLevel: CapabilityGovernance["riskLevel"] = cap.riskLevel === "critical"
    ? "critical"
    : cap.riskLevel === "high"
    ? "high"
    : blockedBy.length > 0
    ? "medium"
    : cap.riskLevel;

  if (blockedBy.includes("critical_risk_requires_approval")) {
    riskLevel = "critical";
  }

  const requiresApproval =
    !allowed ||
    cap.requiredPermissions.includes("ORG_ADMIN") ||
    cap.riskLevel === "critical" ||
    cap.riskLevel === "high";

  return {
    allowed,
    reason:  allowed
      ? (warnings[0] ?? `Capacidad disponible — ${cap.name}`)
      : primaryReason,
    blockedBy,
    riskLevel,
    requiresApproval,
    warnings,
  };
}

/**
 * Evaluates governance for all capabilities in a resolved set.
 * Returns the governance decision for each capability.
 */
export function evaluateCapabilitiesGovernance(
  results:          CapabilityAvailabilityResult[],
  runtimeState:     string,
  tenantState:      string,
  pendingApprovals: number,
): Map<string, CapabilityGovernance> {
  const map = new Map<string, CapabilityGovernance>();
  for (const r of results) {
    map.set(
      r.capability.id,
      evaluateCapabilityGovernance(r.capability, runtimeState, tenantState, pendingApprovals),
    );
  }
  return map;
}

/**
 * Returns a 1-line governance summary for rail display.
 */
export function summarizeCapabilityGovernance(
  results:     CapabilityAvailabilityResult[],
  governance:  Map<string, CapabilityGovernance>,
): string {
  const blocked  = results.filter(r => !governance.get(r.capability.id)?.allowed).length;
  const warnings = results.filter(r => {
    const g = governance.get(r.capability.id);
    return g?.allowed && (g.warnings.length > 0 || g.requiresApproval);
  }).length;

  if (blocked > 0) {
    return `${blocked} capacidad${blocked > 1 ? "es" : ""} bloqueada${blocked > 1 ? "s" : ""} por gobernanza`;
  }
  if (warnings > 0) {
    return `${warnings} capacidad${warnings > 1 ? "es" : ""} con restricción activa`;
  }
  return "Gobernanza: todas las capacidades operativas";
}
