/**
 * lib/agent-planning/planning-types.ts
 *
 * Agentik Runtime Planning — Core Type System
 *
 * Defines the contracts for operational plans, dependency steps,
 * readiness states, and conflict types.
 *
 * Fully deterministic. No LLM. No Mastra. No external DBs.
 *
 * Sprint: AGENTIK-AGENT-DEPENDENCY-PLANNING-01
 */

// ── Plan status ───────────────────────────────────────────────────────────────

export type PlanStatus =
  | "draft"              // Plan built but not yet actionable
  | "waiting_approval"   // Root action needs approval before plan can proceed
  | "partially_ready"    // Some steps ready, others blocked
  | "ready"              // All prerequisites met — plan can execute
  | "blocked"            // Critical blocker prevents all progress
  | "executing"          // At least one step is in_progress
  | "completed"          // All steps completed
  | "failed"             // A critical step failed without recovery
  | "canceled";          // Plan was canceled

// ── Step status ───────────────────────────────────────────────────────────────

export type PlanStepStatus =
  | "pending"             // Not yet started
  | "waiting_dependency"  // Waiting for a predecessor step to complete
  | "waiting_approval"    // Waiting for human approval
  | "ready"               // All dependencies met — actionable now
  | "blocked"             // Explicitly blocked (delegation, data, etc.)
  | "completed"           // Step finished successfully
  | "failed"              // Step failed
  | "skipped";            // Skipped (conditional branch not taken)

// ── Readiness status ──────────────────────────────────────────────────────────

export type ReadinessStatus =
  | "ready"
  | "waiting_approval"
  | "waiting_delegation"
  | "waiting_data"
  | "blocked"
  | "failed_dependency";

// ── Dependency type ───────────────────────────────────────────────────────────

export type DependencyType =
  | "requires_approval"         // Step cannot run until approved by human
  | "requires_delegation"       // Step blocked by pending delegation
  | "requires_data_source"      // Step needs external data before proceeding
  | "requires_financial_review" // Step blocked by pending financial review
  | "requires_inventory_review" // Step blocked by pending inventory review
  | "requires_human_decision"   // Step requires explicit human decision
  | "blocks_execution"          // This dependency prevents execution
  | "unlocks_execution";        // Completion of this dependency unlocks execution

// ── Conflict type ─────────────────────────────────────────────────────────────

export type ConflictType =
  | "cyclic_dependency"       // A→B→C→A cycle detected
  | "conflicting_actions"     // Two actions with contradictory intent
  | "duplicated_plan"         // Same rootAction has two active plans
  | "stale_dependency"        // Dependency references expired/failed/rejected item
  | "missing_owner"           // Action has no agent or human owner
  | "unresolved_delegation"   // Approved action blocked by pending delegation
  | "cross_module_conflict"   // Module A wants X, Module B blocks X
  | "data_source_blocker";    // Required data source unavailable

// ── Core step ─────────────────────────────────────────────────────────────────

export interface PlanStep {
  id:               string;
  planId:           string;
  actionId:         string | null;
  delegationId:     string | null;
  agentId:          string;
  moduleId:         string;
  /** "action" | "delegation" | "approval" | "review" | "decision" */
  stepType:         "action" | "delegation" | "approval" | "review" | "decision";
  title:            string;
  summary:          string;
  status:           PlanStepStatus;
  dependsOnStepIds: string[];
  blocksStepIds:    string[];
  readiness:        ReadinessStatus;
  requiredApproval: boolean;
  /** Estimated operational impact if this step is delayed */
  estimatedImpact:  "critical" | "high" | "medium" | "low" | "none";
}

// ── Plan dependency ───────────────────────────────────────────────────────────

export interface PlanDependency {
  id:             string;
  fromStepId:     string;
  toStepId:       string;
  dependencyType: DependencyType;
  reason:         string;
  resolved:       boolean;
}

// ── Plan blocker ──────────────────────────────────────────────────────────────

export interface PlanBlocker {
  id:                  string;
  stepId:              string | null;
  blockerType:         string;
  reason:              string;
  blockedByAgentId:    string | null;
  blockedByModuleId:   string | null;
  suggestedResolution: string;
}

// ── Plan conflict ─────────────────────────────────────────────────────────────

export interface PlanConflict {
  id:           string;
  conflictType: ConflictType;
  severity:     "critical" | "high" | "medium" | "low";
  description:  string;
  affectedStepIds:  string[];
  affectedAgentIds: string[];
  resolution:   string | null;
}

// ── Operational plan ──────────────────────────────────────────────────────────

export interface OperationalPlan {
  /** "plan_{rootActionId}_{seq}" */
  id:                  string;
  orgId:               string;
  /** The primary action that triggered this plan (null for global plans) */
  rootActionId:        string | null;
  title:               string;
  summary:             string;
  status:              PlanStatus;
  priority:            "critical" | "high" | "medium" | "low";
  createdAt:           string;
  updatedAt:           string;
  steps:               PlanStep[];
  dependencies:        PlanDependency[];
  blockers:            PlanBlocker[];
  conflicts:           PlanConflict[];
  recommendedNextStep: string;
  /** 0.0–1.0 deterministic confidence based on data completeness */
  confidence:          number;
  agentsInvolved:      string[];
  modulesAffected:     string[];
}

// ── Dependency graph node ─────────────────────────────────────────────────────

export interface DependencyNode {
  id:         string;
  nodeType:   "action" | "delegation" | "memory";
  agentId:    string;
  moduleId:   string;
  status:     string;
  label:      string;
  outEdges:   string[]; // IDs of nodes this depends on
  inEdges:    string[]; // IDs of nodes that depend on this
}

// ── Dependency graph ──────────────────────────────────────────────────────────

export interface DependencyGraph {
  nodes:        Map<string, DependencyNode>;
  rootNodeIds:  string[];   // Nodes with no incoming edges
  leafNodeIds:  string[];   // Nodes with no outgoing edges
  cycles:       string[][]; // Each array is one cycle (list of node IDs)
  orphanIds:    string[];   // Isolated nodes with no edges
}

// ── Plan summary ──────────────────────────────────────────────────────────────

export interface PlansSummary {
  totalPlans:           number;
  readyPlans:           number;
  blockedPlans:         number;
  partiallyReadyPlans:  number;
  conflictsDetected:    number;
  cyclesDetected:       number;
  orphanDependencies:   number;
  avgStepsPerPlan:      number;
  criticalBlockers:     number;
}

// ── Plans report (for API) ────────────────────────────────────────────────────

export interface PlansReport {
  plans:          OperationalPlan[];
  readyPlans:     OperationalPlan[];
  blockedPlans:   OperationalPlan[];
  conflicts:      PlanConflict[];
  summary:        PlansSummary;
  generatedAt:    string;
}

// ── ID helpers ────────────────────────────────────────────────────────────────

let _planSeq  = 0;
let _stepSeq  = 0;
let _depSeq   = 0;
let _blkSeq   = 0;
let _cnfSeq   = 0;

export function planId(rootActionId: string | null): string {
  return `plan_${rootActionId ?? "global"}_${++_planSeq}`;
}
export function stepId(): string  { return `step_${++_stepSeq}_${Date.now()}`; }
export function depId(): string   { return `dep_${++_depSeq}_${Date.now()}`; }
export function blkId(): string   { return `blk_${++_blkSeq}_${Date.now()}`; }
export function cnfId(): string   { return `cnf_${++_cnfSeq}_${Date.now()}`; }
