/**
 * lib/security/server.ts
 *
 * Agentik — Security Foundation — Server-Only Barrel
 * Sprint: AGENTIK-SECURITY-FOUNDATION-01
 *
 * SERVER-ONLY entry point for the Security Foundation layer.
 * Exports all runtime components including the audit singleton,
 * evaluator, policy engine, and registry.
 *
 * Never import from client components, shared domain code, or any file
 * that should not depend on server-only infrastructure.
 * Use lib/security/index.ts for client-safe imports.
 */
import "server-only";

// ── Types ─────────────────────────────────────────────────────────────────────

export type {
  SecuritySeverity,
  SecurityCategory,
  SecurityEventType,
  SecurityActorType,
  SecurityActor,
  SecurityEvent,
  DataSensitivity,
  AccessAction,
  SecurityPolicyId,
  SecuritySignalId,
}                                           from "./security-types";

export {
  SECURITY_SEVERITY_RANK,
  DATA_SENSITIVITY_RANK,
  compareSeverity,
}                                           from "./security-types";

// ── Audit ─────────────────────────────────────────────────────────────────────

export {
  SecurityAuditLog,
  globalSecurityAuditLog,
  createSecurityEvent,
  auditDataRead,
  auditDataWrite,
  auditAccessDenied,
  auditPolicyViolation,
  auditSecretAccessed,
}                                           from "./security-audit";

// ── Tenant Boundary ───────────────────────────────────────────────────────────

export type { TenantBoundaryPolicy }        from "./tenant-boundary";
export {
  TenantBoundaryViolation,
  STRICT_TENANT_BOUNDARY_POLICY,
  isTenantAllowed,
  assertSameTenant,
  assertTenantAccess,
  filterToTenant,
  isSameTenant,
}                                           from "./tenant-boundary";

// ── Policy Engine ─────────────────────────────────────────────────────────────

export type {
  SecurityPolicy,
  PolicyDecision,
  PolicyEvaluationInput,
}                                           from "./security-policy-engine";

export {
  SECURITY_POLICIES,
  evaluatePolicy,
  evaluateAllPolicies,
  isPolicyPassing,
}                                           from "./security-policy-engine";

// ── Data Classification ───────────────────────────────────────────────────────

export type { ClassificationResult }        from "./data-classification";
export {
  classifyData,
  classifyResourceById,
  isHighSensitivity,
  requiresAudit,
  requiresEncryption,
}                                           from "./data-classification";

// ── Security Registry ─────────────────────────────────────────────────────────

export type { SecurityRegistryEntry }       from "./security-registry";
export {
  SECURITY_REGISTRY,
  getRegistryEntry,
  getEntriesByClassification,
  getEntriesByOwner,
  getAuditRequiredEntries,
  getEncryptionRequiredEntries,
}                                           from "./security-registry";

// ── Access Context ────────────────────────────────────────────────────────────

export type { AccessContext }               from "./access-context";
export {
  buildAccessContext,
  buildSystemContext,
  buildAgentContext,
  buildIntegrationContext,
  isValidAccessContext,
  getEffectiveResourceOrg,
}                                           from "./access-context";

// ── Security Evaluator ────────────────────────────────────────────────────────

export type { EvaluationResult }            from "./security-evaluator";
export {
  canRead,
  canWrite,
  canDelete,
  canExport,
}                                           from "./security-evaluator";

// ── Security Signals ──────────────────────────────────────────────────────────

export type { SecuritySignal }              from "./security-signals";
export {
  detectTenantBoundaryViolation,
  detectUnclassifiedSensitiveData,
  detectUnauditedAccess,
  detectPolicyViolation,
  detectSecretExposureRisk,
  analyzeEventsForSignals,
  getSignalDefinition,
  ALL_SIGNAL_IDS,
}                                           from "./security-signals";

// ── Report Builder ────────────────────────────────────────────────────────────

export type {
  SecurityReport,
  SecurityEventSummary,
  PolicySummary,
  SecurityRisk,
}                                           from "./security-report-builder";

export { buildSecurityReport }             from "./security-report-builder";

// ── Inventory ─────────────────────────────────────────────────────────────────

export type {
  SecurityInventoryEntry,
  RiskLevel,
}                                           from "./security-inventory";

export {
  SECURITY_INVENTORY,
  getInventoryEntry,
  getCriticalRiskSurfaces,
  getSecretHandlingSurfaces,
  getExternalFacingSurfaces,
  getSurfacesWithoutAuditLog,
  getInventorySummary,
}                                           from "./security-inventory";

// ── Security Debt Registry ────────────────────────────────────────────────────

export type { SecurityDebtItem }            from "./security-debt-registry";
export {
  SECURITY_DEBT_REGISTRY,
  getDebtItem,
  getDebtByPriority,
}                                           from "./security-debt-registry";
