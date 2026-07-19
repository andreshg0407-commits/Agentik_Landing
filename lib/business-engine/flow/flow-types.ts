/**
 * flow-types.ts
 *
 * AGENTIK-ARCHITECTURE-BUSINESS-ENGINE-01
 * Business Flow Engine — configurable workflow contracts.
 *
 * Agentik models processes, it does NOT impose processes.
 * Every operational workflow (production, purchasing, quality, dispatch)
 * is a tenant-configurable flow — never hardcoded.
 */

// ── Flow Domain ───────────────────────────────────────────────────────────────

/** The business domains that can have configurable flows. */
export type FlowDomain =
  | "production"
  | "purchasing"
  | "commercial"
  | "collection"
  | "inventory"
  | "quality"
  | "dispatch"
  | "hr"
  | "approval"
  | "automation";

// ── Stage Definition ──────────────────────────────────────────────────────────

/** A single configurable stage within a workflow. */
export interface FlowStageDefinition {
  /** Unique code within the flow (e.g. "corte", "estampacion"). */
  code: string;
  /** Human-readable name. */
  name: string;
  /** Display order (1-based). */
  order: number;
  /** Brand color hex for UI. */
  color: string | null;
  /** Icon identifier (Lucide icon name or similar). */
  icon: string | null;
  /** Expected duration in hours. */
  expectedDurationHours: number | null;
  /** SLA deadline in hours from stage entry. */
  slaHours: number | null;
  /** Role codes that can operate this stage. */
  responsibleRoles: string[];
  /** Permission codes required to interact with this stage. */
  permissions: string[];

  // ── Behavior flags ──────────────────────────────────────────────────────

  /** Does this stage consume raw material inventory? */
  consumesInventory: boolean;
  /** Does this stage generate costs (labor, material, overhead)? */
  generatesCosts: boolean;
  /** Does this stage emit business events? */
  generatesEvents: boolean;
  /** Does this stage trigger notifications? */
  generatesNotifications: boolean;
  /** Does this stage require approval before proceeding? */
  requiresApproval: boolean;
  /** Can production be split at this stage (e.g. partial batches)? */
  canSplitProduction: boolean;
  /** Can this stage be skipped (non-mandatory)? */
  canBeSkipped: boolean;
  /** Is this stage mandatory for flow completion? */
  isMandatory: boolean;

  // ── Transitions ─────────────────────────────────────────────────────────

  /** Codes of stages that can follow this one. Empty = terminal stage. */
  nextStages: string[];
}

// ── Flow Definition ───────────────────────────────────────────────────────────

/** A complete tenant-configurable workflow definition. */
export interface FlowDefinition {
  /** Unique flow ID. */
  id: string;
  /** Tenant organization ID. */
  organizationId: string;
  /** Business domain this flow belongs to. */
  domain: FlowDomain;
  /** Human-readable flow name (e.g. "Flujo de Produccion Castillitos"). */
  name: string;
  /** Ordered list of stages. */
  stages: FlowStageDefinition[];
  /** Code of the initial stage. */
  entryStageCode: string;
  /** Codes of terminal stages (flow completion). */
  exitStageCodes: string[];
  /** Whether this flow is currently active. */
  isActive: boolean;
  /** Version number — incremented on each edit. */
  version: number;
  /** ISO timestamp of creation. */
  createdAt: string;
  /** ISO timestamp of last modification. */
  updatedAt: string;
}

// ── Flow Instance ─────────────────────────────────────────────────────────────

/** A running instance of a flow (e.g. a specific production order going through stages). */
export interface FlowInstance {
  /** Unique instance ID. */
  id: string;
  /** Reference to the flow definition. */
  flowDefinitionId: string;
  /** Tenant organization ID. */
  organizationId: string;
  /** The entity this flow is tracking (e.g. production order ID, purchase order ID). */
  entityId: string;
  /** Entity type (e.g. "production_order", "purchase_order"). */
  entityType: string;
  /** Current stage code. */
  currentStageCode: string;
  /** Status of this flow instance. */
  status: "in_progress" | "completed" | "cancelled" | "blocked";
  /** History of stage transitions. */
  history: FlowTransition[];
  /** ISO timestamp when the flow started. */
  startedAt: string;
  /** ISO timestamp when the flow completed (null if still running). */
  completedAt: string | null;
}

/** A recorded transition between stages. */
export interface FlowTransition {
  fromStage: string;
  toStage: string;
  transitionedAt: string;
  transitionedBy: string | null;
  notes: string | null;
  durationMinutes: number | null;
}

// ── Flow Engine Interface ─────────────────────────────────────────────────────

/** Contract for the Business Flow Engine. */
export interface IFlowEngine {
  /** Get the active flow definition for a domain. */
  getFlowDefinition(organizationId: string, domain: FlowDomain): Promise<FlowDefinition | null>;
  /** Get all flow definitions for a tenant. */
  listFlowDefinitions(organizationId: string): Promise<FlowDefinition[]>;
  /** Create or update a flow definition. */
  saveFlowDefinition(definition: FlowDefinition): Promise<FlowDefinition>;
  /** Start a new flow instance for an entity. */
  startFlow(organizationId: string, flowDefinitionId: string, entityId: string, entityType: string): Promise<FlowInstance>;
  /** Advance a flow instance to the next stage. */
  advanceFlow(instanceId: string, toStageCode: string, userId: string | null, notes: string | null): Promise<FlowInstance>;
  /** Get the current state of a flow instance. */
  getFlowInstance(instanceId: string): Promise<FlowInstance | null>;
  /** List flow instances for an entity. */
  listFlowInstances(organizationId: string, entityType: string, entityId?: string): Promise<FlowInstance[]>;
}
