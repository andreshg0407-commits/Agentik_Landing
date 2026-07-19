/**
 * lib/copilot/approval-engine.ts
 *
 * Agentik Copilot — Approval Engine V1
 *
 * Phase 3 of Sprint AGENTIK-EXECUTION-LAYER-V2-FOUNDATION-01
 *
 * Builds approval requests and governs review requirements for
 * execution bundles before they can proceed to dispatch.
 *
 * Rules V1:
 *   - Never auto-approve anything.
 *   - Every medium/high/critical bundle requires human review.
 *   - Runtime DEGRADED escalates approval level.
 *   - Multi-module operations increase risk.
 *
 * V1: interface + deterministic logic, no DB, no side effects.
 * V2: Prisma.CopilotApprovalRequest + real notification to approver.
 */

// ── Types ──────────────────────────────────────────────────────────────────────

export type ApprovalLevel =
  | "none"      // No approval needed — low-risk, read-only operations
  | "low"       // Soft confirmation — single-click acknowledge
  | "medium"    // Named approval — agent identifies risk to the user
  | "high"      // Explicit human review — requires active decision
  | "critical"; // Financial/close operations — dual confirmation in V2

export interface ApprovalRequest {
  id:                   string;
  bundleId:             string;
  title:                string;
  reason:               string;          // Why approval is needed
  requestedByAgent:     string;
  approvalLevel:        ApprovalLevel;
  affectedModules:      string[];
  riskSummary:          string;          // 1-sentence risk description
  requiresHumanReview:  boolean;
  canAutoApprove:       false;           // V1 lock — always requires human
  estimatedImpact:      string;          // What happens when approved
  createdAt:            string;          // Relative time — serializable
}

// ── Approval level resolution ──────────────────────────────────────────────────

const IMPACT_APPROVAL: Record<string, ApprovalLevel> = {
  critical: "critical",
  high:     "high",
  medium:   "medium",
  low:      "low",
};

const RUNTIME_ESCALATION: Record<string, number> = {
  DEGRADED: 2,   // Escalate 2 levels (low→high, medium→critical)
  STALE:    1,   // Escalate 1 level
  SYNCING:  0,
  HEALTHY:  0,
};

const APPROVAL_LEVELS_ORDERED: ApprovalLevel[] = ["none", "low", "medium", "high", "critical"];

function escalateApprovalLevel(base: ApprovalLevel, steps: number): ApprovalLevel {
  const idx     = APPROVAL_LEVELS_ORDERED.indexOf(base);
  const newIdx  = Math.min(APPROVAL_LEVELS_ORDERED.length - 1, idx + steps);
  return APPROVAL_LEVELS_ORDERED[newIdx] ?? "critical";
}

// ── Risk summaries ────────────────────────────────────────────────────────────

const RISK_SUMMARIES: Record<string, string> = {
  "finance-ops":     "Operación financiera — afecta flujos de caja, conciliaciones o cierres",
  "commercial-ops":  "Operación comercial — afecta pipeline, campañas o seguimiento de ventas",
  "integration-ops": "Operación de integración — afecta conectores y sincronización de datos",
  "operations-ops":  "Operación ejecutiva — afecta revisión y alertas operacionales",
  "mixed":           "Operación multi-módulo — requiere validación cruzada antes del despacho",
};

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Resolves the approval level for a bundle given its impact and context.
 */
export function resolveApprovalLevel(params: {
  estimatedImpact: "low" | "medium" | "high" | "critical";
  requiresApproval: boolean;
  runtimeState:    string;
  affectedModules: string[];
}): ApprovalLevel {
  const { estimatedImpact, requiresApproval, runtimeState, affectedModules } = params;

  // Force at least medium if bundle flags requiresApproval
  let base: ApprovalLevel = requiresApproval
    ? "medium"
    : IMPACT_APPROVAL[estimatedImpact] ?? "low";

  // Escalate for runtime health
  const escalation = RUNTIME_ESCALATION[runtimeState] ?? 0;
  base = escalateApprovalLevel(base, escalation);

  // Multi-module operations get +1 escalation
  if (affectedModules.length >= 3) {
    base = escalateApprovalLevel(base, 1);
  }

  return base;
}

/**
 * Determines whether human review is required for a given approval level.
 */
export function resolveHumanReviewNeed(
  approvalLevel: ApprovalLevel,
  runtimeState:  string,
): boolean {
  // Always require review for medium and above
  if (approvalLevel === "medium" || approvalLevel === "high" || approvalLevel === "critical") {
    return true;
  }
  // Also require review if runtime is degraded, even for low-level bundles
  if (runtimeState === "DEGRADED") {
    return true;
  }
  return false;
}

/**
 * Builds an approval request for a given bundle.
 */
export function buildApprovalRequest(params: {
  bundleId:        string;
  bundleTitle:     string;
  executionGroup:  string;
  agentId:         string;
  approvalLevel:   ApprovalLevel;
  affectedModules: string[];
  estimatedImpact: string;
  runtimeState:    string;
}): ApprovalRequest {
  const {
    bundleId, bundleTitle, executionGroup, agentId,
    approvalLevel, affectedModules, estimatedImpact, runtimeState,
  } = params;

  const requiresHumanReview = resolveHumanReviewNeed(approvalLevel, runtimeState);

  const LEVEL_REASON: Record<ApprovalLevel, string> = {
    none:     "Operación de bajo impacto sin dependencias críticas",
    low:      "La operación requiere confirmación simple antes del despacho",
    medium:   "La operación afecta datos operativos — revisión humana requerida",
    high:     "La operación tiene alto impacto — requiere decisión explícita del operador",
    critical: "Operación financiera crítica — requiere doble confirmación y validación de contexto",
  };

  return {
    id:                  `apr-${bundleId}`,
    bundleId,
    title:               `Aprobación requerida — ${bundleTitle}`,
    reason:              LEVEL_REASON[approvalLevel] ?? LEVEL_REASON.medium,
    requestedByAgent:    agentId,
    approvalLevel,
    affectedModules,
    riskSummary:         RISK_SUMMARIES[executionGroup] ?? "Operación requiere validación antes del despacho",
    requiresHumanReview,
    canAutoApprove:      false,
    estimatedImpact:     `Impacto ${estimatedImpact} — ${affectedModules.join(", ")}`,
    createdAt:           "esta sesión",
  };
}

/**
 * Returns a 1-sentence summary of the approval risk for rail display.
 */
export function summarizeApprovalRisk(request: ApprovalRequest): string {
  if (request.approvalLevel === "critical") {
    return "Riesgo crítico — operación financiera requiere aprobación explícita";
  }
  if (request.approvalLevel === "high") {
    return "Riesgo alto — se requiere revisión y decisión del operador";
  }
  if (request.approvalLevel === "medium") {
    return "Revisión requerida antes del despacho";
  }
  return "Confirmación requerida para proceder";
}
