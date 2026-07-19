/**
 * lib/marketing-studio/execution/execution-health.ts
 *
 * MS-13 — Execution Runtime: Destination health engine
 *
 * computeDestinationHealthSnapshot() — derives health from job stats + auth state
 * recordDestinationHealthSnapshot()  — persists snapshot to DB
 * getLatestDestinationHealth()       — loads latest per-destination snapshots
 *
 * SERVER ONLY.
 */

import {
  countJobsByStatus,
  persistDestinationHealthSnapshot,
  getLatestHealthPerDestination,
} from "./execution-repository";
import {
  getIntegrationConnection,
} from "@/lib/integrations/integration-repository";
import type { DestinationHealthSnapshotDTO } from "./execution-types";
import { EXECUTION_HEALTH_LEVEL, EXECUTION_DESTINATION } from "./execution-types";
import { EXECUTION_JOB_STATUS } from "./execution-types";
import { auditExecution } from "./execution-audit";

// ── Destinations that map to integration connections ──────────────────────────

const CONNECTION_DESTINATIONS = [
  EXECUTION_DESTINATION.SHOPIFY,
  EXECUTION_DESTINATION.WHATSAPP,
] as const;

type HealthComputeInput = {
  failedJobCount:  number;
  pendingJobCount: number;
  staleCount:      number;
  webhookBacklog:  number;
  isAuthValid:     boolean;
};

function deriveHealthLevel(input: HealthComputeInput): string {
  if (!input.isAuthValid)         return EXECUTION_HEALTH_LEVEL.OFFLINE;
  if (input.failedJobCount >= 5)  return EXECUTION_HEALTH_LEVEL.BLOCKED;
  if (input.failedJobCount >= 2)  return EXECUTION_HEALTH_LEVEL.DEGRADED;
  if (input.staleCount > 10)      return EXECUTION_HEALTH_LEVEL.DEGRADED;
  if (input.webhookBacklog > 50)  return EXECUTION_HEALTH_LEVEL.DEGRADED;
  return EXECUTION_HEALTH_LEVEL.HEALTHY;
}

function deriveHealthDetail(level: string, input: HealthComputeInput): string | undefined {
  if (level === EXECUTION_HEALTH_LEVEL.OFFLINE)  return "Auth inválida — reconectar integración";
  if (level === EXECUTION_HEALTH_LEVEL.BLOCKED)  return `${input.failedJobCount} jobs fallidos acumulados`;
  if (level === EXECUTION_HEALTH_LEVEL.DEGRADED) {
    if (input.failedJobCount > 0) return `${input.failedJobCount} jobs fallidos`;
    if (input.staleCount > 0)     return `${input.staleCount} publicaciones desactualizadas`;
    return `${input.webhookBacklog} webhooks pendientes`;
  }
  return undefined;
}

// ── Main functions ────────────────────────────────────────────────────────────

/**
 * Compute a health snapshot for one destination without persisting it.
 */
export async function computeDestinationHealthSnapshot(
  organizationId:  string,
  destination:     string,
  webhookBacklog?: number,
): Promise<Omit<DestinationHealthSnapshotDTO, "id" | "snapshotAt">> {
  // Job stats
  const statusCounts = await countJobsByStatus(organizationId, destination);
  const failedJobCount  = statusCounts[EXECUTION_JOB_STATUS.FAILED]  ?? 0;
  const pendingJobCount = statusCounts[EXECUTION_JOB_STATUS.PENDING]  ?? 0;

  // Auth check for connection-backed destinations
  let isAuthValid = true;
  if ((CONNECTION_DESTINATIONS as readonly string[]).includes(destination)) {
    try {
      const conn = await getIntegrationConnection(
        organizationId,
        destination as "shopify" | "whatsapp",
      );
      isAuthValid = conn !== null && conn.status === "connected" && conn.health !== "critical";
    } catch {
      isAuthValid = false;
    }
  }

  const input: HealthComputeInput = {
    failedJobCount,
    pendingJobCount,
    staleCount:     0,    // could be enriched from ProductSyncState if needed
    webhookBacklog: webhookBacklog ?? 0,
    isAuthValid,
  };

  const healthLevel = deriveHealthLevel(input);
  const detail      = deriveHealthDetail(healthLevel, input);

  return {
    organizationId,
    destination,
    healthLevel,
    failedJobCount,
    pendingJobCount,
    staleCount:      input.staleCount,
    webhookBacklog:  input.webhookBacklog,
    isAuthValid,
    detail:          detail ?? null,
  };
}

/**
 * Compute + persist health snapshot for a destination.
 */
export async function recordDestinationHealthSnapshot(
  organizationId:  string,
  destination:     string,
  webhookBacklog?: number,
): Promise<DestinationHealthSnapshotDTO> {
  const computed = await computeDestinationHealthSnapshot(organizationId, destination, webhookBacklog);
  const snapshot = await persistDestinationHealthSnapshot({
    ...computed,
    detail: computed.detail ?? undefined,
  });

  if (snapshot.healthLevel === EXECUTION_HEALTH_LEVEL.BLOCKED ||
      snapshot.healthLevel === EXECUTION_HEALTH_LEVEL.DEGRADED) {
    auditExecution({
      ts:             new Date().toISOString(),
      event:          "health_degraded",
      organizationId,
      destination,
      detail:         snapshot.detail ?? undefined,
    });
  }

  return snapshot;
}

/**
 * Record health snapshots for all destinations and return them.
 */
export async function recordAllDestinationHealth(
  organizationId: string,
  webhookBacklog?: number,
): Promise<DestinationHealthSnapshotDTO[]> {
  const destinations = Object.values(EXECUTION_DESTINATION).filter(
    d => d !== EXECUTION_DESTINATION.INTERNAL,
  );
  const snapshots = await Promise.all(
    destinations.map(dest =>
      recordDestinationHealthSnapshot(organizationId, dest, webhookBacklog),
    ),
  );
  return snapshots;
}

/**
 * Load latest persisted snapshot per destination (no computation).
 */
export async function getLatestDestinationHealth(
  organizationId: string,
): Promise<DestinationHealthSnapshotDTO[]> {
  return getLatestHealthPerDestination(organizationId);
}
