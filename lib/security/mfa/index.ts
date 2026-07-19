/**
 * lib/security/mfa/index.ts
 *
 * AGENTIK-SECURITY-MFA-01
 * MFA Client-Safe Barrel — Types, Enums, Pure Helpers Only
 *
 * Safe to import in client components.
 * Never exports: providers, repository, audit, services, or crypto.
 */

// ── Types and Enums ───────────────────────────────────────────────────────────
export type {
  MfaMethod,
  MfaStatus,
  MfaRiskLevel,
  MfaChallengeType,
  MfaVerificationOutcome,
  MfaVerificationResult,
  MfaEnrollment,
  MfaEnrollmentInput,
  MfaChallenge,
  MfaAuditEventType,
  MfaHealthStatus,
  MfaResult,
  MfaOperation,
} from "./mfa-types";

export {
  MFA_MAX_FAIL_COUNT,
  MFA_TOTP_WINDOW,
  MFA_TOTP_STEP_SECONDS,
  MFA_CHALLENGE_TTL_SECONDS,
  MFA_RECOVERY_CODE_COUNT,
  MFA_RECOVERY_CODE_LENGTH,
  MFA_OPERATION_RISK,
} from "./mfa-types";

// ── Policy (pure domain) ──────────────────────────────────────────────────────
export type { MfaPolicy } from "./mfa-policy";
export {
  MFA_POLICIES,
  getMfaPolicy,
  isMfaRequired,
  getMfaRiskLevel,
  isMethodAllowed,
  getRequiredResources,
  getOptionalResources,
} from "./mfa-policy";

// ── Dashboard Contract (pure domain) ─────────────────────────────────────────
export type { MfaDashboardPayload } from "./mfa-dashboard-contract";
export { buildEmptyMfaDashboard } from "./mfa-dashboard-contract";

// ── Adaptive MFA (pure domain) ────────────────────────────────────────────────
export type { AdaptiveMfaContext, AdaptiveMfaEvaluation } from "./adaptive-mfa";
export {
  evaluateAdaptiveMfa,
  buildAdaptiveContext,
} from "./adaptive-mfa";

// ── Zero Trust (pure domain functions only) ───────────────────────────────────
export { requiresMfa } from "./integrations/mfa-zero-trust";
export type { MfaZeroTrustEvaluation } from "./integrations/mfa-zero-trust";

// ── Future Compatibility ──────────────────────────────────────────────────────
export {
  MFA_CAPABILITIES,
  getMfaCapabilityStatus,
  getAvailableMfaCapabilities,
  getPlannedMfaCapabilities,
} from "./future-compatibility";
