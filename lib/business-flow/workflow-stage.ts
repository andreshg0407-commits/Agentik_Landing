/**
 * workflow-stage.ts
 *
 * PRODUCTION-WORKFLOW-01
 * Fully configurable workflow stage definition.
 *
 * Every property is tenant-configurable. No hardcoded names,
 * durations, or behaviors. The definition gives meaning to the stage.
 *
 * No Prisma. No React. Pure domain types.
 */

import type { WorkflowMetadata } from "./workflow-types";

// ── Stage Definition ─────────────────────────────────────────────────────────

/**
 * A single configurable stage within a workflow definition.
 *
 * Examples:
 * - Production: "corte", "estampacion", "bordado", "confeccion"
 * - Purchasing: "solicitud", "aprobacion", "orden_compra", "recepcion"
 * - Collection: "factura_emitida", "primer_contacto", "cobro", "conciliacion"
 * - HR: "solicitud", "entrevista", "evaluacion", "contratacion"
 */
export interface WorkflowStageDefinition {
  /** Unique stage ID within the workflow definition. */
  id: string;
  /** Machine-readable code (e.g. "corte", "estampacion"). Unique within workflow. */
  code: string;
  /** Human-readable name (e.g. "Corte", "Estampacion"). */
  name: string;
  /** Description of what happens in this stage. */
  description: string;
  /** Display order (1-based). */
  order: number;

  // ── Visual ────────────────────────────────────────────────────────────

  /** Icon identifier (Lucide icon name or emoji). */
  icon: string | null;
  /** Brand color hex for UI rendering. */
  color: string | null;

  // ── Timing ────────────────────────────────────────────────────────────

  /** Expected duration in hours. Null if unknown. */
  estimatedDurationHours: number | null;
  /** SLA deadline in hours from stage entry. Null if no SLA. */
  slaHours: number | null;

  // ── Permissions ───────────────────────────────────────────────────────

  /** Role codes that can operate this stage. Empty = any role. */
  requiredRoles: string[];

  // ── Behavior Flags ────────────────────────────────────────────────────

  /** Can this stage be skipped (non-mandatory)? */
  allowSkip: boolean;
  /** Can work be split at this stage (e.g. partial batches)? */
  allowSplit: boolean;
  /** Can work from parallel branches be merged at this stage? */
  allowMerge: boolean;
  /** Does this stage require approval before proceeding? */
  requiresApproval: boolean;

  // ── Side Effects ──────────────────────────────────────────────────────

  /** Does this stage generate or consume inventory? */
  generatesInventory: boolean;
  /** Does this stage generate costs (labor, material, overhead)? */
  generatesCost: boolean;
  /** Does this stage emit business events? */
  generatesEvents: boolean;
  /** Does this stage trigger alerts? */
  generatesAlerts: boolean;
  /** Does this stage create timeline entries? */
  generatesTimeline: boolean;

  /** Arbitrary stage-specific metadata. */
  metadata: WorkflowMetadata;
}

// ── Stage Builder ────────────────────────────────────────────────────────────

/** Build a WorkflowStageDefinition with sensible defaults. */
export function buildStage(opts: {
  code: string;
  name: string;
  order: number;
  description?: string;
  icon?: string;
  color?: string;
  estimatedDurationHours?: number;
  slaHours?: number;
  requiredRoles?: string[];
  allowSkip?: boolean;
  allowSplit?: boolean;
  allowMerge?: boolean;
  requiresApproval?: boolean;
  generatesInventory?: boolean;
  generatesCost?: boolean;
  generatesEvents?: boolean;
  generatesAlerts?: boolean;
  generatesTimeline?: boolean;
  metadata?: WorkflowMetadata;
}): WorkflowStageDefinition {
  return {
    id: `stage-${opts.code}`,
    code: opts.code,
    name: opts.name,
    description: opts.description ?? "",
    order: opts.order,
    icon: opts.icon ?? null,
    color: opts.color ?? null,
    estimatedDurationHours: opts.estimatedDurationHours ?? null,
    slaHours: opts.slaHours ?? null,
    requiredRoles: opts.requiredRoles ?? [],
    allowSkip: opts.allowSkip ?? false,
    allowSplit: opts.allowSplit ?? false,
    allowMerge: opts.allowMerge ?? false,
    requiresApproval: opts.requiresApproval ?? false,
    generatesInventory: opts.generatesInventory ?? false,
    generatesCost: opts.generatesCost ?? false,
    generatesEvents: opts.generatesEvents ?? true,
    generatesAlerts: opts.generatesAlerts ?? false,
    generatesTimeline: opts.generatesTimeline ?? true,
    metadata: opts.metadata ?? {},
  };
}
