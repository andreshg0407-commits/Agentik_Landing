/**
 * lib/security/zero-trust/index.ts
 *
 * AGENTIK-SECURITY-ZERO-TRUST-01
 * Zero Trust Client-Safe Barrel — Pure Types and Domain Helpers
 *
 * Safe to import in any context (client or server).
 * Does NOT re-export server-only modules.
 *
 * Exports:
 *   - All domain types
 *   - Trust score engine (pure, deterministic)
 *   - Session trust (pure)
 *   - Tenant isolation (pure)
 *   - Security events (pure)
 *   - Security dashboard contract (pure)
 *   - Readiness scanner (pure)
 *   - Health monitor (pure)
 *   - Future compatibility contracts
 */

// ── Core Types ────────────────────────────────────────────────────────────────
export type {
  ZeroTrustDecision,
  ZeroTrustRiskLevel,
  ZeroTrustSubjectType,
  ZeroTrustResourceType,
  ZeroTrustAction,
  ZeroTrustContext,
  ZeroTrustEvaluation,
  TrustScoreInput,
  SessionTrustInput,
  SessionTrustResult,
  TenantIsolationResult,
  AgentAccessResult,
  IntegrationTrustResult,
} from "./zero-trust-types";

export {
  TRUST_THRESHOLDS,
  RESOURCE_RISK_LEVELS,
  ACTION_RISK_MULTIPLIERS,
} from "./zero-trust-types";

// ── Trust Score Engine ────────────────────────────────────────────────────────
export {
  calculateTrustScore,
  isTrustedScore,
  isTrustedForRisk,
  riskFromScore,
  buildDefaultScoreInput,
  FACTOR_WEIGHTS,
  SUBJECT_BASE_DEDUCTIONS,
} from "./trust-score-engine";

export type {
  TrustScoreFactor,
  TrustScoreResult,
} from "./trust-score-engine";

// ── Session Trust ─────────────────────────────────────────────────────────────
export {
  evaluateSessionTrust,
  isSessionTrusted,
  buildSessionInput,
} from "./session-trust";

// ── Tenant Isolation ──────────────────────────────────────────────────────────
export {
  verifyTenantIsolation,
  assertTenantMatch,
  isSameTenant,
  isValidOrgSlug,
  buildIsolationSummary,
} from "./tenant-isolation";

// ── Security Events ───────────────────────────────────────────────────────────
export {
  buildZeroTrustEvent,
  buildCrossTenantEvent,
  buildAgentScopeEvent,
  buildIntegrationBlockedEvent,
  buildSecretAccessDeniedEvent,
  buildSessionHijackEvent,
  buildSessionExpiredEvent,
  isCriticalEvent,
  filterEventsByOrg,
  filterEventsBySeverity,
} from "./security-events";

export type {
  SecurityEvent,
  SecurityEventType,
  SecurityEventSeverity,
} from "./security-events";

// ── Dashboard Contract ────────────────────────────────────────────────────────
export {
  buildZeroTrustDashboard,
  buildEmptyDashboard,
  severityToLabel,
} from "./security-dashboard-contract";

export type {
  ZeroTrustSummaryKPIs,
  ThreatBreakdown,
  TrustScoreDistribution,
  RiskLevelBreakdown,
  TopDeniedResource,
  AgentSecurityMetrics,
  IntegrationSecurityMetrics,
  ZeroTrustDashboardPayload,
} from "./security-dashboard-contract";

// ── Readiness Scanner ─────────────────────────────────────────────────────────
export {
  scanZeroTrustReadiness,
} from "./zero-trust-readiness";

export type {
  ZeroTrustReadinessStatus,
  ZeroTrustSubsystemCheck,
  ZeroTrustReadinessReport,
} from "./zero-trust-readiness";

// ── Health Monitor ────────────────────────────────────────────────────────────
export {
  evaluateZeroTrustHealth,
  isZeroTrustHealthy,
  getUnhealthySignals,
} from "./zero-trust-health";

export type {
  ZeroTrustHealthStatus,
  ZeroTrustHealthSignal,
  ZeroTrustHealthReport,
} from "./zero-trust-health";

// ── Future Compatibility ──────────────────────────────────────────────────────
export type {
  ZeroTrustFutureCapability,
  ZeroTrustFutureCapabilityEntry,
} from "./future-compatibility";

export {
  ZERO_TRUST_FUTURE_CAPABILITIES,
  getZeroTrustCapabilityStatus,
} from "./future-compatibility";
