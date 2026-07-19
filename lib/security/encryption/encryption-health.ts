/**
 * lib/security/encryption/encryption-health.ts
 *
 * AGENTIK-SECURITY-ENCRYPTION-01
 * Encryption Foundation — Health Monitor
 *
 * Validates that the encryption layer is operational.
 * Runs: engine, provider, algorithms, key references.
 * No external monitoring. No SIEM. Pure local checks.
 *
 * Fail-safe: health checks never throw.
 *
 * IMPORTANT: Backend-only. Never import in client components.
 */

import "server-only";

import { encryptData, decryptData, validatePayloadStructure } from "./encryption-engine";
import { getActiveKeyReference, getKeyRegistrySummary } from "./key-management";
import { ENCRYPTION_REGISTRY } from "./encryption-registry";
import { CURRENT_ENCRYPTION_ALGORITHM } from "./encryption-types";

// ── Health Types ──────────────────────────────────────────────────────────────

export type EncryptionHealthStatus = "HEALTHY" | "DEGRADED" | "UNAVAILABLE";

export interface EncryptionHealthCheckResult {
  name:       string;
  status:     EncryptionHealthStatus;
  durationMs: number;
  detail?:    string;
}

export interface EncryptionHealthReport {
  status:          EncryptionHealthStatus;
  checks:          EncryptionHealthCheckResult[];
  keySummary:      ReturnType<typeof getKeyRegistrySummary>;
  registryTotal:   number;
  checkedAt:       string;
  durationMs:      number;
}

// ── Health Checks ─────────────────────────────────────────────────────────────

/** Check that the active key reference exists and points to an env var. */
function checkActiveKeyReference(): EncryptionHealthCheckResult {
  const start = Date.now();
  try {
    const ref = getActiveKeyReference();
    if (!ref) {
      return {
        name:       "active_key_reference",
        status:     "UNAVAILABLE",
        durationMs: Date.now() - start,
        detail:     "No active key version in KEY_VERSION_REGISTRY",
      };
    }
    if (!ref.envVarName) {
      return {
        name:       "active_key_reference",
        status:     "UNAVAILABLE",
        durationMs: Date.now() - start,
        detail:     "Active key reference has no envVarName",
      };
    }
    const envValue = process.env[ref.envVarName];
    if (!envValue || envValue.trim().length === 0) {
      return {
        name:       "active_key_reference",
        status:     "UNAVAILABLE",
        durationMs: Date.now() - start,
        detail:     `Env var ${ref.envVarName} is not set`,
      };
    }
    return {
      name:       "active_key_reference",
      status:     "HEALTHY",
      durationMs: Date.now() - start,
      detail:     `Key ${ref.keyId} env var present (length: ${envValue.length})`,
    };
  } catch (e: any) {
    return {
      name:       "active_key_reference",
      status:     "UNAVAILABLE",
      durationMs: Date.now() - start,
      detail:     e?.message ?? "unknown",
    };
  }
}

/** Check that the algorithm constant is set. */
function checkAlgorithmSupport(): EncryptionHealthCheckResult {
  const start = Date.now();
  try {
    if (CURRENT_ENCRYPTION_ALGORITHM !== "AES_256_GCM") {
      return {
        name:       "algorithm_support",
        status:     "UNAVAILABLE",
        durationMs: Date.now() - start,
        detail:     `Unexpected algorithm: ${CURRENT_ENCRYPTION_ALGORITHM}`,
      };
    }
    return {
      name:       "algorithm_support",
      status:     "HEALTHY",
      durationMs: Date.now() - start,
      detail:     "AES_256_GCM supported",
    };
  } catch (e: any) {
    return {
      name:       "algorithm_support",
      status:     "UNAVAILABLE",
      durationMs: Date.now() - start,
      detail:     e?.message ?? "unknown",
    };
  }
}

/** Round-trip encrypt → decrypt to verify engine is functional. */
function checkEngineRoundTrip(): EncryptionHealthCheckResult {
  const start = Date.now();
  const HEALTH_CHECK_ORG = "__health_check__";
  const HEALTH_PLAINTEXT = "agentik-encryption-health-check-" + Date.now();
  try {
    const encrypted = encryptData({
      orgSlug:   HEALTH_CHECK_ORG,
      plaintext: HEALTH_PLAINTEXT,
    });

    if (!encrypted) {
      return {
        name:       "engine_round_trip",
        status:     "UNAVAILABLE",
        durationMs: Date.now() - start,
        detail:     "encryptData returned null (key may not be set)",
      };
    }

    // Validate structure
    const validation = validatePayloadStructure(encrypted.payload);
    if (!validation.valid) {
      return {
        name:       "engine_round_trip",
        status:     "DEGRADED",
        durationMs: Date.now() - start,
        detail:     `Payload validation failed: ${validation.reason}`,
      };
    }

    // Decrypt and verify
    const decrypted = decryptData({
      payload: encrypted.payload,
      orgSlug: HEALTH_CHECK_ORG,
    });

    if (!decrypted || decrypted.plaintext !== HEALTH_PLAINTEXT) {
      return {
        name:       "engine_round_trip",
        status:     "UNAVAILABLE",
        durationMs: Date.now() - start,
        detail:     "Decrypted value does not match original plaintext",
      };
    }

    const durationMs = Date.now() - start;
    if (durationMs > 500) {
      return {
        name:       "engine_round_trip",
        status:     "DEGRADED",
        durationMs,
        detail:     `Round-trip took ${durationMs}ms (> 500ms threshold)`,
      };
    }

    return {
      name:       "engine_round_trip",
      status:     "HEALTHY",
      durationMs,
      detail:     "Encrypt → decrypt round-trip successful",
    };
  } catch (e: any) {
    return {
      name:       "engine_round_trip",
      status:     "UNAVAILABLE",
      durationMs: Date.now() - start,
      detail:     e?.message ?? "unknown",
    };
  }
}

/** Check that the registry has at least the expected entries. */
function checkRegistry(): EncryptionHealthCheckResult {
  const start = Date.now();
  try {
    if (ENCRYPTION_REGISTRY.length < 7) {
      return {
        name:       "registry",
        status:     "DEGRADED",
        durationMs: Date.now() - start,
        detail:     `Only ${ENCRYPTION_REGISTRY.length} entries in ENCRYPTION_REGISTRY (expected >= 7)`,
      };
    }
    return {
      name:       "registry",
      status:     "HEALTHY",
      durationMs: Date.now() - start,
      detail:     `${ENCRYPTION_REGISTRY.length} entries registered`,
    };
  } catch (e: any) {
    return {
      name:       "registry",
      status:     "UNAVAILABLE",
      durationMs: Date.now() - start,
      detail:     e?.message ?? "unknown",
    };
  }
}

// ── Health Monitor ────────────────────────────────────────────────────────────

/**
 * EncryptionHealthMonitor — runs all health checks and consolidates a report.
 * Never throws.
 */
export class EncryptionHealthMonitor {
  /**
   * Run all health checks and return a consolidated report.
   */
  checkEncryptionHealth(): EncryptionHealthReport {
    const start = Date.now();
    const checks: EncryptionHealthCheckResult[] = [
      checkActiveKeyReference(),
      checkAlgorithmSupport(),
      checkEngineRoundTrip(),
      checkRegistry(),
    ];

    const hasUnavailable = checks.some(c => c.status === "UNAVAILABLE");
    const hasDegraded    = checks.some(c => c.status === "DEGRADED");

    const status: EncryptionHealthStatus = hasUnavailable
      ? "UNAVAILABLE"
      : hasDegraded
        ? "DEGRADED"
        : "HEALTHY";

    return {
      status,
      checks,
      keySummary:    getKeyRegistrySummary(),
      registryTotal: ENCRYPTION_REGISTRY.length,
      checkedAt:     new Date().toISOString(),
      durationMs:    Date.now() - start,
    };
  }
}

// ── Convenience ───────────────────────────────────────────────────────────────

/** Convenience wrapper — run all health checks. Never throws. */
export function checkEncryptionHealth(): EncryptionHealthReport {
  return new EncryptionHealthMonitor().checkEncryptionHealth();
}
