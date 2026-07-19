/**
 * lib/marketing-studio/ads/ads-accounts-service.ts
 *
 * MARKETING-ADS-ACCOUNTS-01 — Ads Resource Discovery Service
 * SERVER ONLY — @server-only
 *
 * Discovers available advertising resources across Meta and TikTok
 * using Vault-First credentials. Normalizes results into a common
 * AdsPlatformResource shape. Never returns tokens or secrets.
 *
 * Discovery scope per platform:
 *
 * Meta:
 *   - Ad Accounts        (/me/adaccounts)
 *   - Facebook Pages     (/me/accounts)
 *   - Instagram Accounts (linked to pages via instagram_business_account)
 *   - Business Managers  (if externalBusinessId configured)
 *
 * TikTok:
 *   - Advertiser Accounts (/advertiser/info/)
 *   - Business Centers    (if TIKTOK_BUSINESS_ID configured)
 *
 * Google Ads: not yet implemented — interface prepared for future extension.
 *
 * Prepared for MARKETING-ADS-EXECUTION-01:
 *   Executor will read TenantAdsConfig.selectedAdAccountId (etc.) to know
 *   which platform resources to target when creating campaigns.
 */
import "server-only";

import { resolveMetaAdsCredentials, resolveTikTokAdsCredentials } from "./ads-vault";
import { getAdsAccountsConfigForPlatform, markDiscoveryRun }      from "./ads-accounts-config-service";

import type {
  AdsPlatformResource,
  AdsPlatformDiscoveryResult,
  AdsAccountsDiscoveryResult,
  AdsDiscoveryStatus,
} from "./ads-accounts-types";

// ── Shared fetch helper ────────────────────────────────────────────────────────

const TIMEOUT_MS = 8000;

async function safeFetch(
  url:     string,
  headers: Record<string, string> = {},
): Promise<unknown> {
  const controller = new AbortController();
  const timer      = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res  = await fetch(url, { method: "GET", signal: controller.signal, headers: { "Accept": "application/json", ...headers } });
    return await res.json() as unknown;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// ── Meta discovery ─────────────────────────────────────────────────────────────

const META_GRAPH = "https://graph.facebook.com/v19.0";

function metaUrl(path: string, token: string, params: Record<string, string> = {}): string {
  const u = new URL(`${META_GRAPH}${path}`);
  u.searchParams.set("access_token", token);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  return u.toString();
}

interface MetaAdAccountRow { id: string; name: string; currency?: string; account_status?: number }
interface MetaPageRow      { id: string; name: string; category?: string }
interface MetaIGRow        { id: string; name?: string; username?: string }
interface MetaListResponse<T> { data?: T[]; error?: { code?: number; message?: string } }

async function discoverMetaResources(
  orgSlug:       string,
  organizationId: string,
): Promise<AdsPlatformDiscoveryResult> {
  const discoveredAt = new Date().toISOString();

  const creds = await resolveMetaAdsCredentials(orgSlug);

  if (creds.source === "NOT_CONFIGURED" || !creds.accessToken) {
    return {
      platform: "meta", status: "not_configured", resources: [], discoveredAt,
      message: "Credenciales Meta Ads no configuradas.",
    };
  }

  const token = creds.accessToken;
  const resources: AdsPlatformResource[] = [];

  // Load current config to mark selected resources
  const config = await getAdsAccountsConfigForPlatform(organizationId, "meta");

  // ── Ad Accounts ────────────────────────────────────────────────────────────
  const adAccountsData = await safeFetch(
    metaUrl("/me/adaccounts", token, { fields: "id,name,currency,account_status", limit: "20" }),
  ) as MetaListResponse<MetaAdAccountRow> | null;

  if (adAccountsData?.error) {
    const code = adAccountsData.error.code ?? 0;
    const status: AdsDiscoveryStatus = code === 190 || code === 200
      ? "insufficient_permissions"
      : "error";
    return { platform: "meta", status, resources: [], discoveredAt,
      message: `Error API Meta (código ${code}).` };
  }

  for (const a of adAccountsData?.data ?? []) {
    resources.push({
      id:          `meta-ad-account-${a.id}`,
      externalId:  a.id,
      platform:    "meta",
      type:        "ad_account",
      displayName: a.name,
      status:      a.account_status === 1 ? "active" : `status_${a.account_status ?? "unknown"}`,
      selected:    config?.selectedAdAccountId === a.id,
      metadata:    { currency: a.currency ?? "" },
    });
  }

  // ── Facebook Pages ─────────────────────────────────────────────────────────
  const pagesData = await safeFetch(
    metaUrl("/me/accounts", token, { fields: "id,name,category", limit: "20" }),
  ) as MetaListResponse<MetaPageRow> | null;

  for (const p of pagesData?.data ?? []) {
    resources.push({
      id:          `meta-page-${p.id}`,
      externalId:  p.id,
      platform:    "meta",
      type:        "facebook_page",
      displayName: p.name,
      status:      "active",
      selected:    config?.selectedPageId === p.id,
      metadata:    { category: p.category ?? "" },
    });

    // ── Instagram linked to this page ──────────────────────────────────────
    const igData = await safeFetch(
      metaUrl(`/${p.id}`, token, { fields: "instagram_business_account{id,name,username}" }),
    ) as ({ instagram_business_account?: MetaIGRow } | null);

    const ig = igData?.instagram_business_account;
    if (ig?.id) {
      resources.push({
        id:          `meta-ig-${ig.id}`,
        externalId:  ig.id,
        platform:    "meta",
        type:        "instagram_account",
        displayName: ig.name ?? ig.username ?? ig.id,
        status:      "active",
        selected:    config?.selectedInstagramAccountId === ig.id,
        metadata:    { username: ig.username ?? "" },
      });
    }
  }

  await markDiscoveryRun(organizationId, "meta");

  const status: AdsDiscoveryStatus = resources.length > 0 ? "ready" : "empty";
  const message = resources.length === 0
    ? "No se encontraron recursos con las credenciales actuales."
    : undefined;

  return { platform: "meta", status, resources, discoveredAt, message };
}

// ── TikTok discovery ───────────────────────────────────────────────────────────

const TIKTOK_API = "https://business-api.tiktok.com/open_api/v1.3";

interface TikTokAdvertiserRow { advertiser_id: string; advertiser_name: string; currency?: string; status?: string }
interface TikTokApiResponse<T = unknown> { code?: number; message?: string; data?: T }

async function discoverTikTokResources(
  orgSlug:       string,
  organizationId: string,
): Promise<AdsPlatformDiscoveryResult> {
  const discoveredAt = new Date().toISOString();

  const creds = await resolveTikTokAdsCredentials(orgSlug);

  if (creds.source === "NOT_CONFIGURED" || !creds.accessToken || !creds.advertiserId) {
    return {
      platform: "tiktok", status: "not_configured", resources: [], discoveredAt,
      message: "Credenciales TikTok Ads no configuradas.",
    };
  }

  const { accessToken: token, advertiserId } = creds;
  const resources: AdsPlatformResource[] = [];

  // Load current config to mark selected resources
  const config = await getAdsAccountsConfigForPlatform(organizationId, "tiktok");

  // ── Advertiser accounts ────────────────────────────────────────────────────
  const u = new URL(`${TIKTOK_API}/advertiser/info/`);
  u.searchParams.set("advertiser_ids", JSON.stringify([advertiserId]));

  const adData = await safeFetch(u.toString(), { "Access-Token": token }) as
    TikTokApiResponse<{ list?: TikTokAdvertiserRow[] }> | null;

  if (adData && adData.code !== 0) {
    const status: AdsDiscoveryStatus = adData.code === 40105 || adData.code === 40001
      ? "insufficient_permissions"
      : "error";
    return { platform: "tiktok", status, resources: [], discoveredAt,
      message: `Error API TikTok (código ${adData.code ?? "?"}).` };
  }

  for (const a of adData?.data?.list ?? []) {
    resources.push({
      id:          `tiktok-advertiser-${a.advertiser_id}`,
      externalId:  a.advertiser_id,
      platform:    "tiktok",
      type:        "advertiser",
      displayName: a.advertiser_name,
      status:      a.status === "STATUS_ENABLE" ? "active" : (a.status ?? "unknown").toLowerCase(),
      selected:    config?.selectedAdvertiserId === a.advertiser_id,
      metadata:    { currency: a.currency ?? "" },
    });
  }

  await markDiscoveryRun(organizationId, "tiktok");

  const status: AdsDiscoveryStatus = resources.length > 0 ? "ready" : "empty";
  const message = resources.length === 0
    ? "No se encontraron recursos con las credenciales actuales."
    : undefined;

  return { platform: "tiktok", status, resources, discoveredAt, message };
}

// ── Aggregator ────────────────────────────────────────────────────────────────

/**
 * Discover all available advertising resources for a tenant.
 *
 * Runs Meta + TikTok discovery in parallel.
 * Never returns tokens or encrypted values.
 * Never throws — always returns a structured result.
 *
 * @param orgSlug        — passed to Vault resolver (SecretProvider uses orgSlug).
 * @param organizationId — Prisma foreign key for TenantAdsConfig.
 */
export async function discoverAdsAccounts(
  orgSlug:        string,
  organizationId: string,
): Promise<AdsAccountsDiscoveryResult> {
  const discoveredAt = new Date().toISOString();

  const [metaResult, tiktokResult] = await Promise.allSettled([
    discoverMetaResources(orgSlug, organizationId),
    discoverTikTokResources(orgSlug, organizationId),
  ]);

  const platforms: AdsPlatformDiscoveryResult[] = [
    metaResult.status   === "fulfilled" ? metaResult.value   : {
      platform: "meta",   status: "error" as const, resources: [], discoveredAt,
      message: "Error inesperado al descubrir recursos Meta.",
    },
    tiktokResult.status === "fulfilled" ? tiktokResult.value : {
      platform: "tiktok", status: "error" as const, resources: [], discoveredAt,
      message: "Error inesperado al descubrir recursos TikTok.",
    },
  ];

  return { platforms, discoveredAt };
}
