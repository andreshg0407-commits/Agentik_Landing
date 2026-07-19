/**
 * lib/security/anomaly/detectors/new-location-detector.ts
 *
 * AGENTIK-SECURITY-ANOMALY-DETECTION-01
 * New Country / New IP Detector
 *
 * Server-only. Detects NEW_COUNTRY and NEW_IP anomalies.
 * Prepared for geolocation enrichment in future sprints.
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
function _id(): string { return `nld-${Date.now()}-${++_idCounter}`; }

export class NewLocationDetector implements AnomalyDetector {
  readonly id = "new-location-detector";

  async evaluate(
    context: AnomalyContext,
    history: AnomalySignal[] = [],
  ): Promise<AnomalyResult<AnomalySignal[]>> {
    try {
      if (!context.orgSlug || !context.userId) {
        return { ok: true, value: [] };
      }

      const signals: AnomalySignal[] = [];
      const now = context.timestamp;

      // ── NEW_COUNTRY ────────────────────────────────────────────────��─────────
      const country = context.country ?? context.eventData["country"] as string | undefined;
      if (country) {
        const seenCountry = history.some(s =>
          s.orgSlug === context.orgSlug &&
          s.userId === context.userId &&
          s.type === "NEW_COUNTRY" &&
          s.metadata["country"] === country,
        );

        if (!seenCountry) {
          signals.push({
            id:          _id(),
            type:        "NEW_COUNTRY",
            orgSlug:     context.orgSlug,
            userId:      context.userId,
            sessionId:   context.sessionId,
            severity:    "MEDIUM",
            weight:      40,
            reason:      `User authenticated from new country: ${country}`,
            metadata:    {
              country,
              ipAddress:  context.ipAddress,
              // Geolocation enrichment: planned (AGENTIK-SECURITY-GEO-01)
              geoEnrichment: "PENDING",
            },
            detectorId:  this.id,
            occurredAt:  now,
            windowStart: now,
            windowEnd:   now,
          });
        }
      }

      // ── NEW_IP ───────────────────────────────────────────────────────────────
      const ipAddress = context.ipAddress ?? context.eventData["ipAddress"] as string | undefined;
      if (ipAddress) {
        const seenIp = history.some(s =>
          s.orgSlug === context.orgSlug &&
          s.userId === context.userId &&
          s.type === "NEW_IP" &&
          s.metadata["ipAddress"] === ipAddress,
        );

        if (!seenIp) {
          signals.push({
            id:          _id(),
            type:        "NEW_IP",
            orgSlug:     context.orgSlug,
            userId:      context.userId,
            sessionId:   context.sessionId,
            severity:    "LOW",
            weight:      15,
            reason:      `User authenticated from new IP address`,
            metadata:    {
              ipAddress,
              country,
            },
            detectorId:  this.id,
            occurredAt:  now,
            windowStart: now,
            windowEnd:   now,
          });
        }
      }

      return { ok: true, value: signals };
    } catch {
      return { ok: false, error: "new_location_detection_error", severity: "LOW" };
    }
  }

  supports(type: AnomalyType): boolean {
    return type === "NEW_COUNTRY" || type === "NEW_IP";
  }

  getMetadata(): AnomalyDetectorMetadata {
    return {
      id:          this.id,
      name:        "New Location Detector",
      description: "Detects logins from new countries or IP addresses. Prepared for geolocation enrichment.",
      detects:     ["NEW_COUNTRY", "NEW_IP"],
      enabled:     true,
      version:     "1.0.0",
    };
  }
}

export const newLocationDetector = new NewLocationDetector();
