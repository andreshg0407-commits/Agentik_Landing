/**
 * lib/copilot/execution-governance.ts
 *
 * Agentik Copilot — Execution Governance Engine V3
 *
 * Phase 5 of Sprint AGENTIK-EXECUTION-LAYER-V2-FOUNDATION-01
 * Phase 11 of Sprint AGENTIK-EXECUTION-LAYER-V3-CONTROLLED-OPS-01
 *
 * Acts as the final gate before any execution bundle can proceed.
 * Validates the complete execution context against safety rules.
 *
 * V3 Hard Rules:
 *   1. Runtime DEGRADED: automatic forbidden, assisted restricted, supervised only
 *   2. High risk: mandatory human approval (hard block if none)
 *   3. Multi-module bundles (≥ 2): elevated governance
 *   4. Rollback unsupported: cannot execute automatically or assisted
 *   5. Missing dependencies: execution blocked
 *
 * V3: deterministic governance — no DB, no side effects.
 * V4: audit every governance decision to Prisma.CopilotGovernanceLog.
 */

import type { ExecutionModeV2 } from "./execution-state-machine";

// ── Types ──────────────────────────────────────────────────────────────────────

export type GovernanceRiskLevel = "none" | "low" | "medium" | "high" | "critical";

export interface ExecutionGovernanceResult {
  allowed:          boolean;
  reason:           string;              // Why allowed or denied
  riskLevel:        GovernanceRiskLevel;
  requiresApproval: boolean;
  executionMode:    ExecutionModeV2;     // What mode is permitted
  blockedBy:        string[];            // List of specific blockers
  warnings:         string[];            // Non-blocking governance notes
}

// ── Governance rules ───────────────────────────────────────────────────────────

interface GovernanceRule {
  id:       string;
  check: (params: {
    runtimeState:      string;
    tenantState:       string;
    approvalLevel:     string;
    affectedModules:   string[];
    executionMode:     ExecutionModeV2;
    hasBlockers:       boolean;
    agentId:           string;
    pendingApprovals:  number;
    rollbackSupported?: boolean;   // Phase 11: rollback availability
    estimatedRisk?:    string;     // Phase 11: "low"|"medium"|"high"|"critical"
  }) => { blocked: boolean; blocker?: string; warning?: string; riskBoost?: number } | null;
}

const GOVERNANCE_RULES: GovernanceRule[] = [

  // CRITICAL (Phase 11 Rule 1): runtime DEGRADED → automatic forbidden, assisted restricted, supervised only
  {
    id: "no_automatic_on_degraded",
    check: ({ runtimeState, executionMode }) => {
      if (runtimeState === "DEGRADED" && executionMode === "automatic") {
        return {
          blocked: true,
          blocker: "Runtime degradado — modo automático bloqueado por política de seguridad crítica",
          riskBoost: 3,
        };
      }
      if (runtimeState === "DEGRADED" && executionMode === "assisted") {
        return {
          blocked: true,
          blocker: "Runtime degradado — modo asistido restringido, solo modo supervisado permitido",
          riskBoost: 2,
        };
      }
      if (runtimeState === "DEGRADED") {
        return {
          blocked: false,
          warning: "Runtime degradado — solo modo supervisado activo, aprobación humana requerida",
          riskBoost: 2,
        };
      }
      return null;
    },
  },

  // Tenant in critical state cannot execute high/critical bundles
  {
    id: "tenant_state_check",
    check: ({ tenantState, approvalLevel }) => {
      if (tenantState === "critical") {
        const isHighRisk = approvalLevel === "high" || approvalLevel === "critical";
        return {
          blocked: isHighRisk,
          blocker: isHighRisk ? "Tenant en estado crítico — operaciones de alto impacto bloqueadas" : undefined,
          warning: !isHighRisk ? "Tenant en estado crítico — validar contexto antes de continuar" : undefined,
          riskBoost: isHighRisk ? 2 : 1,
        };
      }
      if (tenantState === "degraded") {
        return {
          blocked: false,
          warning: "Tenant degradado — confirmar disponibilidad de datos antes del despacho",
          riskBoost: 1,
        };
      }
      return null;
    },
  },

  // High-impact operations require explicit pending approval
  {
    id: "approval_gate",
    check: ({ approvalLevel, pendingApprovals }) => {
      if (
        (approvalLevel === "high" || approvalLevel === "critical") &&
        pendingApprovals === 0
      ) {
        return {
          blocked: false,                // Not hard-blocked — but approval is required
          warning: "Aprobación de alto nivel requerida — operación pausada hasta confirmar",
          riskBoost: 1,
        };
      }
      return null;
    },
  },

  // Multi-module operations get elevated risk
  {
    id: "multi_module_risk",
    check: ({ affectedModules }) => {
      if (affectedModules.length >= 3) {
        return {
          blocked: false,
          warning: `Operación afecta ${affectedModules.length} módulos — riesgo de impacto cruzado`,
          riskBoost: 1,
        };
      }
      return null;
    },
  },

  // Blockers from dependency engine must prevent execution
  {
    id: "dependency_blockers",
    check: ({ hasBlockers }) => {
      if (hasBlockers) {
        return {
          blocked: true,
          blocker: "Dependencias bloqueantes sin resolver — ejecución detenida",
          riskBoost: 2,
        };
      }
      return null;
    },
  },

  // Phase 11 Rule 2: High/critical risk → mandatory human approval
  {
    id: "high_risk_mandatory_approval",
    check: ({ estimatedRisk, pendingApprovals, executionMode }) => {
      if (
        (estimatedRisk === "high" || estimatedRisk === "critical") &&
        pendingApprovals === 0 &&
        executionMode !== "draft"
      ) {
        return {
          blocked: true,
          blocker: `Riesgo ${estimatedRisk} — aprobación humana obligatoria antes de ejecutar`,
          riskBoost: estimatedRisk === "critical" ? 3 : 2,
        };
      }
      return null;
    },
  },

  // Phase 11 Rule 3: Multi-module bundles (≥ 2) → elevated governance
  {
    id: "multi_module_elevated_governance",
    check: ({ affectedModules }) => {
      if (affectedModules.length >= 2) {
        return {
          blocked: false,
          warning: `Bundle multi-módulo (${affectedModules.length} módulos) — gobernanza elevada requerida`,
          riskBoost: 1,
        };
      }
      return null;
    },
  },

  // Phase 11 Rule 4: Rollback unsupported → cannot execute automatically or assisted
  {
    id: "rollback_unsupported_restricts_execution",
    check: ({ rollbackSupported, executionMode }) => {
      if (
        rollbackSupported === false &&
        (executionMode === "automatic" || executionMode === "assisted")
      ) {
        return {
          blocked: true,
          blocker: "Reversión no disponible — modos automático y asistido bloqueados sin rollback",
          riskBoost: 2,
        };
      }
      if (rollbackSupported === false) {
        return {
          blocked: false,
          warning: "Reversión no disponible para esta operación — confirmar antes de proceder",
          riskBoost: 1,
        };
      }
      return null;
    },
  },
];

// ── Risk aggregation ──────────────────────────────────────────────────────────

const RISK_LEVELS: GovernanceRiskLevel[] = ["none", "low", "medium", "high", "critical"];

function computeGovernanceRisk(
  baseApprovalLevel: string,
  riskBoostTotal:    number,
): GovernanceRiskLevel {
  const BASE_RISK: Record<string, number> = {
    none:     0,
    low:      1,
    medium:   2,
    high:     3,
    critical: 4,
  };

  const base    = BASE_RISK[baseApprovalLevel] ?? 1;
  const total   = Math.min(4, base + riskBoostTotal);
  return RISK_LEVELS[total] ?? "critical";
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Evaluates execution governance for a bundle.
 * Returns a governance decision with full rationale.
 */
export function evaluateExecutionGovernance(params: {
  runtimeState:      string;
  tenantState:       string;
  approvalLevel:     string;
  affectedModules:   string[];
  executionMode:     ExecutionModeV2;
  hasBlockers:       boolean;
  agentId:           string;
  pendingApprovals:  number;
  rollbackSupported?: boolean;   // Phase 11
  estimatedRisk?:    string;     // Phase 11
}): ExecutionGovernanceResult {
  const blockers: string[] = [];
  const warnings: string[] = [];
  let   riskBoostTotal = 0;
  let   isBlocked      = false;

  for (const rule of GOVERNANCE_RULES) {
    const result = rule.check(params);
    if (!result) continue;

    riskBoostTotal += result.riskBoost ?? 0;

    if (result.blocked && result.blocker) {
      isBlocked = true;
      blockers.push(result.blocker);
    } else if (result.warning) {
      warnings.push(result.warning);
    }
  }

  const riskLevel = computeGovernanceRisk(params.approvalLevel, riskBoostTotal);

  // Determine permitted execution mode
  const permittedMode: ExecutionModeV2 =
    isBlocked ? "draft" :
    params.runtimeState === "DEGRADED" ? "supervised" :
    params.executionMode === "automatic" ? "supervised" :  // Downgrade automatic → supervised
    params.executionMode;

  const requiresApproval =
    params.approvalLevel === "medium" ||
    params.approvalLevel === "high"   ||
    params.approvalLevel === "critical";

  const reason = isBlocked
    ? `Ejecución bloqueada: ${blockers[0] ?? "dependencias sin resolver"}`
    : requiresApproval
    ? `Revisión humana requerida — nivel ${params.approvalLevel}`
    : warnings.length > 0
    ? `Ejecución permitida con advertencias — ${warnings[0]}`
    : "Ejecución permitida — sin bloqueos críticos";

  return {
    allowed:          !isBlocked,
    reason,
    riskLevel,
    requiresApproval,
    executionMode:    permittedMode,
    blockedBy:        blockers,
    warnings,
  };
}
