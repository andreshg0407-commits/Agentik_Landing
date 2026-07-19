/**
 * tenant-rule-types.ts
 *
 * TENANT-BUSINESS-RULES-CONFIG-01 — Phases 1-3, 14.
 *
 * Domain model for configurable tenant business rules.
 * Engines NEVER ask "what is the LATIN KIDS limit?"
 * Engines ask "what is the configured rule for this line?"
 *
 * No React. No Prisma. No server-only. Pure domain types.
 */

// ── Phase 1: Core Domain Model ──────────────────────────────────────────────

/** A single configurable business rule owned by a tenant. */
export interface TenantBusinessRule {
  /** Unique rule ID. */
  ruleId: string;
  /** Tenant that owns this rule (orgSlug). */
  orgSlug: string;
  /** Business name of the rule. */
  name: string;
  /** Description explaining business purpose. */
  description: string;
  /** Category of the rule. */
  category: TenantRuleCategory;
  /** What this rule applies to. */
  scope: TenantRuleScope;
  /** The rule condition and threshold. */
  condition: TenantRuleCondition;
  /** What action is suggested when the rule fires. */
  suggestedActions: TenantRuleSuggestedAction[];
  /** Severity when the rule fires. */
  severity: TenantRuleSeverity;
  /** Priority relative to other rules. */
  priority: TenantRulePriority;
  /** Current status. */
  status: TenantRuleStatus;
  /** Source/origin of this rule. */
  source: TenantRuleSource;
  /** Version number. */
  version: number;
  /** Governance metadata. */
  governance: TenantRuleGovernance;
  /** Arbitrary metadata. */
  metadata: Record<string, unknown>;
}

/** A set of rules for a tenant. */
export interface TenantRuleSet {
  /** Tenant. */
  orgSlug: string;
  /** All rules for this tenant. */
  rules: TenantBusinessRule[];
  /** When this set was assembled. */
  assembledAt: string;
  /** Version of the rule set. */
  version: number;
}

// ── Phase 2: Categories ─────────────────────────────────────────────────────

export type TenantRuleCategory =
  | "INVENTORY"
  | "PRODUCTION"
  | "PORTFOLIO"
  | "STORE"
  | "REPLENISHMENT"
  | "COMMERCIAL"
  | "COLLECTIONS"
  | "FINANCE"
  | "CUSTOM";

export const TENANT_RULE_CATEGORIES: readonly TenantRuleCategory[] = [
  "INVENTORY",
  "PRODUCTION",
  "PORTFOLIO",
  "STORE",
  "REPLENISHMENT",
  "COMMERCIAL",
  "COLLECTIONS",
  "FINANCE",
  "CUSTOM",
] as const;

// ── Scope ───────────────────────────────────────────────────────────────────

/** What business entity or dimension the rule applies to. */
export interface TenantRuleScope {
  /** Scope type. */
  type: TenantRuleScopeType;
  /** Target value (e.g., "LATIN KIDS", "Bodega 01"). */
  target: string;
  /** Optional secondary target (e.g., bodega code). */
  secondaryTarget: string | null;
}

export type TenantRuleScopeType =
  | "SUB_LINEA"         // Applies to a commercial sub-line (e.g., LATIN KIDS)
  | "SUB_GRUPO"         // Applies to a product sub-group
  | "BODEGA"            // Applies to a specific warehouse
  | "VENDOR"            // Applies to a specific vendor
  | "STORE"             // Applies to a specific store
  | "PRODUCT"           // Applies to a specific product/reference
  | "GLOBAL";           // Applies to all entities in the tenant

// ── Phase 3: Conditions & Thresholds ────────────────────────────────────────

/** The condition that triggers the rule. */
export interface TenantRuleCondition {
  /** Condition type. */
  type: TenantRuleConditionType;
  /** Field being evaluated (e.g., "existenciaBodega01"). */
  field: string;
  /** Comparison operator. */
  operator: TenantRuleOperator;
  /** Threshold value. */
  threshold: number;
  /** Optional unit label (e.g., "unidades"). */
  unit: string | null;
}

export type TenantRuleConditionType =
  | "INVENTORY_THRESHOLD"        // Stock level threshold
  | "PRODUCTION_DAYS_THRESHOLD"  // Days in production threshold
  | "PORTFOLIO_COVERAGE"         // Portfolio coverage percentage
  | "TRANSFER_FREQUENCY"         // Transfer frequency threshold
  | "CUSTOM_NUMERIC";            // Generic numeric comparison

export type TenantRuleOperator =
  | "lte"   // <=
  | "lt"    // <
  | "gte"   // >=
  | "gt"    // >
  | "eq"    // ==
  | "neq";  // !=

// ── Suggested Actions ───────────────────────────────────────────────────────

/** Action suggested when a rule fires. */
export interface TenantRuleSuggestedAction {
  /** Action type. */
  type: TenantRuleActionType;
  /** Human-readable label. */
  label: string;
  /** Order of execution. */
  order: number;
  /** This is a suggestion only. */
  suggestedOnly: true;
}

export type TenantRuleActionType =
  | "GENERATE_ALERT"
  | "REVIEW_PRODUCTION"
  | "REVIEW_PORTFOLIOS"
  | "SUGGEST_REPLACEMENT"
  | "SUGGEST_PRODUCTION"
  | "NOTIFY_EXECUTIVE"
  | "CUSTOM";

// ── Status & Priority ───────────────────────────────────────────────────────

export type TenantRuleSeverity = "info" | "low" | "medium" | "high" | "critical";

export type TenantRulePriority = "lowest" | "low" | "normal" | "high" | "highest";

export type TenantRuleStatus = "draft" | "active" | "paused" | "deprecated" | "archived";

// ── Source ───────────────────────────────────────────────────────────────────

/** Where the rule originated. */
export interface TenantRuleSource {
  /** Source type. */
  type: TenantRuleSourceType;
  /** Who provided the rule. */
  author: string;
  /** When it was defined. */
  definedAt: string;
  /** Additional context. */
  context: string | null;
}

export type TenantRuleSourceType =
  | "CEO_DIRECTIVE"      // CEO or gerente defined the rule
  | "OPERATIONAL_POLICY" // Standard operating procedure
  | "SYSTEM_DEFAULT"     // Agentik default
  | "CUSTOM";            // Custom origin

// ── Phase 14: Governance ────────────────────────────────────────────────────

/** Governance metadata for audit trail. */
export interface TenantRuleGovernance {
  /** When the rule was created. */
  createdAt: string;
  /** When the rule was last modified. */
  updatedAt: string;
  /** Who last modified the rule. */
  updatedBy: string;
  /** Confidence in this rule (0-100). */
  confidence: number;
  /** Reason for last change. */
  changeReason: string | null;
}

// ── Threshold Rule (convenience) ────────────────────────────────────────────

/**
 * Simplified threshold rule for quick resolution.
 * This is what engines actually consume via the resolver.
 * Compatible with existing MaletaReplacementRule shape.
 */
export interface TenantThresholdRule {
  /** Rule ID (for traceability). */
  ruleId: string;
  /** Scope target (e.g., "LATIN KIDS"). */
  target: string;
  /** Scope type (e.g., "SUB_LINEA"). */
  scopeType: TenantRuleScopeType;
  /** Threshold value. */
  threshold: number;
  /** Comparison operator. */
  operator: TenantRuleOperator;
  /** Category. */
  category: TenantRuleCategory;
  /** Severity when breached. */
  severity: TenantRuleSeverity;
  /** Source metadata. */
  sourceAuthor: string;
  /** Suggested actions. */
  suggestedActions: TenantRuleActionType[];
}

// ── Rule Evidence (for evaluation output) ───────────────────────────────────

/** Evidence that a rule was evaluated. */
export interface TenantRuleEvidence {
  /** Rule ID. */
  ruleId: string;
  /** Rule name. */
  ruleName: string;
  /** Tenant. */
  orgSlug: string;
  /** Whether the rule matched. */
  matched: boolean;
  /** Actual value observed. */
  observedValue: number;
  /** Configured threshold. */
  configuredThreshold: number;
  /** Operator used. */
  operator: TenantRuleOperator;
  /** Entity evaluated (e.g., reference code). */
  entityId: string;
  /** When evaluated. */
  evaluatedAt: string;
}
