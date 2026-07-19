/**
 * lib/security/anomaly/detectors/new-device-detector.ts
 *
 * AGENTIK-SECURITY-ANOMALY-DETECTION-01
 * New Device / Browser / Fingerprint Detector
 *
 * Server-only. Detects NEW_DEVICE anomalies.
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
function _id(): string { return `ndd-${Date.now()}-${++_idCounter}`; }

export class NewDeviceDetector implements AnomalyDetector {
  readonly id = "new-device-detector";

  async evaluate(
    context: AnomalyContext,
    history: AnomalySignal[] = [],
  ): Promise<AnomalyResult<AnomalySignal[]>> {
    try {
      if (!context.orgSlug) {
        return { ok: false, error: "org_slug_required", severity: "HIGH" };
      }

      const deviceId  = context.deviceId ?? context.eventData["deviceId"] as string | undefined;
      const userAgent = context.userAgent ?? context.eventData["userAgent"] as string | undefined;

      if (!deviceId && !userAgent) {
        return { ok: true, value: [] };  // Not enough context to detect
      }

      const fingerprint = deviceId ?? _hashUserAgent(userAgent ?? "");

      // Check if this device/fingerprint was seen before for this user+org
      const seenBefore = history.some(s =>
        s.orgSlug === context.orgSlug &&
        s.userId === context.userId &&
        (s.metadata["deviceFingerprint"] === fingerprint ||
         s.metadata["deviceId"] === deviceId),
      );

      if (seenBefore) {
        return { ok: true, value: [] };
      }

      // Only generate signal if we have userId context
      if (!context.userId) {
        return { ok: true, value: [] };
      }

      const signal: AnomalySignal = {
        id:          _id(),
        type:        "NEW_DEVICE",
        orgSlug:     context.orgSlug,
        userId:      context.userId,
        sessionId:   context.sessionId,
        severity:    "LOW",
        weight:      20,
        reason:      `User authenticated from a device not previously seen`,
        metadata:    {
          deviceFingerprint: fingerprint,
          deviceId,
          userAgent:         userAgent ? _truncate(userAgent, 100) : undefined,
        },
        detectorId:  this.id,
        occurredAt:  context.timestamp,
        windowStart: context.timestamp,
        windowEnd:   context.timestamp,
      };

      return { ok: true, value: [signal] };
    } catch {
      return { ok: false, error: "new_device_detection_error", severity: "LOW" };
    }
  }

  supports(type: AnomalyType): boolean {
    return type === "NEW_DEVICE";
  }

  getMetadata(): AnomalyDetectorMetadata {
    return {
      id:          this.id,
      name:        "New Device Detector",
      description: "Detects logins from new or unrecognized devices, browsers, and fingerprints.",
      detects:     ["NEW_DEVICE"],
      enabled:     true,
      version:     "1.0.0",
    };
  }
}

/** Simple fingerprint from user-agent (non-cryptographic — for anomaly correlation only). */
function _hashUserAgent(ua: string): string {
  let hash = 0;
  for (let i = 0; i < ua.length; i++) {
    hash = ((hash << 5) - hash) + ua.charCodeAt(i);
    hash |= 0;
  }
  return `ua-${Math.abs(hash).toString(16)}`;
}

function _truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) + "..." : s;
}

export const newDeviceDetector = new NewDeviceDetector();
