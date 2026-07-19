/**
 * lib/approvals/approval-types.ts
 *
 * Agentik — Universal Approvals Domain Types
 * Sprint: AGENTIK-APPROVALS-FOUNDATION-01
 *
 * Central type system for all approval-related structures in Agentik.
 * Consumed by: Copilot, Finance, Collections, Commercial, Marketing,
 *              Inventory, Operations, Compliance.
 *
 * Architecture boundary: No React · No Prisma · No Next.js · Pure domain types.
 */

// ── Identifiers ───────────────────────────────────────────────────────────────

export type ApprovalId         = string;
export type ApprovalRequestId  = string;
export type ApprovalDecisionId = string;

// ── Enumerations ──────────────────────────────────────────────────────────────

export type ApprovalStatus =
  | "PENDING"
  | "APPROVED"
  | "REJECTED"
  | "CANCELLED"
  | "EXPIRED";

export type ApprovalPriority =
  | "LOW"
  | "MEDIUM"
  | "HIGH"
  | "CRITICAL";

export type ApprovalSource =
  | "COPILOT"
  | "AGENT"
  | "MODULE"
  | "USER"
  | "SYSTEM";

export type ApprovalCategory =
  | "FINANCIAL"
  | "COLLECTIONS"
  | "COMMERCIAL"
  | "INVENTORY"
  | "MARKETING"
  | "OPERATIONS"
  | "COMPLIANCE"
  | "CUSTOM";

export type ApprovalActorType =
  | "USER"
  | "AGENT"
  | "SYSTEM"
  | "TEAM";

export type ApprovalAuditEventType =
  | "created"
  | "submitted"
  | "approved"
  | "rejected"
  | "cancelled"
  | "expired"
  | "comment_added";

// ── Actor ─────────────────────────────────────────────────────────────────────

export interface ApprovalActor {
  /** Unique identifier: userId, agentId, teamId, or "system". */
  id:   string;
  type: ApprovalActorType;
  /** Human-readable display name: "Diego", "Gerencia Financiera", etc. */
  name: string;
}

// ── Context ───────────────────────────────────────────────────────────────────

/**
 * ApprovalContext — mirrors TaskBusinessContext for cross-system consistency.
 * Carries all enriched metadata about where and why an approval was created.
 */
export interface ApprovalContext {
  /** Tenant slug: "castillitos". */
  orgSlug:               string;
  /** Module where the approval originated: "conciliacion", "tesoreria", etc. */
  module?:               string;
  /** Agent that generated the approval request: "diego", "luca", etc. */
  sourceAgentId?:        string;
  /** Human-readable agent name: "Diego". */
  sourceAgentName?:      string;
  /** Entity type being approved: "bank_movement", "payment", "discount", etc. */
  entityType?:           string;
  /** Identifier of the entity to approve. Required when entityType is set. */
  entityId?:             string;
  /** Full navigation path for the approver: "/castillitos/finanzas/conciliacion". Must start with "/". */
  navigationTarget?:     string;
  /** One-line business impact: "$4.250.000 pendientes de validación". Max 300 chars. */
  impactSummary?:        string;
  /** Agent recommendation: "Aprobar conciliación sugerida". Max 500 chars. */
  recommendation?:       string;
  /** Extra structured metadata from the originating context. */
  metadata?:             Record<string, unknown>;
}

// ── Relationship ──────────────────────────────────────────────────────────────

export interface ApprovalRelationship {
  /** Relationship kind: "created_from_copilot", "related_to_module", etc. */
  type:          string;
  /** "bank_movement" | "module" | "customer" | "document" | etc. */
  entityType:    string;
  entityId:      string;
  entityLabel?:  string;
}

// ── Audit event ───────────────────────────────────────────────────────────────

export interface ApprovalAuditEvent {
  type:        ApprovalAuditEventType;
  occurredAt:  string;
  actorId:     string;
  actorType:   ApprovalActorType;
  previous?:   Record<string, unknown>;
  next?:       Record<string, unknown>;
  comment?:    string;
}

// ── Decision ──────────────────────────────────────────────────────────────────

export interface ApprovalDecision {
  id:         ApprovalDecisionId;
  requestId:  ApprovalRequestId;
  /** Only APPROVED or REJECTED — terminal decision statuses only. */
  status:     "APPROVED" | "REJECTED";
  decidedBy:  ApprovalActor;
  decidedAt:  string;
  comment?:   string;
  metadata?:  Record<string, unknown>;
}

// ── Request ───────────────────────────────────────────────────────────────────

export interface ApprovalRequest {
  id:             ApprovalRequestId;
  title:          string;
  description?:   string;
  status:         ApprovalStatus;
  priority:       ApprovalPriority;
  source:         ApprovalSource;
  category:       ApprovalCategory;
  /** Who is requesting the approval: agent, user, or system. */
  requestor:      ApprovalActor;
  /** Who must approve: user, team, or role. */
  approver:       ApprovalActor;
  context:        ApprovalContext;
  relationships:  ApprovalRelationship[];
  auditTrail:     ApprovalAuditEvent[];
  decision?:      ApprovalDecision;
  createdAt:      string;
  updatedAt:      string;
  expiresAt?:     string;
  metadata:       Record<string, unknown>;
  // ── AGENTIK-IDEMPOTENCY-01 ──────────────────────────────────────────────
  idempotencyKey?: string;
}

// ── Summary ───────────────────────────────────────────────────────────────────

export interface ApprovalSummary {
  totalCount:     number;
  pendingCount:   number;
  approvedCount:  number;
  rejectedCount:  number;
  cancelledCount: number;
  expiredCount:   number;
  criticalCount:  number;
}

// ── Execution result ──────────────────────────────────────────────────────────

export interface ApprovalExecutionResult {
  success:   boolean;
  message:   string;
  request?:  ApprovalRequest;
  decision?: ApprovalDecision;
  errors?:   string[];
  warnings?: string[];
}

// ── Creation input ────────────────────────────────────────────────────────────

export interface ApprovalCreationInput {
  title:           string;
  description?:    string;
  priority?:       ApprovalPriority;
  source:          ApprovalSource;
  category:        ApprovalCategory;
  requestor:       ApprovalActor;
  approver:        ApprovalActor;
  context:         ApprovalContext;
  relationships?:  ApprovalRelationship[];
  expiresAt?:      string;
  metadata?:       Record<string, unknown>;
  // ── AGENTIK-IDEMPOTENCY-01 ──────────────────────────────────────────────
  idempotencyKey?: string;
}

// ── Update input ──────────────────────────────────────────────────────────────

export interface ApprovalUpdateInput {
  title?:       string;
  description?: string;
  priority?:    ApprovalPriority;
  approver?:    ApprovalActor;
  expiresAt?:   string;
  metadata?:    Record<string, unknown>;
}

// ── Decision input ────────────────────────────────────────────────────────────

export interface ApprovalDecisionInput {
  status:   "APPROVED" | "REJECTED";
  decidedBy: ApprovalActor;
  comment?:  string;
  metadata?: Record<string, unknown>;
}

// ── Filter ────────────────────────────────────────────────────────────────────

export interface ApprovalFilter {
  status?:       ApprovalStatus[];
  priority?:     ApprovalPriority[];
  category?:     ApprovalCategory[];
  source?:       ApprovalSource[];
  requestorId?:  string;
  approverId?:   string;
  module?:       string;
  entityType?:   string;
  entityId?:     string;
  createdFrom?:  string;
  createdTo?:    string;
}

// ── List summary ──────────────────────────────────────────────────────────────

export interface ApprovalListSummary {
  total:      number;
  pending:    number;
  approved:   number;
  rejected:   number;
  cancelled:  number;
  expired:    number;
  critical:   number;
}
