/**
 * workflow-engine.ts
 *
 * PRODUCTION-WORKFLOW-01
 * Contract for the Business Flow Engine.
 *
 * The engine orchestrates workflow lifecycle: creation, advancement,
 * validation, and querying. It is domain-agnostic — any business
 * process can use this engine.
 *
 * No Prisma. No React. Pure domain contracts.
 */

import type { WorkflowDefinition, WorkflowValidationResult } from "./workflow-definition";
import type { WorkflowInstance } from "./workflow-instance";
import type { WorkflowDomain, WorkflowStatus, WorkflowEntityBinding } from "./workflow-types";
import type { WorkflowAggregateMetrics } from "./workflow-metrics";

// ── Advance Result ───────────────────────────────────────────────────────────

/** Result of attempting to advance a workflow instance. */
export interface WorkflowAdvanceResult {
  success: boolean;
  /** Updated instance (null if advance failed). */
  instance: WorkflowInstance | null;
  /** Stage that was exited. */
  fromStageCode: string | null;
  /** Stage that was entered. */
  toStageCode: string | null;
  /** Error message if advance failed. */
  error: string | null;
  /** Warnings (non-blocking). */
  warnings: string[];
}

// ── Workflow Events (future Business Event Engine) ───────────────────────────

/**
 * Events that the Workflow Engine will emit once the Business Event Engine
 * is implemented. Documented per AGENTIK-ARCHITECTURE-BUSINESS-ENGINE-01.
 *
 * NOT implemented in this sprint. Only typed for documentation.
 */
export type WorkflowEventType =
  | "workflow.started"
  | "workflow.completed"
  | "workflow.cancelled"
  | "workflow.failed"
  | "workflow.blocked"
  | "workflow.unblocked"
  | "workflow.paused"
  | "workflow.resumed"
  | "stage.entered"
  | "stage.completed"
  | "stage.skipped"
  | "stage.failed"
  | "stage.sla_breached"
  | "approval.requested"
  | "approval.granted"
  | "approval.rejected";

// ── Engine Interface ─────────────────────────────────────────────────────────

/**
 * Contract for the Business Flow Engine.
 *
 * This is the central API that all modules use to manage workflows.
 * No module should implement its own workflow logic.
 */
export interface IWorkflowEngine {
  // ── Definition Management ───────────────────────────────────────────

  /** Get the active workflow definition for a domain. */
  getDefinition(organizationId: string, domain: WorkflowDomain): Promise<WorkflowDefinition | null>;
  /** Get a specific definition by ID. */
  getDefinitionById(definitionId: string): Promise<WorkflowDefinition | null>;
  /** List all definitions for a tenant. */
  listDefinitions(organizationId: string): Promise<WorkflowDefinition[]>;
  /** Create or update a workflow definition. */
  saveDefinition(definition: WorkflowDefinition): Promise<WorkflowDefinition>;
  /** Validate a workflow definition. */
  validateDefinition(definition: WorkflowDefinition): WorkflowValidationResult;

  // ── Instance Lifecycle ──────────────────────────────────────────────

  /** Start a new workflow instance. */
  startWorkflow(
    organizationId: string,
    definitionId: string,
    entityBinding: WorkflowEntityBinding,
    createdBy?: string,
  ): Promise<WorkflowInstance>;

  /** Advance a workflow instance to the next stage. */
  advanceWorkflow(
    instanceId: string,
    toStageCode: string,
    actor?: string,
    notes?: string,
  ): Promise<WorkflowAdvanceResult>;

  /** Pause a running workflow. */
  pauseWorkflow(instanceId: string, actor?: string, reason?: string): Promise<WorkflowInstance>;

  /** Resume a paused workflow. */
  resumeWorkflow(instanceId: string, actor?: string): Promise<WorkflowInstance>;

  /** Block a workflow (external dependency). */
  blockWorkflow(instanceId: string, actor?: string, reason?: string): Promise<WorkflowInstance>;

  /** Cancel a workflow. */
  cancelWorkflow(instanceId: string, actor?: string, reason?: string): Promise<WorkflowInstance>;

  // ── Querying ────────────────────────────────────────────────────────

  /** Get a workflow instance by ID. */
  getInstance(instanceId: string): Promise<WorkflowInstance | null>;

  /** List workflow instances for an entity. */
  listInstancesForEntity(
    organizationId: string,
    entityBinding: WorkflowEntityBinding,
  ): Promise<WorkflowInstance[]>;

  /** List workflow instances by status. */
  listInstancesByStatus(
    organizationId: string,
    status: WorkflowStatus,
    domain?: WorkflowDomain,
  ): Promise<WorkflowInstance[]>;

  // ── Metrics ─────────────────────────────────────────────────────────

  /** Get aggregate metrics for a domain. */
  getAggregateMetrics(
    organizationId: string,
    domain: WorkflowDomain,
  ): Promise<WorkflowAggregateMetrics>;
}
