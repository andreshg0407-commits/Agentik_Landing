/**
 * lib/security/kms/kms-health.ts
 *
 * AGENTIK-SECURITY-KMS-01
 * KMS Health Monitor
 *
 * Server-only. Evaluates the operational health of the KMS subsystem.
 *
 * Health states:
 *   HEALTHY     — default provider operational, keys accessible
 *   DEGRADED    — some providers unavailable, fallback active
 *   UNAVAILABLE — no provider can serve requests
 *
 * Never throws. Returns UNAVAILABLE on any evaluation error.
 */

import "server-only";

import type { KmsHealthStatus } from "./kms-types";
import type { KmsProviderHealthResult } from "./kms-provider";
import { listRegisteredProviders, getProvider } from "./provider-registry";
import { getRegistryStats } from "./key-registry";

// ── KMS Health Report ─────────────────────────────────────────────────────────

export interface KmsHealthReport {
  /** Overall health status of the KMS subsystem. */
  status:              KmsHealthStatus;
  /** Per-provider health results. */
  providers:           KmsProviderHealthResult[];
  /** Summary of key registry state. */
  keyRegistry:         { total: number; byStatus: Record<string, number> };
  /** Number of providers registered. */
  totalProviders:      number;
  /** Number of healthy providers. */
  healthyProviders:    number;
  /** ISO 8601 timestamp of health check. */
  checkedAt:           string;
  /** Reasons for degraded/unavailable state. */
  reasons:             string[];
}

// ── Thresholds ────────────────────────────────────────────────────────────────

const DEGRADED_PROVIDER_THRESHOLD = 0.5; // < 50% providers healthy → DEGRADED

// ── evaluateKmsHealth ─────────────────────────────────────────────────────────

/**
 * evaluateKmsHealth — run health checks across all registered KMS providers.
 *
 * Never throws. Returns UNAVAILABLE on any evaluation error.
 */
export async function evaluateKmsHealth(): Promise<KmsHealthReport> {
  const checkedAt = new Date().toISOString();
  const reasons:   string[] = [];

  try {
    const providerTypes  = listRegisteredProviders();
    const providerChecks = await Promise.allSettled(
      providerTypes.map(async (type) => {
        const providerResult = getProvider(type);
        if (!providerResult.ok) {
          return {
            status:    "UNAVAILABLE" as const,
            provider:  type,
            latencyMs: 0,
            details:   `provider_not_accessible:${type}`,
            checkedAt,
          } satisfies KmsProviderHealthResult;
        }
        return providerResult.value.healthCheck();
      }),
    );

    const results: KmsProviderHealthResult[] = providerChecks.map((r, i) =>
      r.status === "fulfilled"
        ? r.value
        : {
            status:    "UNAVAILABLE" as const,
            provider:  providerTypes[i],
            latencyMs: 0,
            details:   `health_check_threw:${r.reason}`,
            checkedAt,
          },
    );

    const healthyCount = results.filter(r => r.status === "HEALTHY").length;
    const totalCount   = results.length;

    // Registry stats
    const keyRegistry = getRegistryStats();

    // Determine overall status
    let status: KmsHealthStatus;

    if (totalCount === 0) {
      status = "UNAVAILABLE";
      reasons.push("no_providers_registered");
    } else if (healthyCount === 0) {
      status = "UNAVAILABLE";
      reasons.push("all_providers_unavailable");
    } else if (healthyCount / totalCount < DEGRADED_PROVIDER_THRESHOLD) {
      status = "DEGRADED";
      reasons.push(`only_${healthyCount}_of_${totalCount}_providers_healthy`);
    } else {
      status = "HEALTHY";
      reasons.push(`${healthyCount}_of_${totalCount}_providers_healthy`);
    }

    // Check LOCAL provider specifically (it is the required fallback)
    const localHealth = results.find(r => r.provider === "LOCAL");
    if (!localHealth || localHealth.status !== "HEALTHY") {
      if (status === "HEALTHY") {
        status = "DEGRADED";
        reasons.push("local_fallback_provider_unavailable");
      }
    }

    return {
      status,
      providers:        results,
      keyRegistry,
      totalProviders:   totalCount,
      healthyProviders: healthyCount,
      checkedAt,
      reasons,
    };

  } catch {
    return {
      status:           "UNAVAILABLE",
      providers:        [],
      keyRegistry:      { total: 0, byStatus: {} },
      totalProviders:   0,
      healthyProviders: 0,
      checkedAt,
      reasons:          ["health_evaluation_error"],
    };
  }
}

// ── isKmsOperational ─────────────────────────────────────────────────────────

/**
 * isKmsOperational — quick boolean check for KMS operational state.
 */
export async function isKmsOperational(): Promise<boolean> {
  const report = await evaluateKmsHealth();
  return report.status !== "UNAVAILABLE";
}
