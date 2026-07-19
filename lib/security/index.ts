/**
 * lib/security/index.ts
 *
 * Agentik — Security Foundation — Client-Safe Barrel
 * Sprint: AGENTIK-SECURITY-FOUNDATION-01
 *
 * Public API for client-safe code (React components, shared types, UI utilities).
 *
 * Exports ONLY:
 *   - Domain types (all SecurityEvent fields, DataSensitivity, etc.)
 *   - Pure helper functions (compareSeverity, isTenantAllowed, classifyData, etc.)
 *   - Registry types and lookup helpers (read-only catalog)
 *   - Policy contracts (no evaluator runtime)
 *   - Inventory catalog (read-only)
 *   - Security debt registry (read-only)
 *
 * NEVER exports:
 *   - globalSecurityAuditLog (server-side accumulator with state)
 *   - SecurityAuditLog class (server runtime)
 *   - canRead/canWrite/canDelete/canExport (evaluator with state dependencies)
 *   - Any file containing import "server-only"
 *   - Any file that imports from @prisma/client or lib/prisma
 */

// ── Domain Types ──────────────────────────────────────────────────────────────

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

// ── Tenant Boundary (pure helpers) ────────────────────────────────────────────

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

// ── Policy Contracts (types + pure helpers) ───────────────────────────────────

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

// ── Data Classification (pure) ────────────────────────────────────────────────

export type { ClassificationResult }        from "./data-classification";
export {
  classifyData,
  classifyResourceById,
  isHighSensitivity,
  requiresAudit,
  requiresEncryption,
}                                           from "./data-classification";

// ── Security Registry (read-only catalog) ─────────────────────────────────────

export type { SecurityRegistryEntry }       from "./security-registry";
export {
  SECURITY_REGISTRY,
  getRegistryEntry,
  getEntriesByClassification,
  getEntriesByOwner,
  getAuditRequiredEntries,
  getEncryptionRequiredEntries,
}                                           from "./security-registry";

// ── Access Context (pure builder) ─────────────────────────────────────────────

export type { AccessContext }               from "./access-context";
export {
  buildAccessContext,
  buildSystemContext,
  buildAgentContext,
  buildIntegrationContext,
  isValidAccessContext,
  getEffectiveResourceOrg,
}                                           from "./access-context";

// ── Security Signals (types + pure detectors) ─────────────────────────────────

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

// ── Report Builder (pure) ─────────────────────────────────────────────────────

export type {
  SecurityReport,
  SecurityEventSummary,
  PolicySummary,
  SecurityRisk,
}                                           from "./security-report-builder";

export { buildSecurityReport }             from "./security-report-builder";

// ── Inventory (read-only) ─────────────────────────────────────────────────────

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

// ── Security Debt Registry (read-only) ────────────────────────────────────────

export type { SecurityDebtItem }            from "./security-debt-registry";
export {
  SECURITY_DEBT_REGISTRY,
  getDebtItem,
  getDebtByPriority,
}                                           from "./security-debt-registry";

// ── Audit (event factory + types only — NO singleton) ─────────────────────────

export { createSecurityEvent }             from "./security-audit";

// ── Evaluator (types only — NO runtime) ──────────────────────────────────────

export type { EvaluationResult }            from "./security-evaluator";
