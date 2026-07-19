/**
 * lib/security/audit-persistence/server.ts
 *
 * AGENTIK-SECURITY-AUDIT-PERSISTENCE-01
 * Persistent Security Audit — Server-Only Barrel
 *
 * Export all runtime constructs:
 *   - Repository (Prisma implementation)
 *   - Service
 *   - Query Engine
 *   - Report Builder
 *   - Health Monitor
 *
 * IMPORTANT: Server-only. Never import in client components.
 */

import "server-only";

// ── Repository ────────────────────────────────────────────────────────────────

export {
  PrismaAuditRepository,
  getPrismaAuditRepository,
} from "./persistence/prisma-audit-repository";

// ── Service ───────────────────────────────────────────────────────────────────

export {
  PersistentAuditService,
  getPersistentAuditService,
} from "./persistent-audit-service";

// ── Query Engine ──────────────────────────────────────────────────────────────

export {
  AuditQueryEngine,
  getTenantEvents,
  getRecentEvents,
  getCriticalEvents,
  getCategoryEvents,
  getEventTimeline,
} from "./audit-query-engine";

export type {
  AuditTimelineEntry,
  AuditEventSummary,
} from "./audit-query-engine";

// ── Report Builder ────────────────────────────────────────────────────────────

export {
  buildAuditReport,
  formatAuditReport,
} from "./audit-report-builder";

export type {
  AuditReport,
  AuditReportSummary,
  AuditCategoryBreakdown,
  AuditTrend,
} from "./audit-report-builder";

// ── Health Monitor ────────────────────────────────────────────────────────────

export {
  AuditHealthMonitor,
  checkAuditHealth,
} from "./audit-health";

export type {
  AuditHealthReport,
  AuditHealthCheckResult,
  AuditHealthStatus,
} from "./audit-health";

// ── Types (re-exported for convenience) ──────────────────────────────────────

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

export type {
  AuditRepository,
  AuditQueryOptions,
  AuditCountOptions,
} from "./audit-repository";

// ── Adapters (integration bridges) ───────────────────────────────────────────

export {
  PersistentSecurityAuditAdapter,
  persistentSecurityAuditAdapter,
} from "@/lib/security/security-audit";

export {
  PersistentVaultAuditAdapter,
  persistentVaultAuditAdapter,
} from "@/lib/security/vault/vault-service-audit";

export {
  PersistentExecutiveAuditAdapter,
  persistentExecutiveAuditAdapter,
} from "@/lib/copilot/executive-brain/executive-audit";

export {
  PersistentCopilotAuditAdapter,
  persistentCopilotAuditAdapter,
  globalCopilotAuditLog,
} from "@/lib/copilot/copilot-audit";
