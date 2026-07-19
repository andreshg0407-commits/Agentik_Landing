/**
 * workflow-types.ts
 *
 * PRODUCTION-WORKFLOW-01
 * Core type registry for the Business Flow Engine.
 *
 * Agentik does NOT impose processes. Agentik models processes.
 * Every tenant can build their own flows without modifying code.
 *
 * No Prisma. No React. No server-only. Pure domain types.
 */

import type { BusinessEntityType } from "@/lib/business-entities/core";

// ── Workflow Domain ──────────────────────────────────────────────────────────

/**
 * Business domains that can have configurable workflows.
 * New domains are added here — never inside individual modules.
 */
export type WorkflowDomain =
  | "production"
  | "purchasing"
  | "commercial"
  | "collection"
  | "inventory"
  | "quality"
  | "dispatch"
  | "hr"
  | "approval"
  | "automation"
  | "onboarding"
  | "returns"
  | "maintenance";

// ── Workflow Status ──────────────────────────────────────────────────────────

/** Status of a workflow instance. Generic — not domain-specific. */
export type WorkflowStatus =
  | "draft"
  | "ready"
  | "running"
  | "paused"
  | "blocked"
  | "completed"
  | "cancelled"
  | "failed"
  | "unknown";

// ── Workflow Priority ────────────────────────────────────────────────────────

/** Priority level for a workflow instance. */
export type WorkflowPriority =
  | "critical"
  | "high"
  | "normal"
  | "low";

// ── Workflow Entity Binding ──────────────────────────────────────────────────

/**
 * Associates a workflow instance with a business entity.
 * Never directly — always through this binding contract.
 */
export interface WorkflowEntityBinding {
  /** The entity this workflow tracks. */
  entityId: string;
  /** Entity type from the Business Entity registry. */
  entityType: BusinessEntityType;
  /** Human-readable entity label. */
  entityLabel: string;
}

// ── Common Metadata ──────────────────────────────────────────────────────────

/** Arbitrary key-value metadata attached to any workflow object. */
export type WorkflowMetadata = Record<string, unknown>;
