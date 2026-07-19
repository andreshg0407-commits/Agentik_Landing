/**
 * lib/marketing-studio/ads/connectors/index.ts
 *
 * MARKETING-ADS-CONNECTORS-01 — Server-only barrel for Ads connectors.
 * SERVER ONLY — @server-only
 *
 * Import only from server-side code (RSC, API routes, server actions).
 * Never import in client components.
 */
import "server-only";

export { runMetaAdsDiagnostic, getMetaAdStatus, getMetaAdInsights }     from "./meta-ads-connector";
export { runTikTokAdsDiagnostic, getTikTokAdStatus, getTikTokAdInsights } from "./tiktok-ads-connector";
export type {
  AdsPlatform,
  AdsConnectionStatus,
  AdsAccountSummary,
  AdsPermissionSummary,
  AdsConnectorDiagnostic,
  AdsConnectorResult,
} from "./ads-connector-types";
