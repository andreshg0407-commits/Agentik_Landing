/**
 * lib/work/chaining/workflow-chain-audit.ts
 *
 * Agentik — Workflow Chain Audit / Validation
 * Sprint: AGENTIK-WORKFLOW-CHAINING-01
 *
 * Pure validation logic. Never throws. Always returns a report.
 * No Prisma. No React.
 */

import type { WorkflowChainDefinition, WorkflowStepDefinition } from "./workflow-chain-types";

// ── Report types ──────────────────────────────────────────────────────────────

export interface ChainValidationIssue {
  field:   string;
  message: string;
}

export interface ChainValidationReport {
  valid:    boolean;
  errors:   ChainValidationIssue[];
  warnings: ChainValidationIssue[];
}

// ── Step validation ───────────────────────────────────────────────────────────

function validateStep(
  step:     WorkflowStepDefinition,
  allSteps: WorkflowStepDefinition[],
): ChainValidationIssue[] {
  const errors: ChainValidationIssue[] = [];
  const allIds = new Set(allSteps.map(s => s.id));

  if (!step.id?.trim()) {
    errors.push({ field: `steps[].id`, message: "Step ID es requerido." });
  }
  if (!step.module?.trim()) {
    errors.push({ field: `step[${step.id}].module`, message: `Step "${step.id}" no tiene módulo.` });
  }
  if (!step.actionType?.trim()) {
    errors.push({ field: `step[${step.id}].actionType`, message: `Step "${step.id}" no tiene actionType.` });
  }
  if (typeof step.requiresApproval !== "boolean") {
    errors.push({ field: `step[${step.id}].requiresApproval`, message: `Step "${step.id}" requiresApproval debe ser boolean explícito.` });
  }
  if (step.dependsOn) {
    for (const depId of step.dependsOn) {
      if (!allIds.has(depId)) {
        errors.push({ field: `step[${step.id}].dependsOn`, message: `Step "${step.id}" depende de "${depId}" que no existe.` });
      }
      if (depId === step.id) {
        errors.push({ field: `step[${step.id}].dependsOn`, message: `Step "${step.id}" no puede depender de sí mismo.` });
      }
    }
  }
  if (step.onSuccess && !allIds.has(step.onSuccess)) {
    errors.push({ field: `step[${step.id}].onSuccess`, message: `onSuccess "${step.onSuccess}" no existe en la cadena.` });
  }

  return errors;
}

// ── Cycle detection ───────────────────────────────────────────────────────────

function detectCycles(steps: WorkflowStepDefinition[]): ChainValidationIssue[] {
  const issues: ChainValidationIssue[] = [];
  const visited  = new Set<string>();
  const inStack  = new Set<string>();
  const stepById = new Map(steps.map(s => [s.id, s]));

  function dfs(id: string): boolean {
    if (inStack.has(id)) return true;   // cycle
    if (visited.has(id)) return false;
    visited.add(id);
    inStack.add(id);

    const step = stepById.get(id);
    if (step) {
      const nexts: string[] = [];
      if (step.onSuccess) nexts.push(step.onSuccess);
      // Sequential next
      const idx = steps.findIndex(s => s.id === id);
      if (idx !== -1 && idx + 1 < steps.length && !step.onSuccess) {
        nexts.push(steps[idx + 1].id);
      }
      for (const nextId of nexts) {
        if (dfs(nextId)) {
          issues.push({ field: "steps", message: `Ciclo detectado involucrando step "${id}" → "${nextId}".` });
          return true;
        }
      }
    }

    inStack.delete(id);
    return false;
  }

  for (const step of steps) {
    if (!visited.has(step.id)) dfs(step.id);
  }

  return issues;
}

// ── Chain validation ──────────────────────────────────────────────────────────

/**
 * Validate a WorkflowChainDefinition before registering or executing.
 * Returns errors (blocking) and warnings (non-blocking).
 */
export function validateChainDefinition(
  chain: WorkflowChainDefinition,
): ChainValidationReport {
  const errors:   ChainValidationIssue[] = [];
  const warnings: ChainValidationIssue[] = [];

  // Required fields
  if (!chain.id?.trim())   errors.push({ field: "id",   message: "Chain ID es requerido."   });
  if (!chain.name?.trim()) errors.push({ field: "name", message: "Chain name es requerido." });

  // Must have steps
  if (!chain.steps || chain.steps.length === 0) {
    errors.push({ field: "steps", message: "La cadena debe tener al menos un step." });
    return { valid: false, errors, warnings };
  }

  // Too many steps
  if (chain.steps.length > 20) {
    errors.push({ field: "steps", message: "La cadena no puede tener más de 20 steps." });
  }

  // Inactive chain warning
  if (!chain.isActive) {
    warnings.push({ field: "isActive", message: "La cadena está inactiva y no disparará ejecuciones." });
  }

  // Validate each step
  for (const step of chain.steps) {
    errors.push(...validateStep(step, chain.steps));
  }

  // Cycle detection (only if no structural errors)
  if (errors.length === 0) {
    errors.push(...detectCycles(chain.steps));
  }

  // Approval steps warning — must have explicit requiresApproval
  const noApprovalDefined = chain.steps.filter(
    s => s.module !== "management" && !s.requiresApproval,
  );
  if (noApprovalDefined.length === chain.steps.length) {
    warnings.push({
      field:   "requiresApproval",
      message: "Ningún step requiere aprobación. Considera si la cadena completa puede ejecutarse sin supervisión humana.",
    });
  }

  // Payload template warnings
  for (const step of chain.steps) {
    if (step.payloadTemplate && typeof step.payloadTemplate !== "object") {
      warnings.push({ field: `step[${step.id}].payloadTemplate`, message: "payloadTemplate debe ser un objeto plano." });
    }
  }

  return {
    valid:    errors.length === 0,
    errors,
    warnings,
  };
}

// ── Registry validation ───────────────────────────────────────────────────────

export function validateAllChains(
  chains: WorkflowChainDefinition[],
): Record<string, ChainValidationReport> {
  const reports: Record<string, ChainValidationReport> = {};
  for (const chain of chains) {
    reports[chain.id] = validateChainDefinition(chain);
  }
  return reports;
}
