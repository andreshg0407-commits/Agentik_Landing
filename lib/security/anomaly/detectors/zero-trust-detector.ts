/**
 * lib/security/anomaly/detectors/zero-trust-detector.ts
 *
 * AGENTIK-SECURITY-ANOMALY-DETECTION-01
 * Zero Trust Score Collapse Detector
 *
 * Server-only. Detects HIGH_RISK_SESSION and UNUSUAL_ACTIVITY via trust score.
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
function _id(): string { return `ztd-${Date.now()}-${++_idCounter}`; }

/** Trust score below this triggers HIGH_RISK_SESSION. */
const TRUST_SCORE_LOW_THRESHOLD  = 30;
/** Trust score below this triggers CRITICAL HIGH_RISK_SESSION. */
const TRUST_SCORE_CRIT_THRESHOLD = 10;

export class ZeroTrustDetector implements AnomalyDetector {
  readonly id = "zero-trust-detector";

  async evaluate(
    context: AnomalyContext,
    history: AnomalySignal[] = [],
  ): Promise<AnomalyResult<AnomalySignal[]>> {
    try {
      if (!context.orgSlug) {
        return { ok: false, error: "org_slug_required", severity: "HIGH" };
      }

      const signals: AnomalySignal[] = [];
      const now     = context.timestamp;

      const rawScore = context.eventData["trustScore"];
      const trustScore = typeof rawScore === "number" ? rawScore : null;

      // ── Trust Score Collapse ──────────────────────────────────────────────────
      if (trustScore !== null) {
        if (trustScore <= TRUST_SCORE_CRIT_THRESHOLD) {
          signals.push({
            id:          _id(),
            type:        "HIGH_RISK_SESSION",
            orgSlug:     context.orgSlug,
            userId:      context.userId,
            sessionId:   context.sessionId,
            resource:    context.resource,
            severity:    "CRITICAL",
            weight:      90,
            reason:      `Trust score critically low: ${trustScore}/100 (threshold: ${TRUST_SCORE_CRIT_THRESHOLD})`,
            metadata:    {
              trustScore,
              threshold:  TRUST_SCORE_CRIT_THRESHOLD,
              category:   "TRUST_SCORE_COLLAPSE",
            },
            detectorId:  this.id,
            occurredAt:  now,
            windowStart: now,
            windowEnd:   now,
          });
        } else if (trustScore <= TRUST_SCORE_LOW_THRESHOLD) {
          signals.push({
            id:          _id(),
            type:        "HIGH_RISK_SESSION",
            orgSlug:     context.orgSlug,
            userId:      context.userId,
            sessionId:   context.sessionId,
            resource:    context.resource,
            severity:    "HIGH",
            weight:      60,
            reason:      `Trust score low: ${trustScore}/100 (threshold: ${TRUST_SCORE_LOW_THRESHOLD})`,
            metadata:    {
              trustScore,
              threshold:  TRUST_SCORE_LOW_THRESHOLD,
              category:   "TRUST_SCORE_LOW",
            },
            detectorId:  this.id,
            occurredAt:  now,
            windowStart: now,
            windowEnd:   now,
          });
        }
      }

      // ── Repeated Denied Operations ────────────────────────────────────────────
      const isDeniedOp = context.eventData["zeroTrustOutcome"] === "DENIED" ||
                         context.eventData["denied"] === true;

      if (isDeniedOp && context.userId) {
        const windowStart = new Date(new Date(now).getTime() - 10 * 60 * 1000).toISOString();
        const deniedCount = history.filter(s =>
          s.orgSlug === context.orgSlug &&
          s.userId === context.userId &&
          s.type === "UNUSUAL_ACTIVITY" &&
          s.metadata["category"] === "ZT_REPEATED_DENIAL" &&
          s.occurredAt >= windowStart,
        ).length;

        if (deniedCount >= 3) {
          signals.push({
            id:          _id(),
            type:        "UNUSUAL_ACTIVITY",
            orgSlug:     context.orgSlug,
            userId:      context.userId,
            sessionId:   context.sessionId,
            severity:    "MEDIUM",
            weight:      40,
            reason:      `Repeated Zero Trust denials: ${deniedCount + 1} in 10min`,
            metadata:    {
              category:     "ZT_REPEATED_DENIAL",
              denialCount:  deniedCount + 1,
              resource:     context.resource,
              trustScore,
            },
            detectorId:  this.id,
            occurredAt:  now,
            windowStart,
            windowEnd:   now,
          });
        }
      }

      return { ok: true, value: signals };
    } catch {
      return { ok: false, error: "zero_trust_detection_error", severity: "MEDIUM" };
    }
  }

  supports(type: AnomalyType): boolean {
    return type === "HIGH_RISK_SESSION" || type === "UNUSUAL_ACTIVITY";
  }

  getMetadata(): AnomalyDetectorMetadata {
    return {
      id:          this.id,
      name:        "Zero Trust Score Detector",
      description: "Detects trust score collapse and repeated Zero Trust denied operations.",
      detects:     ["HIGH_RISK_SESSION", "UNUSUAL_ACTIVITY"],
      enabled:     true,
      version:     "1.0.0",
    };
  }
}

export const zeroTrustDetector = new ZeroTrustDetector();
