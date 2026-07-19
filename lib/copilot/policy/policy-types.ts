/**
 * lib/copilot/policy/policy-types.ts
 *
 * AGENTIK-POLICY-ENGINE-01 — Canonical type contracts for the Policy Engine.
 * SERVER ONLY — no React imports, no domain-specific dependencies.
 * @server-only
 *
 * Design principles:
 *   - Domain-agnostic: no Shopify, Finance, Commercial references.
 *   - Multi-tenant: every boundary includes tenantId.
 *   - Deterministic: exactly three final decisions — allow / require_approval / deny.
 *   - Auditable: every decision carries a full chain of reasons and violations.
 *   - Fail-closed: when in doubt, require approval.
 *   - Extensible: reserved fields prepared for DB policies, feature flags, dynamic rules.
 *
 * Dependency direction (must never be violated):
 *   policy-types ← policy-rules ← policy-engine
 *               ← policy-context
 *               ← runtime-types (for report extensions)
 */
import "server-only";

// ── Execution mode ─────────────────────────────────────────────────────────────

/**
 * How the execution was triggered — informs which policy rules apply.
 *
 *   manual      — user triggered directly (UI button, one-time action)
 *   copilot     — triggered by Agentik Copilot in response to user utterance
 *   automation  — triggered by an automation pipeline (without user interaction)
 *   scheduled   — triggered by a cron or scheduled event
 *   system      — internal system trigger (migrations, background sync)
 */
export type ExecutionMode =
  | "manual"
  | "copilot"
  | "automation"
  | "scheduled"
  | "system";

// ── Policy effect ──────────────────────────────────────────────────────────────

/**
 * Effect emitted by a single PolicyRule evaluation.
 *
 *   allow            — rule explicitly permits execution
 *   require_approval — rule requires human review before execution
 *   deny             — rule blocks execution entirely
 *   abstain          — rule has no opinion for this context (does not count)
 *
 * Effects are combined by the engine using strict priority:
 *   deny > require_approval > allow > abstain
 *
 * If all rules abstain → engine applies fail-closed default: require_approval.
 */
export type PolicyEffect =
  | "allow"
  | "require_approval"
  | "deny"
  | "abstain";

// ── Final policy decision ──────────────────────────────────────────────────────

/**
 * The immutable, canonical decision produced by the PolicyEngine.
 * Only three states are possible — never ambiguous.
 *
 *   allow            — action may proceed immediately
 *   require_approval — action is paused; human approval is required
 *   deny             — action is blocked; do not execute
 */
export type PolicyDecision = "allow" | "require_approval" | "deny";

// ── Policy context ─────────────────────────────────────────────────────────────

/**
 * Full evaluation context passed to every PolicyRule.
 * Immutable — rules must never mutate it.
 *
 * Contains everything needed to evaluate any policy:
 *   - Identity:     tenantId, userId, executionId, correlationId
 *   - Action:       actionId, domain, requiresApproval, automationEligible
 *   - Trigger:      executionMode, requestedAt, environment
 *   - Extensible:   metadata (arbitrary key-value from ExecutionContext)
 *   - Future:       tenantConfig, userRoles, featureFlags
 *
 * Future fields (reserved, not yet evaluated):
 *   - tenantConfig?:  TenantPolicyConfig  — per-org policy overrides
 *   - userRoles?:     string[]            — RBAC roles for user-level policies
 *   - featureFlags?:  Record<string, boolean> — feature gates
 *   - riskScore?:     number              — pre-computed risk from anomaly layer
 */
export interface PolicyContext {
  // ── Identity ─────────────────────────────────────────────────────────────────
  executionId:         string;
  correlationId:       string;
  tenantId:            string;
  userId:              string;

  // ── Action ───────────────────────────────────────────────────────────────────
  actionId:            string;
  domain:              string;
  requiresApproval:    boolean;
  automationEligible:  boolean;

  // ── Trigger ──────────────────────────────────────────────────────────────────
  requestedAt:         Date;
  executionMode:       ExecutionMode;
  environment?:        "development" | "staging" | "production";

  // ── Extensible ───────────────────────────────────────────────────────────────
  metadata:            Record<string, unknown>;

  // ── Idempotency ──────────────────────────────────────────────────────────────
  idempotencyKey?:     string;
}

// ── Policy reason ──────────────────────────────────────────────────────────────

/**
 * A structured explanation attached to every rule evaluation that produced
 * a non-abstain effect.
 *
 * Surfaced in ExecutionReport.policyReasons and audit logs.
 */
export interface PolicyReason {
  /** Stable rule identifier — never renamed */
  ruleId:      string;
  /** Human-readable rule name */
  ruleName:    string;
  /** Effect this rule produced */
  effect:      PolicyEffect;
  /** Plain-language explanation of why this rule fired */
  explanation: string;
}

// ── Policy violation ───────────────────────────────────────────────────────────

/**
 * A structured violation record emitted when a rule returns deny or
 * require_approval due to a security or policy constraint.
 *
 * Surfaced separately from reasons to enable compliance reporting.
 */
export interface PolicyViolation {
  /** Rule that detected the violation */
  ruleId:      string;
  /** Human-readable rule name */
  ruleName:    string;
  /** Description of what constraint was violated */
  explanation: string;
  /** Severity classification */
  severity:    "critical" | "high" | "medium" | "low";
}

// ── Policy evaluation result ───────────────────────────────────────────────────

/**
 * Immutable result produced by `PolicyEngine.evaluate()`.
 *
 * Contains the final decision plus a complete audit trail:
 *   - which rules were evaluated
 *   - which rules triggered (non-abstain)
 *   - all reasons and violations
 *
 * This is the ONLY value the Approval Gate consumes — it never re-evaluates.
 */
export interface PolicyEvaluationResult {
  executionId:       string;
  correlationId:     string;
  tenantId:          string;
  actionId:          string;
  domain:            string;
  evaluatedAt:       Date;
  /** The canonical decision — exactly one of: allow | require_approval | deny */
  decision:          PolicyDecision;
  /** Reasons from all non-abstain rule evaluations */
  reasons:           PolicyReason[];
  /** Violations detected during evaluation */
  violations:        PolicyViolation[];
  /** IDs of all rules that were called */
  evaluatedRuleIds:  string[];
  /** IDs of rules that returned a non-abstain effect */
  triggeredRuleIds:  string[];
  /** Wall-clock evaluation time in milliseconds */
  durationMs:        number;
}

// ── Tenant policy config ───────────────────────────────────────────────────────

/**
 * Per-tenant policy configuration.
 *
 * Phase 1: interface only — not persisted.
 * Phase 2: stored per org in DB; loaded by PolicyEngine at evaluation time.
 *
 * Future extensions:
 *   - monetaryLimit?:        number    — cap on automated monetary actions
 *   - allowedHours?:         { from, to } — restrict execution to business hours
 *   - allowedDomains?:       string[]  — whitelist of executable domains
 *   - userGroupPolicies?:    ...       — per-group overrides
 *   - planBasedPolicies?:    ...       — linked to subscription plan
 *   - temporalPolicies?:     ...       — time-boxed rules
 *   - featureFlags?:         Record<string, boolean>
 *   - dynamicRules?:         PolicyRule[]
 */
export interface TenantPolicyConfig {
  tenantId:                     string;
  /** Whether automation pipelines can run actions without user interaction */
  allowAutomation:              boolean;
  /** Force approval before any discount/promotion action */
  requireApprovalForDiscounts:  boolean;
  /** Force approval before any publish action */
  requireApprovalForPublish:    boolean;
  /** Force approval before any delete action */
  requireApprovalForDelete:     boolean;
  /** IDs of actions that are always blocked for this tenant */
  restrictedActionIds:          string[];
}

export const DEFAULT_TENANT_POLICY_CONFIG: TenantPolicyConfig = {
  tenantId:                    "",
  allowAutomation:             false,
  requireApprovalForDiscounts: true,
  requireApprovalForPublish:   true,
  requireApprovalForDelete:    true,
  restrictedActionIds:         [],
} as const;
