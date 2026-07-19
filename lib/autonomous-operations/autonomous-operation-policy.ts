/**
 * lib/autonomous-operations/autonomous-operation-policy.ts
 *
 * Agentik — Autonomous Operation Policy
 * Sprint: AGENTIK-AUTONOMOUS-OPERATIONS-01
 *
 * Defines the policy structure and initial policy set.
 * A policy maps (actionType, riskLevel, mode) → AutonomousOperationDecision.
 *
 * Pure domain. No Prisma. No React. No Next.
 */

import type {
  AutonomousOperationPolicyId,
  AutonomousOperationDecision,
  AutonomousOperationRiskLevel,
  AutonomousOperationMode,
} from "./autonomous-operation-types";

// ── Policy shape ──────────────────────────────────────────────────────────────

export interface AutonomousOperationPolicy {
  id:               AutonomousOperationPolicyId;
  name:             string;
  description:      string;
  /** Decision domain (e.g. FINANCE, MARKETING). Empty = applies to all. */
  domain:           string;
  /** Agent runtime action type this policy targets. Empty = applies to all. */
  actionType:       string;
  riskLevel:        AutonomousOperationRiskLevel | "*";
  mode:             AutonomousOperationMode | "*";
  decision:         AutonomousOperationDecision;
  requiresApproval: boolean;
  canAutoExecute:   boolean;
  /** Priority: higher = evaluated first. */
  priority:         number;
  isActive:         boolean;
  metadata?:        Record<string, unknown>;
}

// ── Initial policies ──────────────────────────────────────────────────────────

export const AUTONOMOUS_OPERATION_POLICIES: AutonomousOperationPolicy[] = [

  // ── Hard safety overrides (highest priority) ─────────────────────────────

  {
    id:               "P_PREVIEW_BLOCK_ALL",
    name:             "Preview mode — block all creates",
    description:      "In PREVIEW mode, no operations create real artifacts. Recommend only.",
    domain:           "*",
    actionType:       "*",
    riskLevel:        "*",
    mode:             "PREVIEW",
    decision:         "NO_ACTION",
    requiresApproval: false,
    canAutoExecute:   false,
    priority:         1000,
    isActive:         true,
  },

  {
    id:               "P_AUTONOMOUS_DISABLED_BLOCK",
    name:             "Autonomous disabled — escalate or no_action only",
    description:      "When autonomy is disabled, only escalation or no_action is permitted.",
    domain:           "*",
    actionType:       "CREATE_TASK_DRAFT",
    riskLevel:        "*",
    mode:             "AUTONOMOUS_DISABLED",
    decision:         "ESCALATE_TO_USER",
    requiresApproval: false,
    canAutoExecute:   false,
    priority:         990,
    isActive:         true,
  },

  {
    id:               "P_AUTONOMOUS_DISABLED_APPROVAL",
    name:             "Autonomous disabled — approval drafts become escalations",
    description:      "In AUTONOMOUS_DISABLED mode, approval drafts become escalations.",
    domain:           "*",
    actionType:       "CREATE_APPROVAL_DRAFT",
    riskLevel:        "*",
    mode:             "AUTONOMOUS_DISABLED",
    decision:         "ESCALATE_TO_USER",
    requiresApproval: false,
    canAutoExecute:   false,
    priority:         989,
    isActive:         true,
  },

  {
    id:               "P_AUTONOMOUS_DISABLED_WORKFLOW",
    name:             "Autonomous disabled — workflow drafts become escalations",
    description:      "In AUTONOMOUS_DISABLED mode, workflow drafts become escalations.",
    domain:           "*",
    actionType:       "START_WORKFLOW_DRAFT",
    riskLevel:        "*",
    mode:             "AUTONOMOUS_DISABLED",
    decision:         "ESCALATE_TO_USER",
    requiresApproval: false,
    canAutoExecute:   false,
    priority:         988,
    isActive:         true,
  },

  // ── CRITICAL risk — always require approval ────────────────────────────────

  {
    id:               "P_CRITICAL_REQUIRE_APPROVAL",
    name:             "Critical risk — always require approval",
    description:      "Any CRITICAL risk operation must go through an approval workflow before execution.",
    domain:           "*",
    actionType:       "*",
    riskLevel:        "CRITICAL",
    mode:             "*",
    decision:         "REQUIRE_APPROVAL",
    requiresApproval: true,
    canAutoExecute:   false,
    priority:         900,
    isActive:         true,
  },

  // ── Workflow drafts — always require approval in this sprint ──────────────

  {
    id:               "P_WORKFLOW_DRAFT_APPROVAL",
    name:             "Workflow draft — always require approval",
    description:      "START_WORKFLOW_DRAFT is blocked from auto-execution in this sprint. Must go through approval.",
    domain:           "*",
    actionType:       "START_WORKFLOW_DRAFT",
    riskLevel:        "*",
    mode:             "*",
    decision:         "REQUIRE_APPROVAL",
    requiresApproval: true,
    canAutoExecute:   false,
    priority:         880,
    isActive:         true,
  },

  // ── APPROVAL_REQUIRED mode ─────────────────────────────────────────────────

  {
    id:               "P_APPROVAL_REQUIRED_TASK",
    name:             "Approval-required mode — task draft becomes approval request",
    description:      "In APPROVAL_REQUIRED mode, task drafts go through approval first.",
    domain:           "*",
    actionType:       "CREATE_TASK_DRAFT",
    riskLevel:        "*",
    mode:             "APPROVAL_REQUIRED",
    decision:         "CREATE_APPROVAL_ONLY",
    requiresApproval: true,
    canAutoExecute:   false,
    priority:         800,
    isActive:         true,
  },

  {
    id:               "P_APPROVAL_REQUIRED_APPROVAL",
    name:             "Approval-required mode — approval draft goes to approval queue",
    description:      "In APPROVAL_REQUIRED mode, approval drafts are sent to the approval queue.",
    domain:           "*",
    actionType:       "CREATE_APPROVAL_DRAFT",
    riskLevel:        "*",
    mode:             "APPROVAL_REQUIRED",
    decision:         "CREATE_APPROVAL_ONLY",
    requiresApproval: true,
    canAutoExecute:   false,
    priority:         799,
    isActive:         true,
  },

  // ── SAFE_AUTOMATION mode ───────────────────────────────────────────────────

  {
    id:               "P_SAFE_AUTO_TASK_LOW",
    name:             "Safe automation — create task for LOW risk",
    description:      "In SAFE_AUTOMATION mode, LOW risk task drafts can be created directly.",
    domain:           "*",
    actionType:       "CREATE_TASK_DRAFT",
    riskLevel:        "LOW",
    mode:             "SAFE_AUTOMATION",
    decision:         "CREATE_TASK_ONLY",
    requiresApproval: false,
    canAutoExecute:   true,
    priority:         700,
    isActive:         true,
  },

  {
    id:               "P_SAFE_AUTO_TASK_MEDIUM",
    name:             "Safe automation — medium task needs approval",
    description:      "In SAFE_AUTOMATION mode, MEDIUM risk tasks require approval.",
    domain:           "*",
    actionType:       "CREATE_TASK_DRAFT",
    riskLevel:        "MEDIUM",
    mode:             "SAFE_AUTOMATION",
    decision:         "CREATE_APPROVAL_ONLY",
    requiresApproval: true,
    canAutoExecute:   false,
    priority:         699,
    isActive:         true,
  },

  {
    id:               "P_SAFE_AUTO_APPROVAL",
    name:             "Safe automation — approval draft requires human approval",
    description:      "In SAFE_AUTOMATION mode, approval drafts always require human confirmation.",
    domain:           "*",
    actionType:       "CREATE_APPROVAL_DRAFT",
    riskLevel:        "*",
    mode:             "SAFE_AUTOMATION",
    decision:         "CREATE_APPROVAL_ONLY",
    requiresApproval: true,
    canAutoExecute:   false,
    priority:         698,
    isActive:         true,
  },

  // ── ASSISTED mode ──────────────────────────────────────────────────────────

  {
    id:               "P_ASSISTED_TASK_LOW",
    name:             "Assisted mode — create task for LOW risk",
    description:      "In ASSISTED mode, LOW risk task drafts can be created directly.",
    domain:           "*",
    actionType:       "CREATE_TASK_DRAFT",
    riskLevel:        "LOW",
    mode:             "ASSISTED",
    decision:         "CREATE_TASK_ONLY",
    requiresApproval: false,
    canAutoExecute:   true,
    priority:         600,
    isActive:         true,
  },

  {
    id:               "P_ASSISTED_TASK_MEDIUM",
    name:             "Assisted mode — MEDIUM risk task needs approval",
    description:      "In ASSISTED mode, MEDIUM risk task drafts create an approval request.",
    domain:           "*",
    actionType:       "CREATE_TASK_DRAFT",
    riskLevel:        "MEDIUM",
    mode:             "ASSISTED",
    decision:         "CREATE_APPROVAL_ONLY",
    requiresApproval: true,
    canAutoExecute:   false,
    priority:         599,
    isActive:         true,
  },

  {
    id:               "P_ASSISTED_TASK_HIGH",
    name:             "Assisted mode — HIGH risk task needs approval",
    description:      "In ASSISTED mode, HIGH risk task drafts create an approval request.",
    domain:           "*",
    actionType:       "CREATE_TASK_DRAFT",
    riskLevel:        "HIGH",
    mode:             "ASSISTED",
    decision:         "CREATE_APPROVAL_ONLY",
    requiresApproval: true,
    canAutoExecute:   false,
    priority:         598,
    isActive:         true,
  },

  {
    id:               "P_ASSISTED_APPROVAL",
    name:             "Assisted mode — create approval request",
    description:      "In ASSISTED mode, approval drafts create an approval request in the queue.",
    domain:           "*",
    actionType:       "CREATE_APPROVAL_DRAFT",
    riskLevel:        "*",
    mode:             "ASSISTED",
    decision:         "CREATE_APPROVAL_ONLY",
    requiresApproval: true,
    canAutoExecute:   false,
    priority:         590,
    isActive:         true,
  },

  // ── Escalation — all modes ─────────────────────────────────────────────────

  {
    id:               "P_ESCALATE_ALL_MODES",
    name:             "Escalate to user — all modes",
    description:      "ESCALATE_TO_USER actions are always allowed and route to the user.",
    domain:           "*",
    actionType:       "ESCALATE_TO_USER",
    riskLevel:        "*",
    mode:             "*",
    decision:         "ESCALATE_TO_USER",
    requiresApproval: false,
    canAutoExecute:   true,
    priority:         500,
    isActive:         true,
  },

  // ── No action — all modes ──────────────────────────────────────────────────

  {
    id:               "P_NO_ACTION",
    name:             "No action — always complete",
    description:      "NO_ACTION proposed actions immediately complete without side effects.",
    domain:           "*",
    actionType:       "NO_ACTION",
    riskLevel:        "*",
    mode:             "*",
    decision:         "NO_ACTION",
    requiresApproval: false,
    canAutoExecute:   true,
    priority:         490,
    isActive:         true,
  },

  // ── Fallback ───────────────────────────────────────────────────────────────

  {
    id:               "P_FALLBACK_BLOCK",
    name:             "Fallback — block unmatched operations",
    description:      "Any operation without a matching policy is blocked for safety.",
    domain:           "*",
    actionType:       "*",
    riskLevel:        "*",
    mode:             "*",
    decision:         "BLOCK",
    requiresApproval: false,
    canAutoExecute:   false,
    priority:         0,
    isActive:         true,
  },

];
