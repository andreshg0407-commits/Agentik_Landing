/**
 * lib/marketing-studio/ads/ads-connectivity-service.ts
 *
 * MARKETING-ADS-CONNECTORS-01 — Ads Connectivity Aggregator
 * SERVER ONLY — @server-only
 *
 * Responsibility:
 *   - Run all platform connectors in parallel.
 *   - Aggregate results into a single AdsConnectivityStatus.
 *   - Surfaces overall health (all_connected | partial | none_configured | degraded).
 *   - Never throws — always returns a safe result even if all connectors fail.
 *
 * Current platforms: meta, tiktok.
 * Planned: google (MARKETING-ADS-CONNECTORS-02).
 */
import "server-only";

import { runMetaAdsDiagnostic }   from "./connectors/meta-ads-connector";
import { runTikTokAdsDiagnostic } from "./connectors/tiktok-ads-connector";
import type { AdsConnectorDiagnostic } from "./connectors/ads-connector-types";
import type { AdsConnectivityHealth, AdsConnectivityStatus } from "./ads-types";

export type { AdsConnectivityHealth, AdsConnectivityStatus };

// ── Aggregator ────────────────────────────────────────────────────────────────

/**
 * Runs all ads platform connectors in parallel and aggregates results.
 * Safe to call from RSC — never throws, returns stale data on error.
 *
 * @param organizationId — used for future Vault tenant lookup per connector.
 */
export async function getAdsConnectivityStatus(
  organizationId: string,
): Promise<AdsConnectivityStatus> {
  const checkedAt = new Date().toISOString();

  // Run all connectors in parallel — network-bound, safe to fire together.
  const [metaResult, tiktokResult] = await Promise.allSettled([
    runMetaAdsDiagnostic(organizationId),
    runTikTokAdsDiagnostic(organizationId),
  ]);

  const platforms: AdsConnectorDiagnostic[] = [];

  if (metaResult.status === "fulfilled") {
    platforms.push(metaResult.value.diagnostic);
  } else {
    platforms.push({
      platform:    "meta",
      status:      "api_error",
      accounts:    [],
      permissions: [],
      warnings:    [],
      errors:      ["Error inesperado al verificar la conexión con Meta."],
      checkedAt,
    });
  }

  if (tiktokResult.status === "fulfilled") {
    platforms.push(tiktokResult.value.diagnostic);
  } else {
    platforms.push({
      platform:    "tiktok",
      status:      "api_error",
      accounts:    [],
      permissions: [],
      warnings:    [],
      errors:      ["Error inesperado al verificar la conexión con TikTok."],
      checkedAt,
    });
  }

  // ── Derive health ──────────────────────────────────────────────────────────
  const connected = platforms.filter(p => p.status === "connected").map(p => p.platform);
  const attention = platforms
    .filter(p => p.status !== "connected" && p.status !== "not_configured")
    .map(p => p.platform);
  const notConfigured = platforms.filter(p => p.status === "not_configured");

  let health: AdsConnectivityHealth;

  if (connected.length === platforms.length) {
    health = "all_connected";
  } else if (connected.length > 0) {
    health = "partial";
  } else if (notConfigured.length === platforms.length) {
    health = "none_configured";
  } else {
    health = "degraded";
  }

  return { health, platforms, checkedAt, connected, attention };
}
