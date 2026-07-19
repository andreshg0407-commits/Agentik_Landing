/**
 * lib/security/zero-trust/zero-trust-types.ts
 *
 * AGENTIK-SECURITY-ZERO-TRUST-01
 * Zero Trust — Core Domain Types
 *
 * Defines all primitive types for the Agentik Zero Trust layer.
 * No server-only. No Prisma. No crypto. Pure domain contracts.
 *
 * Principles:
 *   - Never trust by default
 *   - Every access carries full context
 *   - All types are JSON-serializable
 *   - Multi-tenant: orgSlug required everywhere
 *   - Fail-closed: default decision is DENY
 */

// ── Decision ──────────────────────────────────────────────────────────────────

/**
 * ZeroTrustDecision — the outcome of a Zero Trust evaluation.
 *
 * ALLOW    — context verified, access granted.
 * DENY     — access denied (default when evaluation fails).
 * CHALLENGE — identity requires step-up (e.g., MFA challenge).
 */
export type ZeroTrustDecision = "ALLOW" | "DENY" | "CHALLENGE";

// ── Risk Level ────────────────────────────────────────────────────────────────

/**
 * ZeroTrustRiskLevel — assessed risk of an access request.
 */
export type ZeroTrustRiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

// ── Subject Types ─────────────────────────────────────────────────────────────

/**
 * ZeroTrustSubjectType — who or what is requesting access.
 */
export type ZeroTrustSubjectType =
  | "USER"              // Human operator
  | "AGENT"             // AI agent (Copilot, Diego, Luca, etc.)
  | "SYSTEM"            // Internal Agentik system process
  | "INTEGRATION"       // External integration (Shopify, Meta, etc.)
  | "API_KEY"           // Machine-to-machine API key
  | "SERVICE_ACCOUNT";  // Scheduled service (cron, background job)

// ── Resource Types ────────────────────────────────────────────────────────────

/**
 * ZeroTrustResourceType — what is being accessed.
 */
export type ZeroTrustResourceType =
  | "FINANCIAL_DATA"       // Transactions, P&L, cash flow, reconciliation
  | "CUSTOMER_DATA"        // CRM, receivables, contact info
  | "MARKETING_DATA"       // Campaigns, posts, analytics
  | "COMMERCIAL_DATA"      // Sales pipeline, commercial intelligence
  | "TENANT_SETTINGS"      // Org config, user management
  | "SECRET"               // Credentials, tokens, certificates
  | "VAULT"                // Vault store (all secret material)
  | "INTEGRATION"          // External platform connectors
  | "AUDIT_LOG"            // Audit trail records
  | "AI_MEMORY"            // Copilot memory entries
  | "AI_PLAYBOOK"          // Operational playbooks
  | "AI_EXECUTIVE_BRAIN"   // Strategic intelligence context
  | "AI_AGENT"             // Agent definitions and capabilities
  | "ENCRYPTION_KEY"       // Encryption key material
  | "USER_IDENTITY";       // User profiles, roles, assignments

// ── Actions ───────────────────────────────────────────────────────────────────

/**
 * ZeroTrustAction — what is being done to the resource.
 */
export type ZeroTrustAction =
  | "READ"            // View/list data
  | "WRITE"           // Create or update data
  | "DELETE"          // Remove data
  | "EXPORT"          // Export/download data
  | "IMPORT"          // Import/upload data
  | "EXECUTE"         // Run a computation or workflow
  | "APPROVE"         // Approve a pending action
  | "ROTATE_SECRET"   // Rotate a credential or token
  | "MANAGE_USERS"    // Assign roles, create users
  | "ADMIN";          // Administrative override

// ── Access Context ────────────────────────────────────────────────────────────

/**
 * ZeroTrustContext — full context for one access request.
 * Every field is used in the evaluation. None are optional for trust decisions.
 */
export interface ZeroTrustContext {
  /** Multi-tenant scope. Required. Evaluation fails without it. */
  orgSlug:       string;
  /** Who is making the request. */
  subjectType:   ZeroTrustSubjectType;
  /** User ID (if subject is a human). */
  userId?:       string;
  /** Agent ID (if subject is an AI agent). */
  agentId?:      string;
  /** Integration ID (if subject is an external integration). */
  integrationId?: string;
  /** API key identifier (if subject is a machine). */
  apiKeyId?:     string;
  /** What resource is being accessed. */
  resourceType:  ZeroTrustResourceType;
  /** Specific resource instance ID (e.g., rotationId, userId). */
  resourceId?:   string;
  /** What action is being performed. */
  action:        ZeroTrustAction;
  /** Originating IP address. */
  ipAddress?:    string;
  /** Browser or client user-agent string. */
  userAgent?:    string;
  /** Session identifier. */
  sessionId?:    string;
  /** ISO 8601 timestamp of the request. */
  timestamp:     string;
  /** Whether MFA was verified in this session. */
  mfaVerified?:  boolean;
  /** Known/trusted device fingerprint. */
  deviceId?:     string;
  /** Request metadata (non-sensitive). */
  metadata?:     Record<string, string | number | boolean>;
}

// ── Zero Trust Evaluation ─────────────────────────────────────────────────────

/**
 * ZeroTrustEvaluation — the structured result of a Zero Trust evaluation.
 * Always include a decision and explicit reasons.
 */
export interface ZeroTrustEvaluation {
  /** Final decision. DENY unless all checks pass. */
  decision:          ZeroTrustDecision;
  /** Risk level of this access request. */
  riskLevel:         ZeroTrustRiskLevel;
  /** Trust score 0–100. Score < threshold → DENY. */
  score:             number;
  /** Machine-readable reasons (always populated). */
  reasons:           string[];
  /** Approvals required before this action can proceed (if any). */
  requiredApprovals: string[];
  /** Whether this access must be written to the audit log. */
  auditRequired:     boolean;
  /** ISO 8601 timestamp of evaluation. */
  evaluatedAt:       string;
  /** Duration of evaluation in milliseconds. */
  durationMs:        number;
  /** The context that produced this evaluation. */
  context:           Omit<ZeroTrustContext, "metadata">;
}

// ── Trust Score Input ─────────────────────────────────────────────────────────

/**
 * TrustScoreInput — factors used to compute a trust score.
 */
export interface TrustScoreInput {
  /** Valid RBAC role assigned in the tenant. */
  hasValidRole:        boolean;
  /** Session is active and not expired. */
  hasValidSession:     boolean;
  /** OrgSlug is present and matches resource owner. */
  hasValidTenant:      boolean;
  /** MFA was verified this session. */
  mfaVerified:         boolean;
  /** IP is from a recognized/allowlisted range. */
  isKnownIp:           boolean;
  /** Device fingerprint is recognized. */
  isKnownDevice:       boolean;
  /** Subject has recent successful activity (no anomaly). */
  hasRecentActivity:   boolean;
  /** No suspicious activity signals detected. */
  noSuspiciousSignals: boolean;
  /** Subject type (used for base score). */
  subjectType:         ZeroTrustSubjectType;
}

// ── Session Trust Input ───────────────────────────────────────────────────────

/**
 * SessionTrustInput — session metadata for trust evaluation.
 */
export interface SessionTrustInput {
  sessionId:    string;
  userId:       string;
  orgSlug:      string;
  createdAt:    string;   // ISO 8601
  expiresAt:    string;   // ISO 8601
  ipAddress?:   string;
  userAgent?:   string;
  lastActiveAt: string;   // ISO 8601
  /** Whether session was created in this tenant (not shared). */
  issuedForOrg: string;
}

/**
 * SessionTrustResult — outcome of session trust evaluation.
 */
export interface SessionTrustResult {
  trusted:    boolean;
  reasons:    string[];
  riskLevel:  ZeroTrustRiskLevel;
  expired:    boolean;
  hijackRisk: boolean;
  replayRisk: boolean;
  crossTenantRisk: boolean;
}

// ── Tenant Isolation Result ───────────────────────────────────────────────────

/**
 * TenantIsolationResult — outcome of tenant boundary verification.
 */
export interface TenantIsolationResult {
  isolated:     boolean;
  reasons:      string[];
  requestedOrg: string;
  contextOrg:   string;
  crossTenantAttempt: boolean;
  riskLevel:    ZeroTrustRiskLevel;
}

// ── Agent Access Result ───────────────────────────────────────────────────────

/**
 * AgentAccessResult — outcome of agent scope verification.
 */
export interface AgentAccessResult {
  allowed:    boolean;
  agentId:    string;
  reasons:    string[];
  riskLevel:  ZeroTrustRiskLevel;
  scopeViolation: boolean;
}

// ── Integration Trust Result ──────────────────────────────────────────────────

/**
 * IntegrationTrustResult — outcome of integration trust evaluation.
 */
export interface IntegrationTrustResult {
  trusted:        boolean;
  integrationId:  string;
  orgSlug:        string;
  reasons:        string[];
  riskLevel:      ZeroTrustRiskLevel;
  scopeViolation: boolean;
}

// ── Minimum Trust Thresholds ──────────────────────────────────────────────────

/**
 * Minimum trust score required to access each risk level of resource.
 * These are the global thresholds. Individual modules may override.
 */
export const TRUST_THRESHOLDS = {
  LOW:      30,
  MEDIUM:   50,
  HIGH:     75,
  CRITICAL: 90,
} as const;

/**
 * Default risk level for each resource type.
 * Used when no specific policy applies.
 */
export const RESOURCE_RISK_LEVELS: Record<ZeroTrustResourceType, ZeroTrustRiskLevel> = {
  FINANCIAL_DATA:      "HIGH",
  CUSTOMER_DATA:       "MEDIUM",
  MARKETING_DATA:      "LOW",
  COMMERCIAL_DATA:     "MEDIUM",
  TENANT_SETTINGS:     "CRITICAL",
  SECRET:              "CRITICAL",
  VAULT:               "CRITICAL",
  INTEGRATION:         "HIGH",
  AUDIT_LOG:           "HIGH",
  AI_MEMORY:           "MEDIUM",
  AI_PLAYBOOK:         "MEDIUM",
  AI_EXECUTIVE_BRAIN:  "HIGH",
  AI_AGENT:            "MEDIUM",
  ENCRYPTION_KEY:      "CRITICAL",
  USER_IDENTITY:       "HIGH",
};

/**
 * Action multiplier for risk scoring.
 * Read < Write < Delete < Export < Admin.
 */
export const ACTION_RISK_MULTIPLIERS: Record<ZeroTrustAction, number> = {
  READ:          1.0,
  WRITE:         1.4,
  DELETE:        1.8,
  EXPORT:        1.6,
  IMPORT:        1.5,
  EXECUTE:       1.3,
  APPROVE:       1.5,
  ROTATE_SECRET: 2.0,
  MANAGE_USERS:  1.9,
  ADMIN:         2.0,
};
