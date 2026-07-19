/**
 * workflow-template.ts
 *
 * PRODUCTION-WORKFLOW-01
 * Pre-built workflow templates for common business processes.
 *
 * Templates are starting points — tenants customize them.
 * They are NOT hardcoded workflows. They are configurable blueprints.
 *
 * No Prisma. No React. Pure domain types.
 */

import type { WorkflowDomain } from "./workflow-types";

// ── Template ─────────────────────────────────────────────────────────────────

/**
 * A workflow template — a pre-configured starting point.
 *
 * Templates are used during tenant onboarding to create
 * initial workflow definitions. They are NOT executed directly.
 */
export interface WorkflowTemplate {
  /** Unique template ID. */
  id: string;
  /** Machine-readable code. */
  code: string;
  /** Human-readable name. */
  name: string;
  /** Template description. */
  description: string;
  /** Business domain. */
  domain: WorkflowDomain;
  /** Industry or vertical this template targets. */
  industry: string | null;
  /** Stage codes in order. */
  stageCodes: string[];
  /** Stage names matching stageCodes. */
  stageNames: string[];
  /** Default transitions (source → target). */
  defaultTransitions: Array<{ from: string; to: string }>;
  /** Whether this template supports branching. */
  supportsBranching: boolean;
  /** Number of tenants using this template. */
  adoptionCount: number;
}

// ── Built-in Template IDs ────────────────────────────────────────────────────

/**
 * Known template codes for common processes.
 * These are documentation only — not enforced by code.
 *
 * Templates:
 * - PRODUCTION_LINEAR:        Simple linear production flow
 * - PRODUCTION_BRANCHING:     Production with parallel paths (e.g. estampacion + bordado)
 * - PURCHASING_STANDARD:      Request → Approve → Order → Receive → Pay
 * - COLLECTION_STANDARD:      Invoice → Contact → Collect → Reconcile
 * - HR_ONBOARDING:            Request → Interview → Evaluate → Hire
 * - QUALITY_INSPECTION:       Sample → Test → Report → Decision
 * - DISPATCH_STANDARD:        Pick → Pack → Ship → Deliver → Confirm
 */
export type BuiltinTemplateCode =
  | "PRODUCTION_LINEAR"
  | "PRODUCTION_BRANCHING"
  | "PURCHASING_STANDARD"
  | "COLLECTION_STANDARD"
  | "HR_ONBOARDING"
  | "QUALITY_INSPECTION"
  | "DISPATCH_STANDARD";
