/**
 * lib/security/compliance/evidence-engine.ts
 *
 * AGENTIK-SECURITY-COMPLIANCE-01
 * Compliance & Governance — Evidence Engine
 *
 * Generates ComplianceEvidence from security subsystem data.
 * Evidence is supporting (positive) or non-supporting (gap/violation indicator).
 *
 * No server-only. Pure domain logic. No DB. No external deps.
 * Fail-closed: all functions return null or empty arrays on error.
 */

import type {
  ComplianceEvidence,
  EvidenceSource,
  ComplianceFramework,
} from "./compliance-types";
import { EVIDENCE_TTL_DAYS } from "./compliance-types";

// ── ID generator ──────────────────────────────────────────────────────────────

function _id(): string {
  return `cev_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

// ── buildEvidence ─────────────────────────────────────────────────────────────

/**
 * buildEvidence — construct a ComplianceEvidence record.
 * Pure function — no side effects.
 */
export function buildEvidence(params: {
  orgSlug:      string;
  controlId:    string;
  source:       EvidenceSource;
  isSupporting: boolean;
  summary:      string;
  data:         Record<string, unknown>;
  actorId?:     string;
  framework?:   ComplianceFramework;
}): ComplianceEvidence {
  const now       = new Date().toISOString();
  const ttlDays   = EVIDENCE_TTL_DAYS[params.source] ?? 30;
  const expiresAt = new Date(Date.now() + ttlDays * 86_400_000).toISOString();

  return {
    id:           _id(),
    orgSlug:      params.orgSlug,
    controlId:    params.controlId,
    source:       params.source,
    isSupporting: params.isSupporting,
    summary:      params.summary,
    data:         params.data,
    collectedAt:  now,
    expiresAt,
    actorId:      params.actorId,
    framework:    params.framework,
  };
}

// ── Audit Evidence ────────────────────────────────────────────────────────────

/**
 * buildAuditEvidence — create evidence from persistent audit log presence.
 */
export function buildAuditEvidence(params: {
  orgSlug:    string;
  controlId:  string;
  eventCount: number;
  since:      string;   // ISO 8601
  eventTypes: string[];
}): ComplianceEvidence {
  const isSupporting = params.eventCount > 0;
  return buildEvidence({
    orgSlug:      params.orgSlug,
    controlId:    params.controlId,
    source:       "AUDIT_LOG",
    isSupporting,
    summary:      isSupporting
      ? `${params.eventCount} audit events recorded since ${params.since}`
      : `No audit events found since ${params.since} — logging may be inactive`,
    data: {
      eventCount: params.eventCount,
      since:      params.since,
      eventTypes: params.eventTypes,
    },
  });
}

// ── RBAC Evidence ─────────────────────────────────────────────────────────────

/**
 * buildRbacEvidence — create evidence from RBAC access decisions.
 */
export function buildRbacEvidence(params: {
  orgSlug:         string;
  controlId:       string;
  roleCount:       number;
  assignmentCount: number;
  hasLeastPrivilege: boolean;
}): ComplianceEvidence {
  const isSupporting = params.roleCount > 0 && params.hasLeastPrivilege;
  return buildEvidence({
    orgSlug:      params.orgSlug,
    controlId:    params.controlId,
    source:       "RBAC",
    isSupporting,
    summary: isSupporting
      ? `RBAC active: ${params.roleCount} roles, ${params.assignmentCount} assignments, least-privilege enforced`
      : `RBAC gap: ${params.roleCount} roles, least-privilege: ${params.hasLeastPrivilege}`,
    data: {
      roleCount:         params.roleCount,
      assignmentCount:   params.assignmentCount,
      hasLeastPrivilege: params.hasLeastPrivilege,
    },
  });
}

// ── MFA Evidence ─────────────────────────────────────────────────────────────

/**
 * buildMfaEvidence — create evidence from MFA enrollment and verification stats.
 */
export function buildMfaEvidence(params: {
  orgSlug:           string;
  controlId:         string;
  enrolledCount:     number;
  totalUsers:        number;
  enforcedForAdmins: boolean;
}): ComplianceEvidence {
  const coverage    = params.totalUsers > 0
    ? Math.round((params.enrolledCount / params.totalUsers) * 100)
    : 0;
  const isSupporting = coverage >= 80 && params.enforcedForAdmins;
  return buildEvidence({
    orgSlug:      params.orgSlug,
    controlId:    params.controlId,
    source:       "MFA",
    isSupporting,
    summary: isSupporting
      ? `MFA coverage: ${coverage}% (${params.enrolledCount}/${params.totalUsers} users), admin enforcement: ${params.enforcedForAdmins}`
      : `MFA gap: ${coverage}% coverage — target ≥80%; admin enforcement: ${params.enforcedForAdmins}`,
    data: {
      enrolledCount:     params.enrolledCount,
      totalUsers:        params.totalUsers,
      coveragePct:       coverage,
      enforcedForAdmins: params.enforcedForAdmins,
    },
  });
}

// ── Vault Evidence ────────────────────────────────────────────────────────────

/**
 * buildVaultEvidence — create evidence from Vault secret management.
 */
export function buildVaultEvidence(params: {
  orgSlug:          string;
  controlId:        string;
  secretCount:      number;
  encryptedCount:   number;
  hasAccessPolicy:  boolean;
}): ComplianceEvidence {
  const allEncrypted = params.secretCount > 0 && params.encryptedCount === params.secretCount;
  const isSupporting = allEncrypted && params.hasAccessPolicy;
  return buildEvidence({
    orgSlug:      params.orgSlug,
    controlId:    params.controlId,
    source:       "VAULT",
    isSupporting,
    summary: isSupporting
      ? `Vault: ${params.secretCount} secrets, all encrypted, access policies active`
      : `Vault gap: ${params.secretCount} secrets, ${params.encryptedCount} encrypted, access policy: ${params.hasAccessPolicy}`,
    data: {
      secretCount:     params.secretCount,
      encryptedCount:  params.encryptedCount,
      allEncrypted,
      hasAccessPolicy: params.hasAccessPolicy,
    },
  });
}

// ── KMS Evidence ──────────────────────────────────────────────────────────────

/**
 * buildKmsEvidence — create evidence from KMS key management.
 */
export function buildKmsEvidence(params: {
  orgSlug:         string;
  controlId:       string;
  keyCount:        number;
  rotatedCount:    number;
  hasRotationPolicy: boolean;
}): ComplianceEvidence {
  const rotationCoverage = params.keyCount > 0
    ? Math.round((params.rotatedCount / params.keyCount) * 100)
    : 0;
  const isSupporting = params.keyCount > 0 && params.hasRotationPolicy;
  return buildEvidence({
    orgSlug:      params.orgSlug,
    controlId:    params.controlId,
    source:       "KMS",
    isSupporting,
    summary: isSupporting
      ? `KMS: ${params.keyCount} keys, ${rotationCoverage}% rotated, rotation policy active`
      : `KMS gap: ${params.keyCount} keys, rotation policy: ${params.hasRotationPolicy}`,
    data: {
      keyCount:          params.keyCount,
      rotatedCount:      params.rotatedCount,
      rotationCoverage,
      hasRotationPolicy: params.hasRotationPolicy,
    },
  });
}

// ── Zero Trust Evidence ───────────────────────────────────────────────────────

/**
 * buildZeroTrustEvidence — create evidence from Zero Trust evaluation.
 */
export function buildZeroTrustEvidence(params: {
  orgSlug:          string;
  controlId:        string;
  policiesActive:   number;
  lastDenied:       number;   // count of deny decisions in window
  hasStepUp:        boolean;  // step-up (MFA challenge) supported
}): ComplianceEvidence {
  const isSupporting = params.policiesActive > 0;
  return buildEvidence({
    orgSlug:      params.orgSlug,
    controlId:    params.controlId,
    source:       "ZERO_TRUST",
    isSupporting,
    summary: isSupporting
      ? `Zero Trust: ${params.policiesActive} active policies, step-up: ${params.hasStepUp}, recent denials: ${params.lastDenied}`
      : `Zero Trust gap: no active policies — access may be implicitly trusted`,
    data: {
      policiesActive: params.policiesActive,
      lastDenied:     params.lastDenied,
      hasStepUp:      params.hasStepUp,
    },
  });
}

// ── Anomaly Evidence ──────────────────────────────────────────────────────────

/**
 * buildAnomalyEvidence — create evidence from anomaly detection system.
 */
export function buildAnomalyEvidence(params: {
  orgSlug:         string;
  controlId:       string;
  detectorCount:   number;
  openAlerts:      number;
  criticalAlerts:  number;
  isMonitoringActive: boolean;
}): ComplianceEvidence {
  const isSupporting = params.isMonitoringActive && params.detectorCount >= 5;
  return buildEvidence({
    orgSlug:      params.orgSlug,
    controlId:    params.controlId,
    source:       "ANOMALY_DETECTION",
    isSupporting,
    summary: isSupporting
      ? `Anomaly detection active: ${params.detectorCount} detectors, ${params.openAlerts} open alerts (${params.criticalAlerts} critical)`
      : `Anomaly detection gap: monitoring active=${params.isMonitoringActive}, detectors=${params.detectorCount}`,
    data: {
      detectorCount:      params.detectorCount,
      openAlerts:         params.openAlerts,
      criticalAlerts:     params.criticalAlerts,
      isMonitoringActive: params.isMonitoringActive,
    },
  });
}

// ── Evidence aggregation helpers ──────────────────────────────────────────────

/**
 * isEvidenceExpired — check if a piece of evidence has expired.
 */
export function isEvidenceExpired(evidence: ComplianceEvidence): boolean {
  if (!evidence.expiresAt) return false;
  try {
    return new Date(evidence.expiresAt).getTime() < Date.now();
  } catch {
    return false;
  }
}

/**
 * filterActiveEvidence — remove expired evidence from a list.
 */
export function filterActiveEvidence(
  evidence: ComplianceEvidence[],
): ComplianceEvidence[] {
  return evidence.filter(e => !isEvidenceExpired(e));
}

/**
 * getSupportingEvidence — return only evidence that supports compliance.
 */
export function getSupportingEvidence(
  evidence: ComplianceEvidence[],
  controlId?: string,
): ComplianceEvidence[] {
  return evidence.filter(e =>
    e.isSupporting &&
    (controlId === undefined || e.controlId === controlId) &&
    !isEvidenceExpired(e),
  );
}

/**
 * getGapEvidence — return only evidence that indicates a gap.
 */
export function getGapEvidence(
  evidence: ComplianceEvidence[],
  controlId?: string,
): ComplianceEvidence[] {
  return evidence.filter(e =>
    !e.isSupporting &&
    (controlId === undefined || e.controlId === controlId),
  );
}
