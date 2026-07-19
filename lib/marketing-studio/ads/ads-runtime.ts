/**
 * lib/marketing-studio/ads/ads-runtime.ts
 *
 * MARKETING-ADS-01 — Runtime derivation for Anuncios module
 * MARKETING-ADS-CONNECTORS-01 — Added connectivity diagnostic
 * SERVER ONLY — @server-only
 *
 * Derives AdsRuntimeState from existing Prisma records + platform connectivity.
 * No new Prisma models required — placeholder runtime returns empty state.
 *
 * Future: query DistributionPipeline or a dedicated Ad model once created.
 */
import "server-only";

import type { AdsRuntimeState }  from "./ads-types";
import { getAdsConnectivityStatus } from "./ads-connectivity-service";
import { getAdsAccountsConfig }     from "./ads-accounts-config-service";

export async function buildAdsRuntime(
  organizationId: string,
): Promise<AdsRuntimeState> {
  // PLACEHOLDER — no Ad Prisma model yet.
  // Future: query existing records and derive state.

  // Run connectivity check and config load in parallel — both non-blocking.
  const [connectivity, accountsConfig] = await Promise.all([
    getAdsConnectivityStatus(organizationId).catch(() => null),
    getAdsAccountsConfig(organizationId).catch(() => null),
  ]);

  return {
    ads:    [],
    health: {
      level:       "empty",
      activos:     0,
      revision:    0,
      finalizados: 0,
    },
    connectivity,
    accountsConfig,
  };
}
