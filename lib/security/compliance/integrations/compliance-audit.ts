/**
 * lib/security/compliance/integrations/compliance-audit.ts
 *
 * AGENTIK-SECURITY-COMPLIANCE-01
 * Compliance Integration — Audit Persistence
 *
 * Converts audit persistence data into ComplianceEvidence for
 * CTRL_AUDIT_LOGGING and CTRL_DATA_RETENTION controls.
 *
 * No server-only. Pure domain adapter. No DB.
 */

import type { ComplianceEvidence } from "../compliance-types";
import { buildAuditEvidence } from "../evidence-engine";
import {
  CTRL_AUDIT_LOGGING,
  CTRL_DATA_RETENTION,
} from "../control-catalog";

// ── AuditComplianceInput ──────────────────────────────────────────────────────

export interface AuditComplianceInput {
  orgSlug:       string;
  eventCount:    number;
  since:         string;   // ISO 8601 — start of evaluation window
  eventTypes:    string[];
  oldestEventAt?: string;  // ISO 8601 — oldest persisted event
  /** True if audit events are being persisted (not just in-memory). */
  isPersistent:  boolean;
}

// ── auditToComplianceEvidence ─────────────────────────────────────────────────

/**
 * auditToComplianceEvidence — convert audit stats into compliance evidence.
 * Returns evidence for both CTRL_AUDIT_LOGGING and CTRL_DATA_RETENTION.
 */
export function auditToComplianceEvidence(
  input: AuditComplianceInput,
): ComplianceEvidence[] {
  try {
    const loggingEvidence = buildAuditEvidence({
      orgSlug:    input.orgSlug,
      controlId:  CTRL_AUDIT_LOGGING,
      eventCount: input.eventCount,
      since:      input.since,
      eventTypes: input.eventTypes,
    });

    const retentionDays = input.oldestEventAt
      ? Math.floor((Date.now() - new Date(input.oldestEventAt).getTime()) / 86_400_000)
      : 0;
    const hasRetentionCompliance = input.isPersistent && retentionDays >= 365;

    const retentionEvidence: ComplianceEvidence = {
      id:           `cev_audit_ret_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      orgSlug:      input.orgSlug,
      controlId:    CTRL_DATA_RETENTION,
      source:       "AUDIT_LOG",
      isSupporting: hasRetentionCompliance,
      summary:      hasRetentionCompliance
        ? `Audit logs persisted for ${retentionDays} days (≥365 day target met)`
        : `Audit retention gap: ${retentionDays} days (target: 365 days), persistent: ${input.isPersistent}`,
      data: {
        retentionDays,
        oldestEventAt:  input.oldestEventAt ?? null,
        isPersistent:   input.isPersistent,
        targetDays:     365,
      },
      collectedAt:  new Date().toISOString(),
      expiresAt:    new Date(Date.now() + 90 * 86_400_000).toISOString(),
    };

    return [loggingEvidence, retentionEvidence];
  } catch {
    return [];
  }
}

// ── hasAuditCoverage ──────────────────────────────────────────────────────────

/**
 * hasAuditCoverage — quick check: does the org have audit logging active?
 */
export function hasAuditCoverage(input: AuditComplianceInput): boolean {
  return input.eventCount > 0 && input.isPersistent;
}
