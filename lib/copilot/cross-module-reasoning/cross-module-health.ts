/**
 * lib/copilot/cross-module-reasoning/cross-module-health.ts
 *
 * AGENTIK-INTELLIGENCE-CROSS-MODULE-REASONING-01
 * Health check for the Cross-Module Reasoning layer.
 * Server-side only (uses Prisma indirectly via repository).
 */

import { InMemoryCrossModuleReasoningRepository } from "./reasoning-repository";

// ── Health types ──────────────────────────────────────────────────────────────

export type CrossModuleHealthStatus =
  | "HEALTHY"
  | "DEGRADED"
  | "UNAVAILABLE";

export interface CrossModuleHealthCheck {
  name:    string;
  status:  CrossModuleHealthStatus;
  message: string;
  latency: number; // ms
}

export interface CrossModuleHealthReport {
  status:     CrossModuleHealthStatus;
  checks:     CrossModuleHealthCheck[];
  version:    string;
  checkedAt:  string;
}

// ── Check functions ───────────────────────────────────────────────────────────

async function checkEngineAvailability(): Promise<CrossModuleHealthCheck> {
  const start = Date.now();
  try {
    // Engine is pure domain logic — always available if importable
    const { runCrossModuleReasoning } = await import("./cross-module-engine");
    const ok = typeof runCrossModuleReasoning === "function";
    return {
      name:    "engine",
      status:  ok ? "HEALTHY" : "UNAVAILABLE",
      message: ok ? "Cross-module engine available" : "Engine function not found",
      latency: Date.now() - start,
    };
  } catch (err) {
    return {
      name:    "engine",
      status:  "UNAVAILABLE",
      message: `Engine import failed: ${String(err)}`,
      latency: Date.now() - start,
    };
  }
}

async function checkRepositoryAvailability(): Promise<CrossModuleHealthCheck> {
  const start = Date.now();
  try {
    const repo = new InMemoryCrossModuleReasoningRepository();
    const count = await repo.countResults("__health_check__");
    return {
      name:    "repository",
      status:  "HEALTHY",
      message: `In-memory repository operational (count=${count})`,
      latency: Date.now() - start,
    };
  } catch (err) {
    return {
      name:    "repository",
      status:  "DEGRADED",
      message: `Repository check failed: ${String(err)}`,
      latency: Date.now() - start,
    };
  }
}

async function checkTypeSystemIntegrity(): Promise<CrossModuleHealthCheck> {
  const start = Date.now();
  try {
    const { REASONING_SOURCE_DOMAINS, REASONING_CONFIDENCE_LEVELS } = await import("./cross-module-types");
    const ok = REASONING_SOURCE_DOMAINS.length > 0 && REASONING_CONFIDENCE_LEVELS.length > 0;
    return {
      name:    "type-system",
      status:  ok ? "HEALTHY" : "DEGRADED",
      message: ok
        ? `Type system OK: ${REASONING_SOURCE_DOMAINS.length} domains, ${REASONING_CONFIDENCE_LEVELS.length} confidence levels`
        : "Type constants missing",
      latency: Date.now() - start,
    };
  } catch (err) {
    return {
      name:    "type-system",
      status:  "UNAVAILABLE",
      message: `Type system import failed: ${String(err)}`,
      latency: Date.now() - start,
    };
  }
}

// ── Main health check ─────────────────────────────────────────────────────────

export async function runCrossModuleHealthCheck(): Promise<CrossModuleHealthReport> {
  const checks = await Promise.all([
    checkEngineAvailability(),
    checkRepositoryAvailability(),
    checkTypeSystemIntegrity(),
  ]);

  const hasUnavailable = checks.some(c => c.status === "UNAVAILABLE");
  const hasDegraded    = checks.some(c => c.status === "DEGRADED");

  const status: CrossModuleHealthStatus = hasUnavailable
    ? "UNAVAILABLE"
    : hasDegraded
      ? "DEGRADED"
      : "HEALTHY";

  return {
    status,
    checks,
    version:   "AGENTIK-INTELLIGENCE-CROSS-MODULE-REASONING-01",
    checkedAt: new Date().toISOString(),
  };
}

export function isHealthy(report: CrossModuleHealthReport): boolean {
  return report.status === "HEALTHY";
}
