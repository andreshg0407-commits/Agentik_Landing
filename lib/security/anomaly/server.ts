/**
 * lib/security/anomaly/server.ts
 *
 * AGENTIK-SECURITY-ANOMALY-DETECTION-01
 * Server-Only Barrel — Anomaly Detection Layer
 *
 * Import from here in server components, API routes, and server actions.
 * NEVER import from here in client components.
 *
 * Exports all server-side anomaly detection functionality:
 *   - Detectors (all 11)
 *   - Registry
 *   - Alert builder
 *   - Correlation engine
 *   - Risk scoring
 *   - Repositories (in-memory + Prisma)
 *   - Integration adapters (executive brain, zero trust, mfa, vault, kms, session)
 *   - Health + readiness monitors
 *   - Audit log
 *
 * Types, interfaces, and pure-domain helpers are also re-exported here for
 * convenience. For client-safe imports use index.ts instead.
 */

import "server-only";

// ── Core Types (re-exported for server consumers) ─────────────────────────────
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

// ── Policy ────────────────────────────────────────────────────────────────────
export {
  ANOMALY_POLICIES,
  getPoliciesForType,
  getPolicyById,
  getEnabledPolicies,
  getPoliciesForSeverity,
} from "./anomaly-policy";
export type { AnomalyPolicy } from "./anomaly-policy";

// ── Detector Interface ────────────────────────────────────────────────────────
export type {
  AnomalyDetector,
} from "./anomaly-detector";
export type {
  AnomalyDetectorMetadata,
} from "./anomaly-types";

// ── Registry ──────────────────────────────────────────────────────────────────
export {
  AnomalyDetectorRegistry,
  anomalyRegistry,
} from "./anomaly-registry";

// ── Detectors (all 11) ────────────────────────────────────────────────────────
export { loginFailureDetector }    from "./detectors/login-failure-detector";
export { mfaFailureDetector }      from "./detectors/mfa-failure-detector";
export { newDeviceDetector }       from "./detectors/new-device-detector";
export { newLocationDetector }     from "./detectors/new-location-detector";
export { vaultAnomalyDetector }    from "./detectors/vault-anomaly-detector";
export { kmsAnomalyDetector }      from "./detectors/kms-anomaly-detector";
export { secretRotationDetector }  from "./detectors/secret-rotation-detector";
export { rbacAnomalyDetector }     from "./detectors/rbac-anomaly-detector";
export { zeroTrustDetector }       from "./detectors/zero-trust-detector";
export { agentAnomalyDetector }    from "./detectors/agent-anomaly-detector";
export { crossTenantDetector }     from "./detectors/cross-tenant-detector";

// ── Correlation Engine ────────────────────────────────────────────────────────
export {
  correlateSignals,
  getCorrelationRules,
} from "./correlation-engine";

// ── Risk Scoring ──────────────────────────────────────────────────────────────
export {
  computeRiskScore,
  scoreToSeverity,
  aggregateScores,
} from "./risk-scoring";
export type { RiskScoreResult } from "./risk-scoring";

// ── Alert Builder ─────────────────────────────────────────────────────────────
export {
  buildAlert,
  buildAlertsFromSignals,
  updateAlertStatus,
} from "./alert-builder";

// ── Anomaly Audit ─────────────────────────────────────────────────────────────
export {
  anomalyAuditLog,
  recordAnomalyEvent,
} from "./anomaly-audit";
export type {
  AnomalyAuditEvent,
  AnomalyAuditInput,
} from "./anomaly-audit";

// ── Repository ────────────────────────────────────────────────────────────────
export type { AnomalyRepository } from "./anomaly-repository";
export {
  InMemoryAnomalyRepository,
  inMemoryAnomalyRepository,
} from "./anomaly-repository";
export {
  PrismaAnomalyRepository,
  prismaAnomalyRepository,
} from "./persistence/prisma-anomaly-repository";

// ── Integration Adapters ──────────────────────────────────────────────────────
export {
  buildExecutiveBrainSignals,
  formatExecutiveMessage,
} from "./integrations/anomaly-executive-brain";
export type { ExecutiveBrainSignal } from "./integrations/anomaly-executive-brain";

export {
  buildZeroTrustPenalty,
  buildZeroTrustPenalties,
  anomalySignalToZeroTrustWeight,
} from "./integrations/anomaly-zero-trust";
export type { ZeroTrustPenalty } from "./integrations/anomaly-zero-trust";

export {
  mfaEventToAnomalyContext,
  mfaRecoveryEventToAnomalyContext,
} from "./integrations/anomaly-mfa";

export {
  vaultEventToAnomalyContext,
  isVaultEnumerationPattern,
} from "./integrations/anomaly-vault";

export {
  kmsEventToAnomalyContext,
  isKmsRotationSpike,
} from "./integrations/anomaly-kms";

export {
  sessionEventToAnomalyContext,
  isHighRiskSession,
} from "./integrations/anomaly-session";

// ── Query Helpers ─────────────────────────────────────────────────────────────
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

// ── Report Builder ────────────────────────────────────────────────────────────
export {
  buildSecurityRiskReport,
  buildAnomalyTrendReport,
  buildTenantRiskReport,
  buildAgentRiskReport,
} from "./anomaly-report-builder";
export type {
  SecurityRiskReport,
  AnomalyTrendReport,
  TenantRiskReport,
  AgentRiskReport,
} from "./anomaly-report-builder";

// ── Dashboard Contract ────────────────────────────────────────────────────────
export {
  buildAnomalyDashboard,
  buildEmptyAnomalyDashboard,
} from "./anomaly-dashboard-contract";
export type { AnomalyDashboardPayload } from "./anomaly-dashboard-contract";

// ── Health + Readiness ────────────────────────────────────────────────────────
export {
  evaluateAnomalyHealth,
} from "./anomaly-health";
export type {
  AnomalyHealthReport,
  AnomalyHealthStatus,
  AnomalySubsystemHealth,
} from "./anomaly-health";

export {
  scanAnomalyReadiness,
} from "./anomaly-readiness";
export type {
  AnomalyReadinessReport,
  AnomalyReadinessStatus,
  AnomalySubsystemCheck,
} from "./anomaly-readiness";
