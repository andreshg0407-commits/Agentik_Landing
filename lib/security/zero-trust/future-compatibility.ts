/**
 * lib/security/zero-trust/future-compatibility.ts
 *
 * AGENTIK-SECURITY-ZERO-TRUST-01
 * Future Compatibility — Planned Capabilities and Integration Contracts
 *
 * No server-only. No Prisma. Pure type contracts.
 *
 * Documents the planned capabilities for future Zero Trust sprints.
 * These interfaces define the contracts that future implementations must satisfy.
 *
 * Planned integrations:
 *   KMS-01             — AWS KMS / HashiCorp Vault key management
 *   MFA-01             — Multi-factor authentication enforcement
 *   ANOMALY-DETECT-01  — AI-powered anomaly detection signals
 *   SOC-01             — SIEM/SOC integration for real-time alerting
 *   DEVICE-TRUST-01    — Device fingerprint registry and trust scoring
 *   GEO-RESTRICT-01    — Geo-fencing and IP velocity checks
 */

// ── Capability Registry ───────────────────────────────────────────────────────

export type ZeroTrustFutureCapability =
  | "KMS_INTEGRATION"
  | "MFA_ENFORCEMENT"
  | "ANOMALY_DETECTION"
  | "SOC_INTEGRATION"
  | "DEVICE_TRUST"
  | "GEO_RESTRICTION";

export type ZeroTrustFutureCapabilityStatus =
  | "PLANNED"
  | "IN_PROGRESS"
  | "READY_FOR_INTEGRATION";

export interface ZeroTrustFutureCapabilityEntry {
  capability:    ZeroTrustFutureCapability;
  sprintId:      string;
  description:   string;
  status:        ZeroTrustFutureCapabilityStatus;
  blockedBy?:    string[];
  integrationPoints: string[];
}

export const ZERO_TRUST_FUTURE_CAPABILITIES: ReadonlyArray<ZeroTrustFutureCapabilityEntry> = [
  {
    capability:         "KMS_INTEGRATION",
    sprintId:           "AGENTIK-SECURITY-KMS-01",
    description:        "Integrate AWS KMS or HashiCorp Vault for hardware-backed key management and automatic key rotation",
    status:             "PLANNED",
    integrationPoints:  ["vault-security.ts", "vault-core.ts", "key-management.ts"],
  },
  {
    capability:         "MFA_ENFORCEMENT",
    sprintId:           "AGENTIK-SECURITY-MFA-01",
    description:        "Enforce MFA for all CRITICAL risk operations; integrate with TOTP and WebAuthn providers",
    status:             "PLANNED",
    integrationPoints:  ["zero-trust-policy-engine.ts", "session-trust.ts", "trust-score-engine.ts"],
  },
  {
    capability:         "ANOMALY_DETECTION",
    sprintId:           "AGENTIK-SECURITY-ANOMALY-DETECTION-01",
    description:        "AI-powered anomaly detection: velocity checks, behavioral baselines, geo-IP analysis feeding into trust score",
    status:             "PLANNED",
    blockedBy:          ["AGENTIK-SECURITY-KMS-01"],
    integrationPoints:  ["trust-score-engine.ts", "zero-trust-policy-engine.ts", "security-events.ts"],
  },
  {
    capability:         "SOC_INTEGRATION",
    sprintId:           "AGENTIK-SECURITY-SOC-01",
    description:        "SIEM/SOC integration: emit CRITICAL events to external alerting (PagerDuty, Splunk, Elastic SIEM)",
    status:             "PLANNED",
    blockedBy:          ["AGENTIK-SECURITY-ANOMALY-DETECTION-01"],
    integrationPoints:  ["security-events.ts", "security-audit.ts"],
  },
  {
    capability:         "DEVICE_TRUST",
    sprintId:           "AGENTIK-SECURITY-DEVICE-TRUST-01",
    description:        "Device fingerprint registry and trust scoring: MDM integration, certificate-based device attestation",
    status:             "PLANNED",
    integrationPoints:  ["trust-score-engine.ts", "session-trust.ts"],
  },
  {
    capability:         "GEO_RESTRICTION",
    sprintId:           "AGENTIK-SECURITY-GEO-01",
    description:        "Geo-fencing: block access from unexpected geographies, velocity checks for impossible travel detection",
    status:             "PLANNED",
    blockedBy:          ["AGENTIK-SECURITY-ANOMALY-DETECTION-01"],
    integrationPoints:  ["trust-score-engine.ts", "session-trust.ts", "zero-trust-policy-engine.ts"],
  },
];

// ── KMS Integration Contract ──────────────────────────────────────────────────

/**
 * KmsZeroTrustAdapter — interface that AGENTIK-SECURITY-KMS-01 must implement.
 * Allows the policy engine to request hardware-backed trust verification.
 */
export interface KmsZeroTrustAdapter {
  /** Verify that the encryption key ID is valid and not revoked in KMS. */
  verifyKeyIntegrity(keyId: string, orgSlug: string): Promise<{ valid: boolean; reason?: string }>;
  /** Request a hardware attestation for a session. */
  attestSession(sessionId: string, orgSlug: string): Promise<{ attested: boolean; score: number }>;
}

// ── MFA Enforcement Contract ──────────────────────────────────────────────────

/**
 * MfaZeroTrustAdapter — interface that AGENTIK-SECURITY-MFA-01 must implement.
 * Feeds MFA status into trust score computation.
 */
export interface MfaZeroTrustAdapter {
  /** Check if the user has completed MFA in the current session. */
  isMfaVerified(userId: string, sessionId: string, orgSlug: string): Promise<boolean>;
  /** Trigger a step-up MFA challenge for a CHALLENGE decision. */
  requestStepUp(userId: string, sessionId: string, orgSlug: string): Promise<{ challengeId: string }>;
}

// ── Anomaly Detection Contract ────────────────────────────────────────────────

/**
 * AnomalySignal — the shape of signals that AGENTIK-SECURITY-ANOMALY-DETECTION-01 produces.
 * Feeds into trust score as noSuspiciousSignals and hasRecentActivity factors.
 */
export interface AnomalySignal {
  userId:          string;
  orgSlug:         string;
  hasSuspicious:   boolean;
  hasRecentNormal: boolean;
  anomalyScore:    number;   // 0 = clean, 100 = highly suspicious
  signals:         string[];
  evaluatedAt:     string;
}

// ── SOC Emitter Contract ──────────────────────────────────────────────────────

/**
 * SocEventEmitter — interface that AGENTIK-SECURITY-SOC-01 must implement.
 */
export interface SocEventEmitter {
  /** Emit a critical security event to the SOC pipeline. */
  emit(event: {
    eventId:     string;
    eventType:   string;
    severity:    string;
    orgSlug:     string;
    subjectId:   string;
    reasons:     string[];
    occurredAt:  string;
  }): Promise<void>;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * getZeroTrustCapabilityStatus — look up the readiness of a future capability.
 */
export function getZeroTrustCapabilityStatus(
  capability: ZeroTrustFutureCapability,
): ZeroTrustFutureCapabilityEntry | null {
  return ZERO_TRUST_FUTURE_CAPABILITIES.find(c => c.capability === capability) ?? null;
}
