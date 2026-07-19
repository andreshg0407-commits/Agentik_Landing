/**
 * lib/security/anomaly/detectors/cross-tenant-detector.ts
 *
 * AGENTIK-SECURITY-ANOMALY-DETECTION-01
 * Cross-Tenant Access Detector
 *
 * Server-only. CRITICAL by default. Any cross-tenant signal = immediate alert.
 * Detects: cross-tenant data access, query leakage, reference misuse.
 */

import "server-only";

import type { AnomalyDetector } from "../anomaly-detector";
import type {
  AnomalyContext,
  AnomalySignal,
  AnomalyType,
  AnomalyDetectorMetadata,
  AnomalyResult,
} from "../anomaly-types";

let _idCounter = 0;
function _id(): string { return `ctd-${Date.now()}-${++_idCounter}`; }

export class CrossTenantDetector implements AnomalyDetector {
  readonly id = "cross-tenant-detector";

  async evaluate(
    context: AnomalyContext,
    _history: AnomalySignal[] = [],
  ): Promise<AnomalyResult<AnomalySignal[]>> {
    try {
      if (!context.orgSlug) {
        return { ok: false, error: "org_slug_required", severity: "CRITICAL" };
      }

      const signals: AnomalySignal[] = [];
      const now = context.timestamp;

      // ── Direct cross-tenant access ────────────────────────────────────────────
      const targetOrgSlug = context.eventData["targetOrgSlug"] as string | undefined;
      const isCrossTenant =
        context.eventData["isCrossTenantAccess"] === true ||
        context.eventData["crossTenantViolation"] === true ||
        (targetOrgSlug && targetOrgSlug !== context.orgSlug);

      if (isCrossTenant) {
        signals.push({
          id:          _id(),
          type:        "CROSS_TENANT_ATTEMPT",
          orgSlug:     context.orgSlug,
          userId:      context.userId,
          agentId:     context.agentId,
          sessionId:   context.sessionId,
          resource:    context.resource,
          severity:    "CRITICAL",
          weight:      100,
          reason:      `Cross-tenant access attempt detected from org ${context.orgSlug}`,
          metadata:    {
            sourceOrgSlug:  context.orgSlug,
            targetOrgSlug:  targetOrgSlug ?? context.eventData["targetOrgSlug"],
            operation:      context.operation,
            resource:       context.resource,
            violationType:  "DIRECT_ACCESS",
          },
          detectorId:  this.id,
          occurredAt:  now,
          windowStart: now,
          windowEnd:   now,
        });
      }

      // ── Cross-tenant query leak ───────────────────────────────────────────────
      const isCrossTenantQuery = context.eventData["isCrossTenantQuery"] === true;
      if (isCrossTenantQuery) {
        signals.push({
          id:          _id(),
          type:        "CROSS_TENANT_ATTEMPT",
          orgSlug:     context.orgSlug,
          userId:      context.userId,
          agentId:     context.agentId,
          sessionId:   context.sessionId,
          severity:    "CRITICAL",
          weight:      100,
          reason:      `Cross-tenant query leak — query returned or referenced data from another tenant`,
          metadata:    {
            sourceOrgSlug: context.orgSlug,
            violationType: "QUERY_LEAK",
            operation:     context.operation,
            resource:      context.resource,
          },
          detectorId:  this.id,
          occurredAt:  now,
          windowStart: now,
          windowEnd:   now,
        });
      }

      // ── Cross-tenant reference ────────────────────────────────────────────────
      const isCrossTenantRef = context.eventData["isCrossTenantReference"] === true;
      if (isCrossTenantRef) {
        signals.push({
          id:          _id(),
          type:        "CROSS_TENANT_ATTEMPT",
          orgSlug:     context.orgSlug,
          userId:      context.userId,
          agentId:     context.agentId,
          sessionId:   context.sessionId,
          severity:    "CRITICAL",
          weight:      100,
          reason:      `Cross-tenant reference detected — resource references leaked another tenant's ID`,
          metadata:    {
            sourceOrgSlug: context.orgSlug,
            violationType: "REFERENCE_LEAK",
            resource:      context.resource,
          },
          detectorId:  this.id,
          occurredAt:  now,
          windowStart: now,
          windowEnd:   now,
        });
      }

      return { ok: true, value: signals };
    } catch {
      return { ok: false, error: "cross_tenant_detection_error", severity: "CRITICAL" };
    }
  }

  supports(type: AnomalyType): boolean {
    return type === "CROSS_TENANT_ATTEMPT";
  }

  getMetadata(): AnomalyDetectorMetadata {
    return {
      id:          this.id,
      name:        "Cross-Tenant Detector",
      description: "Detects any cross-tenant access attempt, query leak, or reference misuse. Always CRITICAL severity.",
      detects:     ["CROSS_TENANT_ATTEMPT"],
      enabled:     true,
      version:     "1.0.0",
    };
  }
}

export const crossTenantDetector = new CrossTenantDetector();
