/**
 * lib/security/audit-persistence/index.ts
 *
 * AGENTIK-SECURITY-AUDIT-PERSISTENCE-01
 * Persistent Security Audit — Client-Safe Barrel
 *
 * Exports types, contracts, and pure helpers ONLY.
 * NO Prisma. NO VaultService. NO server-only. NO adapters.
 *
 * Safe to import anywhere (client components, server components, shared).
 */

// ── Domain types ──────────────────────────────────────────────────────────────

export type {
  PersistentSecurityAuditEvent,
  PersistentAuditEventInput,
  PersistentAuditEventType,
  PersistentAuditCategory,
  PersistentAuditSeverity,
  AuditActor,
  AuditResource,
} from "./audit-event-types";

export {
  createPersistentAuditEvent,
  formatAuditEventForLog,
  AUDIT_SEVERITY_RANK,
} from "./audit-event-types";

// ── Category registry ─────────────────────────────────────────────────────────

export type { AuditCategoryEntry } from "./audit-category-registry";

export {
  AUDIT_CATEGORY_REGISTRY,
  getCategoryEntry,
  getCriticalAlertCategories,
  getCategoriesBySeverity,
  getAllCategoryIds,
} from "./audit-category-registry";

// ── Repository contract (no implementation) ───────────────────────────────────

export type {
  AuditRepository,
  AuditQueryOptions,
  AuditCountOptions,
} from "./audit-repository";

// ── Retention policies ────────────────────────────────────────────────────────

export type { RetentionPolicy } from "./audit-retention";

export {
  AUDIT_RETENTION_POLICIES,
  getRetentionPolicy,
  getRetentionDays,
  isIndefiniteRetention,
  computeExpiryDate,
  getIndefiniteRetentionPolicies,
} from "./audit-retention";

// ── Report types ──────────────────────────────────────────────────────────────

export type {
  AuditReport,
  AuditReportSummary,
  AuditCategoryBreakdown,
  AuditTrend,
} from "./audit-report-builder";

// ── Health types ──────────────────────────────────────────────────────────────

export type {
  AuditHealthReport,
  AuditHealthCheckResult,
  AuditHealthStatus,
} from "./audit-health";

// ── Query engine types ────────────────────────────────────────────────────────

export type {
  AuditTimelineEntry,
  AuditEventSummary,
} from "./audit-query-engine";
