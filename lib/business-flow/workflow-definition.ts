/**
 * workflow-definition.ts
 *
 * PRODUCTION-WORKFLOW-01
 * The complete definition of a tenant-configurable business workflow.
 *
 * A workflow definition is a directed graph of stages connected by transitions.
 * It is NOT code — it is configuration. Tenants can create, modify, and version
 * their workflows without deploying code.
 *
 * No Prisma. No React. Pure domain types.
 */

import type { BusinessEntityType } from "@/lib/business-entities/core";
import type { WorkflowDomain, WorkflowMetadata } from "./workflow-types";
import type { WorkflowStageDefinition } from "./workflow-stage";
import type { WorkflowTransition } from "./workflow-transition";

// ── Workflow Definition ──────────────────────────────────────────────────────

/**
 * A complete workflow definition — the blueprint for a business process.
 *
 * Examples:
 * - "Flujo de Produccion Castillitos" (12 stages, production domain)
 * - "Flujo de Compras" (6 stages, purchasing domain)
 * - "Flujo de Cobranza" (5 stages, collection domain)
 * - "Flujo de Onboarding" (4 stages, hr domain)
 */
export interface WorkflowDefinition {
  /** Unique workflow definition ID. */
  id: string;
  /** Tenant organization ID. */
  organizationId: string;
  /** Business domain. */
  domain: WorkflowDomain;
  /** Machine-readable code (e.g. "produccion_castillitos"). */
  code: string;
  /** Human-readable name (e.g. "Flujo de Produccion Castillitos"). */
  name: string;
  /** Description of the process this workflow models. */
  description: string;
  /** The entity type this workflow applies to (e.g. "production_order"). */
  entityType: BusinessEntityType;
  /** Whether this workflow is currently active. */
  enabled: boolean;
  /** Version number — incremented on each edit. */
  version: number;

  // ── Graph Structure ───────────────────────────────────────────────────

  /** Ordered list of stage definitions. */
  stages: WorkflowStageDefinition[];
  /** Code of the initial stage. */
  initialStageCode: string;
  /** Codes of terminal stages (workflow completion). */
  terminalStageCodes: string[];
  /** Transitions between stages (the edges of the graph). */
  transitions: WorkflowTransition[];

  // ── Temporal ──────────────────────────────────────────────────────────

  /** ISO timestamp of creation. */
  createdAt: string;
  /** ISO timestamp of last modification. */
  updatedAt: string;

  /** Arbitrary definition-level metadata. */
  metadata: WorkflowMetadata;
}

// ── Validation ───────────────────────────────────────────────────────────────

/** Result of validating a workflow definition. */
export interface WorkflowValidationResult {
  valid: boolean;
  errors: WorkflowValidationError[];
  warnings: string[];
}

export interface WorkflowValidationError {
  code: string;
  message: string;
  stageCode: string | null;
  transitionId: string | null;
}

/** Validate a workflow definition for structural correctness. */
export function validateWorkflowDefinition(def: WorkflowDefinition): WorkflowValidationResult {
  const errors: WorkflowValidationError[] = [];
  const warnings: string[] = [];
  const stageCodes = new Set(def.stages.map(s => s.code));

  // Must have at least one stage
  if (def.stages.length === 0) {
    errors.push({ code: "NO_STAGES", message: "Workflow must have at least one stage", stageCode: null, transitionId: null });
  }

  // Initial stage must exist
  if (!stageCodes.has(def.initialStageCode)) {
    errors.push({ code: "INVALID_INITIAL", message: `Initial stage '${def.initialStageCode}' not found`, stageCode: def.initialStageCode, transitionId: null });
  }

  // Terminal stages must exist
  for (const tc of def.terminalStageCodes) {
    if (!stageCodes.has(tc)) {
      errors.push({ code: "INVALID_TERMINAL", message: `Terminal stage '${tc}' not found`, stageCode: tc, transitionId: null });
    }
  }

  // Must have at least one terminal stage
  if (def.terminalStageCodes.length === 0) {
    errors.push({ code: "NO_TERMINAL", message: "Workflow must have at least one terminal stage", stageCode: null, transitionId: null });
  }

  // Stage codes must be unique
  const seen = new Set<string>();
  for (const s of def.stages) {
    if (seen.has(s.code)) {
      errors.push({ code: "DUPLICATE_STAGE", message: `Duplicate stage code '${s.code}'`, stageCode: s.code, transitionId: null });
    }
    seen.add(s.code);
  }

  // Transitions must reference valid stages
  for (const t of def.transitions) {
    if (!stageCodes.has(t.sourceStageCode)) {
      errors.push({ code: "INVALID_TRANSITION_SOURCE", message: `Transition source '${t.sourceStageCode}' not found`, stageCode: t.sourceStageCode, transitionId: t.id });
    }
    if (!stageCodes.has(t.targetStageCode)) {
      errors.push({ code: "INVALID_TRANSITION_TARGET", message: `Transition target '${t.targetStageCode}' not found`, stageCode: t.targetStageCode, transitionId: t.id });
    }
  }

  // Non-terminal stages should have at least one outgoing transition
  for (const s of def.stages) {
    if (def.terminalStageCodes.includes(s.code)) continue;
    const outgoing = def.transitions.filter(t => t.sourceStageCode === s.code);
    if (outgoing.length === 0) {
      warnings.push(`Stage '${s.code}' has no outgoing transitions and is not terminal`);
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Get a stage definition by code. */
export function getStage(
  def: WorkflowDefinition,
  stageCode: string,
): WorkflowStageDefinition | undefined {
  return def.stages.find(s => s.code === stageCode);
}

/** Get all stage codes in order. */
export function stageCodesInOrder(def: WorkflowDefinition): string[] {
  return [...def.stages].sort((a, b) => a.order - b.order).map(s => s.code);
}

/** Check if a stage is terminal. */
export function isTerminalStage(def: WorkflowDefinition, stageCode: string): boolean {
  return def.terminalStageCodes.includes(stageCode);
}
