/**
 * lib/copilot/execution-bundles.ts
 *
 * Agentik Copilot — Execution Bundles V2
 *
 * Updated in Sprint AGENTIK-EXECUTION-LAYER-V2-FOUNDATION-01
 * Original: AGENTIK-COPILOT-COMPOUND-OPERATIONS-01
 *
 * V2 additions:
 *   - Expanded ExecutionBundle interface with governance fields
 *   - computeBundleReadiness()
 *   - computeBundleRisk()
 *   - resolveBundleApprovalLevel()
 *   - summarizeBundleExecution()
 *
 * V1 backward compatibility: buildExecutionBundle() signature accepts optional
 * runtimeState argument (default "HEALTHY") — existing callers unaffected.
 *
 * Phase 11 strategy: executionMode defaults to "supervised" — never "automatic".
 */

import type { CompoundOperation, CompoundOperationStep } from "./compound-operations";

// ── Bundle types ──────────────────────────────────────────────────────────────

export type ExecutionGroup =
  | "finance-ops"      // Finanzas, conciliación, tesorería
  | "commercial-ops"   // Ventas, pipeline, marketing
  | "integration-ops"  // Conectores, sincronización
  | "operations-ops"   // Alertas, executive review
  | "mixed";           // Cross-module bundle

export type BundleExecutionMode =
  | "draft"       // Preparation only — no execution intent
  | "supervised"  // Human confirms every step — DEFAULT for V1/V2
  | "assisted"    // AI executes parts, human approves critical steps
  | "automatic";  // RESERVED for V3/V4 — never used in V1/V2

export type BundleApprovalLevel =
  | "none"      // No approval needed
  | "low"       // Soft confirmation
  | "medium"    // Named approval required
  | "high"      // Explicit human review
  | "critical"; // Dual confirmation (financial/close)

export type BundleReadiness = "ready" | "partial" | "blocked";

export interface ExecutionBundle {
  // Identity
  id:               string;
  operationId:      string;
  title:            string;            // Human-readable bundle title
  description:      string;            // What this bundle does
  executionGroup:   ExecutionGroup;

  // Step references
  actionIds:        string[];          // Maps to execution-registry action IDs
  stepIds:          string[];          // Source step IDs in this bundle

  // Risk + impact
  estimatedImpact:  "low" | "medium" | "high" | "critical";
  estimatedRisk:    "low" | "medium" | "high" | "critical";

  // Readiness + approval
  readiness:        BundleReadiness;
  requiresApproval: boolean;
  approvalLevel:    BundleApprovalLevel;

  // Execution control
  executionMode:    BundleExecutionMode;  // Always "draft" or "supervised" in V1/V2
  canAutoExecute:   boolean;              // Always false in V1/V2
  rollbackPossible: boolean;

  // Context
  affectedModules:  string[];
  dependencies:     string[];          // Dependency IDs (populated from dependency engine)
  readinessNote:    string;
}

// ── Module → execution group mapping ─────────────────────────────────────────

function moduleToGroup(module: string): ExecutionGroup {
  if (module.startsWith("finanzas") || module === "collections") return "finance-ops";
  if (module.startsWith("sales") || module.startsWith("pipeline") || module.startsWith("agentik")) return "commercial-ops";
  if (module === "integrations") return "integration-ops";
  if (module === "executive" || module === "alerts") return "operations-ops";
  return "mixed";
}

// ── Impact aggregation ────────────────────────────────────────────────────────

const IMPACT_RANK: Record<string, number> = {
  critical: 3, high: 2, medium: 1, low: 0,
};

function maxImpact(steps: CompoundOperationStep[]): "low" | "medium" | "high" | "critical" {
  const ranked = steps.map(s => IMPACT_RANK[s.estimatedImpact] ?? 0);
  const max    = Math.max(0, ...ranked);
  const keys   = Object.keys(IMPACT_RANK) as Array<"low" | "medium" | "high" | "critical">;
  return keys.find(k => IMPACT_RANK[k] === max) ?? "low";
}

// ── V2 bundle computation helpers ──────────────────────────────────────────────

/**
 * Computes bundle readiness from step states and blocker flags.
 */
export function computeBundleReadiness(
  steps:       CompoundOperationStep[],
  hasBlockers: boolean,
): BundleReadiness {
  if (hasBlockers) return "blocked";
  const blockedSteps = steps.filter(s => s.status === "blocked").length;
  if (blockedSteps > 0) return "blocked";
  const pendingSteps = steps.filter(s => s.status === "pending").length;
  if (pendingSteps > 0) return "partial";
  return "ready";
}

/**
 * Computes bundle risk from impact, module criticality, and step difficulty.
 */
export function computeBundleRisk(
  steps:          CompoundOperationStep[],
  impact:         "low" | "medium" | "high" | "critical",
  executionGroup: ExecutionGroup,
): "low" | "medium" | "high" | "critical" {
  if (executionGroup === "finance-ops" && IMPACT_RANK[impact] < 1) return "medium";
  const hasHighDifficulty = steps.some(s =>
    s.estimatedDifficulty === "high" || s.estimatedDifficulty === "medium"
  );
  if (hasHighDifficulty && impact === "low") return "medium";
  return impact;
}

/**
 * Resolves the approval level for a bundle.
 */
export function resolveBundleApprovalLevel(
  impact:           "low" | "medium" | "high" | "critical",
  requiresApproval: boolean,
  executionGroup:   ExecutionGroup,
  runtimeState:     string,
): BundleApprovalLevel {
  const ORDER: BundleApprovalLevel[] = ["none", "low", "medium", "high", "critical"];

  let level: BundleApprovalLevel =
    requiresApproval       ? "medium"   :
    impact === "critical"  ? "critical" :
    impact === "high"      ? "high"     :
    impact === "medium"    ? "medium"   :
    "low";

  if (executionGroup === "finance-ops" && level === "low") level = "medium";
  if (runtimeState === "DEGRADED") {
    const idx  = ORDER.indexOf(level);
    level = ORDER[Math.min(ORDER.length - 1, idx + 1)] ?? "critical";
  }

  return level;
}

/**
 * Returns a 1-sentence execution summary for rail display.
 */
export function summarizeBundleExecution(bundle: ExecutionBundle): string {
  if (bundle.readiness === "blocked") {
    return "Bloqueado — resolver dependencias antes del despacho";
  }
  if (bundle.approvalLevel === "critical" || bundle.approvalLevel === "high") {
    return `Aprobación ${bundle.approvalLevel} requerida — modo ${bundle.executionMode}`;
  }
  if (bundle.readiness === "partial") {
    return `Listo parcialmente — ${bundle.actionIds.length} acción${bundle.actionIds.length > 1 ? "es" : ""} preparada${bundle.actionIds.length > 1 ? "s" : ""}`;
  }
  return `Listo — ${bundle.actionIds.length} acción${bundle.actionIds.length > 1 ? "es" : ""} en modo ${bundle.executionMode}`;
}

// ── Bundle builder ────────────────────────────────────────────────────────────

const GROUP_TITLES: Record<ExecutionGroup, string> = {
  "finance-ops":     "Operaciones Financieras",
  "commercial-ops":  "Operaciones Comerciales",
  "integration-ops": "Operaciones de Integración",
  "operations-ops":  "Operaciones Ejecutivas",
  "mixed":           "Operaciones Transversales",
};

const GROUP_DESCRIPTIONS: Record<ExecutionGroup, string> = {
  "finance-ops":     "Pasos que afectan finanzas, tesorería, conciliación o cierre de período",
  "commercial-ops":  "Pasos que afectan ventas, pipeline, marketing o seguimiento de leads",
  "integration-ops": "Pasos que afectan conectores, sincronización de datos o runtime",
  "operations-ops":  "Pasos que afectan la revisión ejecutiva y gestión de alertas",
  "mixed":           "Pasos transversales que afectan múltiples dominios operativos",
};

/**
 * Builds V2 execution bundles from a compound operation.
 * Groups steps by module affinity into atomic dispatch units.
 * V1/V2: canAutoExecute = false and mode = "supervised" or "draft" always.
 */
export function buildExecutionBundle(
  operation:    CompoundOperation,
  runtimeState: string = "HEALTHY",
): ExecutionBundle[] {
  const groups = new Map<ExecutionGroup, CompoundOperationStep[]>();

  for (const step of operation.steps) {
    const group = moduleToGroup(step.module);
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group)!.push(step);
  }

  const bundles: ExecutionBundle[] = [];
  let   bundleIndex = 0;

  for (const [group, steps] of groups) {
    const impact          = maxImpact(steps);
    const risk            = computeBundleRisk(steps, impact, group);
    const needsApproval   = steps.some(s => s.requiresApproval);
    const actionIds       = steps.map(s => s.actionId).filter((id): id is string => !!id);
    const hasBlockedSteps = steps.some(s => s.status === "blocked");
    const readiness       = computeBundleReadiness(steps, hasBlockedSteps);
    const approvalLevel   = resolveBundleApprovalLevel(impact, needsApproval, group, runtimeState);
    const rollbackPossible = steps.every(s => (s as any).reversible !== false);
    const affectedModules  = [...new Set(steps.map(s => s.module))];

    const executionMode: BundleExecutionMode =
      hasBlockedSteps || runtimeState === "DEGRADED" ? "draft" : "supervised";

    const readinessNote = needsApproval
      ? `Requiere aprobación ${approvalLevel} de ORG_ADMIN antes del despacho`
      : impact === "critical"
      ? "Operación crítica — confirmar contexto y aprobación antes de ejecutar"
      : readiness === "blocked"
      ? "Hay pasos bloqueados — resolver dependencias primero"
      : "Listo para despacho en modo supervisado";

    bundles.push({
      id:               `${operation.id}-bundle-${bundleIndex}`,
      operationId:      operation.id,
      title:            GROUP_TITLES[group] ?? group,
      description:      GROUP_DESCRIPTIONS[group] ?? "",
      executionGroup:   group,
      actionIds,
      stepIds:          steps.map(s => s.id),
      estimatedImpact:  impact,
      estimatedRisk:    risk,
      readiness,
      requiresApproval: needsApproval,
      approvalLevel,
      executionMode,
      canAutoExecute:   false,
      rollbackPossible,
      affectedModules,
      dependencies:     [],
      readinessNote,
    });

    bundleIndex++;
  }

  return bundles;
}

/**
 * Returns a summary of all bundles for a compound operation.
 */
export function summarizeExecutionBundles(bundles: ExecutionBundle[]): string {
  if (bundles.length === 0) return "Sin acciones preparadas";
  const approvals = bundles.filter(b => b.requiresApproval).length;
  const blocked   = bundles.filter(b => b.readiness === "blocked").length;
  const parts: string[] = [];
  if (blocked > 0)   parts.push(`${blocked} bloqueado${blocked > 1 ? "s" : ""}`);
  if (approvals > 0) parts.push(`${approvals} requieren aprobación`);
  if (parts.length === 0) {
    const ready = bundles.filter(b => b.readiness === "ready").length;
    parts.push(`${ready} grupo${ready > 1 ? "s" : ""} listos`);
  }
  return parts.join(" · ");
}
