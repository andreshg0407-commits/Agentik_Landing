/**
 * dian-observation-loader.ts
 *
 * AGENTIK-DIAN-OBSERVATIONS-01
 * DIAN Integration Layer — Fiscal Observation Data Loader
 *
 * Fetches pre-loaded data from Prisma and assembles FiscalObservationInput[]
 * for the pure fiscal observation engine (dian-observation-engine.ts).
 *
 * This is the ONLY file in the observation layer that touches Prisma.
 * The engine itself is pure — zero side effects, fully testable.
 *
 * Loader responsibilities:
 *   1. Load TenantDianIntegration(s) — cert metadata, env, status
 *   2. Load DianFiscalMemory from Integration.metaJson
 *   3. Assemble FiscalObservationInput per (org, operation, environment)
 *
 * Note: SyncJob history is NOT loaded here — the fiscal memory ring buffer
 * (recentOutcomes in DianFiscalMemoryEntry) contains the pre-computed signal
 * data needed for all pattern detectors, avoiding redundant Prisma queries.
 *
 * IMPORTANT: Backend-only. Never import in client components.
 */

import { prisma }                       from "@/lib/prisma";
import { loadTenantDianIntegration }    from "../tenant/tenant-loader";
import { parseFiscalMemory }            from "../sync/dian-sync-fiscal-memory";
import type { FiscalObservationInput }  from "./dian-observation-types";
import type { DianSyncOperation }       from "../sync/dian-sync-types";
import type { DianEnvironment }         from "../types/dian-types";

// ── Single org loader ─────────────────────────────────────────────────────────

/**
 * Load FiscalObservationInput for a single organization.
 *
 * Returns null if:
 *   - No DIAN integration exists for the org
 *   - Integration is not configured for the requested environment
 */
export async function loadFiscalObservationInput(
  organizationId: string,
  operation:      DianSyncOperation,
  environment:    DianEnvironment,
): Promise<FiscalObservationInput | null> {
  const integration = await loadTenantDianIntegration(organizationId);
  if (!integration || integration.environment !== environment) return null;

  // Load metaJson for fiscal memory
  const row = await prisma.integration.findFirst({
    where:  {
      organizationId,
      provider:  "DIAN" as never,
      deletedAt: null,
    },
    select: { id: true, metaJson: true },
  });
  if (!row) return null;

  const memory       = parseFiscalMemory(row.metaJson);
  const fiscalMemory = memory.fiscalSync[operation]?.[environment] ?? null;

  // Extract cert expiry from active certificate (if available)
  const activeCert = integration.certificates.find(
    c => c.isActive && c.environment === environment,
  );

  return {
    organizationId,
    integrationId:     row.id,
    environment,
    operation,
    fiscalMemory,
    integrationStatus: integration.status,
    certExpiresAt:     activeCert?.expiresAt?.toString() ?? undefined,
  };
}

// ── Multi-org loader ──────────────────────────────────────────────────────────

/**
 * Load FiscalObservationInput for a group of organizations.
 * Returns only those for which a DIAN integration is configured.
 *
 * Per-org failures are isolated — one bad org does not abort others.
 *
 * Used for multi-tenant observability (certificate expiry monitoring,
 * sync health checks, escalation routing).
 */
export async function loadFiscalObservationInputsForGroup(
  organizationIds: string[],
  operation:       DianSyncOperation,
  environment:     DianEnvironment,
): Promise<FiscalObservationInput[]> {
  if (organizationIds.length === 0) return [];

  // Batch load Integration rows (config + metaJson) for all orgs
  const rows = await prisma.integration.findMany({
    where: {
      organizationId: { in: organizationIds },
      provider:        "DIAN" as never,
      deletedAt:       null,
    },
    select: {
      id:             true,
      organizationId: true,
      status:         true,
      configJson:     true,
      metaJson:       true,
    },
  });

  const results: FiscalObservationInput[] = [];

  for (const row of rows) {
    try {
      const memory       = parseFiscalMemory(row.metaJson);
      const fiscalMemory = memory.fiscalSync[operation]?.[environment] ?? null;

      // Parse environment from configJson
      const configEnv = (row.configJson as Record<string, unknown> | null)?.["environment"];
      if (configEnv !== environment) continue; // skip orgs configured for a different env

      const integrationStatus = resolveStatus(row.status);

      results.push({
        organizationId:    row.organizationId,
        integrationId:     row.id,
        environment,
        operation,
        fiscalMemory,
        integrationStatus,
        certExpiresAt:     undefined, // cert expiry from metaJson if populated
      });
    } catch {
      // Per-org failure isolation — skip this org, continue with others
    }
  }

  return results;
}

// ── Private helpers ───────────────────────────────────────────────────────────

function resolveStatus(
  dbStatus: string,
): FiscalObservationInput["integrationStatus"] {
  if (dbStatus === "ERROR")        return "error";
  if (dbStatus === "CONNECTED")    return "ready";
  if (dbStatus === "DISCONNECTED") return "not_configured";
  return "not_configured";
}
