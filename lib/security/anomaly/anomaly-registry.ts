/**
 * lib/security/anomaly/anomaly-registry.ts
 *
 * AGENTIK-SECURITY-ANOMALY-DETECTION-01
 * Detector Registry — Manages All Registered Anomaly Detectors
 *
 * No server-only. No Prisma. In-memory registry.
 */

import type { AnomalyDetector } from "./anomaly-detector";
import type { AnomalyType, AnomalyResult, AnomalyDetectorMetadata } from "./anomaly-types";

// ── AnomalyDetectorRegistry ───────────────────────────────────────────────────

class AnomalyDetectorRegistry {
  private readonly _detectors = new Map<string, AnomalyDetector>();

  /**
   * registerDetector — add a detector to the registry.
   * Overwrites if the same ID is registered again.
   */
  registerDetector(detector: AnomalyDetector): void {
    this._detectors.set(detector.id, detector);
  }

  /**
   * getDetector — look up a detector by ID.
   * Returns undefined if not found (never throws).
   */
  getDetector(id: string): AnomalyDetector | undefined {
    return this._detectors.get(id);
  }

  /**
   * listDetectors — return all registered detectors.
   */
  listDetectors(): AnomalyDetector[] {
    return Array.from(this._detectors.values());
  }

  /**
   * resolveDetector — look up a detector, wrapped in AnomalyResult.
   * Fail-closed: returns error if not found.
   */
  resolveDetector(id: string): AnomalyResult<AnomalyDetector> {
    const detector = this._detectors.get(id);
    if (!detector) {
      return { ok: false, error: `detector_not_found:${id}`, severity: "HIGH" };
    }
    return { ok: true, value: detector };
  }

  /**
   * getDetectorsForType — find all detectors that handle a given AnomalyType.
   */
  getDetectorsForType(type: AnomalyType): AnomalyDetector[] {
    return this.listDetectors().filter(d => d.supports(type));
  }

  /**
   * listMetadata — return metadata for all registered detectors.
   */
  listMetadata(): AnomalyDetectorMetadata[] {
    return this.listDetectors().map(d => d.getMetadata());
  }

  /**
   * getEnabledDetectors — return only detectors that report enabled = true.
   */
  getEnabledDetectors(): AnomalyDetector[] {
    return this.listDetectors().filter(d => d.getMetadata().enabled);
  }

  /**
   * size — number of registered detectors.
   */
  size(): number {
    return this._detectors.size;
  }

  /**
   * clear — remove all detectors (testing only).
   */
  clear(): void {
    this._detectors.clear();
  }
}

// ── Singleton ─────────────────────────────────────────────────────────────────

export const anomalyRegistry = new AnomalyDetectorRegistry();
export { AnomalyDetectorRegistry };
