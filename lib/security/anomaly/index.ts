/**
 * lib/security/anomaly/index.ts
 *
 * AGENTIK-SECURITY-ANOMALY-DETECTION-01
 * Client-Safe Barrel — Anomaly Detection Layer
 *
 * Safe to import from client components. Contains ONLY:
 *   - Type definitions
 *   - Interfaces
 *   - Pure domain helpers (no DB, no crypto, no server-only)
 *
 * For server-side detection, use lib/security/anomaly/server.ts instead.
 *
 * Architecture: detection is server-only. Client components receive
 * serialized AnomalyAlert / AnomalyDashboardPayload as props from
 * server components or API routes.
 */

// ── Core Types ────────────────────────────────────────────────────────────────

export type {
  AnomalyType,
  AnomalySeverity,
  AnomalyStatus,
  AnomalySignal,
  AnomalyAlert,
  AnomalyContext,
  AnomalyEvaluation,
  AnomalyResult,
} from "./anomaly-types";

export {
  MONITORED_AGENT_IDS,
} from "./anomaly-types";

// ── Policy (pure domain — no server-only) ─────────────────────────────────────

export {
  ANOMALY_POLICIES,
  getPoliciesForType,
  getPolicyById,
  getEnabledPolicies,
  getPoliciesForSeverity,
} from "./anomaly-policy";
export type { AnomalyPolicy } from "./anomaly-policy";

// ── Query Helpers (pure domain — no server-only) ──────────────────────────────

export {
  getOpenAnomalies,
  getCriticalAnomalies,
  getTenantAnomalies,
  getAnomalyCounts,
  getSignalsByType,
  getRecentAlerts,
  getAlertsByUser,
  getAlertsByAgent,
  getTenantRiskScore,
} from "./anomaly-query";

// ── Dashboard Contract (pure domain — no server-only) ─────────────────────────

export {
  buildAnomalyDashboard,
  buildEmptyAnomalyDashboard,
} from "./anomaly-dashboard-contract";
export type { AnomalyDashboardPayload } from "./anomaly-dashboard-contract";

// ── Report Builder types only ─────────────────────────────────────────────────
// Functions are server-only. Types are safe for client prop contracts.

export type {
  SecurityRiskReport,
  AnomalyTrendReport,
  TenantRiskReport,
  AgentRiskReport,
} from "./anomaly-report-builder";

// ── Health / Readiness types only ─────────────────────────────────────────────
// Functions are server-only. Types are safe for client prop contracts.

export type {
  AnomalyHealthReport,
  AnomalyHealthStatus,
  AnomalySubsystemHealth,
} from "./anomaly-health";

export type {
  AnomalyReadinessReport,
  AnomalyReadinessStatus,
  AnomalySubsystemCheck,
} from "./anomaly-readiness";

// ── Repository Interface (pure type — no implementation) ─────────────────────

export type { AnomalyRepository } from "./anomaly-repository";

// ── Detector Interface (pure type — no implementation) ────────────────────────

export type {
  AnomalyDetector,
} from "./anomaly-detector";
export type {
  AnomalyDetectorMetadata,
} from "./anomaly-types";

// ── Audit Event types only ────────────────────────────────────────────────────

export type {
  AnomalyAuditEvent,
  AnomalyAuditInput,
} from "./anomaly-audit";

// ── Integration types only ────────────────────────────────────────────────────

export type { ExecutiveBrainSignal }    from "./integrations/anomaly-executive-brain";
export type { ZeroTrustPenalty } from "./integrations/anomaly-zero-trust";
