/**
 * lib/security/mfa/server.ts
 *
 * AGENTIK-SECURITY-MFA-01
 * MFA Server Barrel — Server-only exports
 *
 * Import this file ONLY in server components, API routes, or server actions.
 * Never import in client components.
 */

import "server-only";

// ── Core ──────────────────────────────────────────────────────────────────────
export * from "./mfa-types";
export * from "./mfa-policy";
export * from "./mfa-provider";
export * from "./mfa-repository";

// ── Provider ──────────────────────────────────────────────────────────────────
export {
  TotpProvider,
  totpProvider,
  generateTotpSecret,
  generateOtp,
  verifyOtp,
  generateQrPayload,
} from "./providers/totp-provider";

// ── Recovery Codes ────────────────────────────────────────────────────────────
export {
  generateRecoveryCodes,
  hashRecoveryCode,
  verifyRecoveryCode,
  hashAllRecoveryCodes,
} from "./recovery-codes";

// ── Enrollment Service ────────────────────────────────────────────────────────
export { MfaEnrollmentService } from "./mfa-enrollment";
export type { StartEnrollmentOutput, ConfirmEnrollmentOutput } from "./mfa-enrollment";

// ── Verification Service ──────────────────────────────────────────────────────
export { MfaVerificationService } from "./mfa-verification";
export type { MfaVerificationInput } from "./mfa-verification";

// ── Audit ─────────────────────────────────────────────────────────────────────
export { mfaAuditLog, recordMfaEvent } from "./mfa-audit";
export type { MfaAuditEvent, MfaAuditInput } from "./mfa-audit";

// ── Integrations ──────────────────────────────────────────────────────────────
export { mfaEncryptionAdapter, getMfaKeyAlias } from "./integrations/mfa-encryption";
export { mfaVaultAdapter, getMfaVaultAlias } from "./integrations/mfa-vault";
export { checkMfaRbac, getMfaOperationRiskLevel } from "./integrations/mfa-rbac";
export type { MfaRbacInput, MfaRbacResult, MfaPermission } from "./integrations/mfa-rbac";
export {
  requiresMfa,
  evaluateMfaRequirement,
  buildMfaSignal,
} from "./integrations/mfa-zero-trust";
export type { MfaZeroTrustInput, MfaZeroTrustEvaluation } from "./integrations/mfa-zero-trust";

// ── Adaptive MFA ──────────────────────────────────────────────────────────────
export { evaluateAdaptiveMfa, buildAdaptiveContext } from "./adaptive-mfa";
export type { AdaptiveMfaContext, AdaptiveMfaEvaluation } from "./adaptive-mfa";

// ── Session Binding ────────────────────────────────────────────────────────────
export { mfaSessionStore, buildSessionId, isMfaValid } from "./session-binding";
export type { SessionMfaToken } from "./session-binding";

// ── Health & Readiness ────────────────────────────────────────────────────────
export { evaluateMfaHealth } from "./mfa-health";
export type { MfaHealthReport, MfaSubsystemHealth } from "./mfa-health";
export { scanMfaReadiness } from "./mfa-readiness";
export type { MfaReadinessReport, MfaSubsystemCheck, MfaReadinessStatus } from "./mfa-readiness";

// ── Query ─────────────────────────────────────────────────────────────────────
export {
  getUserMfaStatus,
  getTenantMfaCoverage,
  getEnabledMethods,
  getRecoveryUsage,
  getRecentMfaFailures,
} from "./mfa-query";
export type { UserMfaStatus, TenantMfaCoverage, RecoveryUsageSummary } from "./mfa-query";

// ── Reports ────────────────────────────────────────────────────────────────────
export {
  buildMfaCoverageReport,
  buildEnrollmentReport,
  buildComplianceReport,
  buildRiskReport,
} from "./mfa-report-builder";
export type {
  MfaCoverageReport,
  MfaEnrollmentReport,
  MfaComplianceReport,
  MfaRiskReport,
} from "./mfa-report-builder";

// ── Dashboard ─────────────────────────────────────────────────────────────────
export { buildMfaDashboard, buildEmptyMfaDashboard } from "./mfa-dashboard-contract";
export type { MfaDashboardPayload } from "./mfa-dashboard-contract";

// ── Future Compatibility ──────────────────────────────────────────────────────
export {
  MFA_CAPABILITIES,
  getMfaCapabilityStatus,
  getAvailableMfaCapabilities,
  getPlannedMfaCapabilities,
} from "./future-compatibility";

// ── Persistence ────────────────────────────────────────────────────────────────
export { PrismaMfaRepository, prismaMfaRepository } from "./persistence/prisma-mfa-repository";
