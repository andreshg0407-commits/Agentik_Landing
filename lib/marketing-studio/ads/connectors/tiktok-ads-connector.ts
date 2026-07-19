/**
 * lib/marketing-studio/ads/connectors/tiktok-ads-connector.ts
 *
 * MARKETING-ADS-CONNECTORS-01 — TikTok Business API Connector
 * SERVER ONLY — @server-only
 *
 * Responsibility:
 *   - Read TikTok Ads credentials from env (temporal — future: Vault tenant-scoped).
 *   - Validate access token via Business API /advertiser/info endpoint.
 *   - List advertiser accounts accessible to the token.
 *   - Validate permission scopes.
 *   - Return a safe AdsConnectorDiagnostic. Never expose the token.
 *
 * This connector does NOT create or modify any TikTok resource.
 * It is strictly a diagnostic/read-only connector.
 *
 * Required env vars (document for operators):
 *   TIKTOK_ACCESS_TOKEN   — Long-lived access token from TikTok Business API.
 *   TIKTOK_ADVERTISER_ID  — Target advertiser account ID.
 *   TIKTOK_BUSINESS_ID    — TikTok Business Center ID (optional, used for validation).
 *
 * Related existing env vars (OAuth app — DO NOT confuse):
 *   TIKTOK_CLIENT_KEY     — OAuth app client key (lib/integrations/oauth/providers/tiktok-oauth.ts)
 *   TIKTOK_CLIENT_SECRET  — OAuth app secret
 *   TIKTOK_REDIRECT_URI   — OAuth callback URI
 *
 * Recommended scopes for Ads:
 *   advertiser.read, ad.read, campaign.read, creative.read
 *
 * Business API version: v1.3
 *
 * Token auth: passed via header `Access-Token: {token}` — NOT as a query param.
 */
import "server-only";

import { resolveTikTokAdsCredentials } from "../ads-vault";

import type {
  AdsConnectorDiagnostic,
  AdsConnectorResult,
  AdsAccountSummary,
  AdsPermissionSummary,
} from "./ads-connector-types";
import type { AdsExternalIds, AdsProviderStatusPayload, AdsExternalStatus } from "../ads-sync-types";
import type { AdsAnalyticsRange, AdsAnalyticsMetric } from "../ads-analytics-types";

const TIKTOK_API_BASE = "https://business-api.tiktok.com/open_api/v1.3";

/** Scopes required for TikTok Ads management. */
const TIKTOK_ADS_REQUIRED_SCOPES = [
  "advertiser.read",
  "ad.read",
  "campaign.read",
];

/** Non-critical scopes — warn if absent but don't fail. */
const TIKTOK_ADS_RECOMMENDED_SCOPES = [
  "creative.read",
  "report.read",
];

const TIMEOUT_MS = 8000;

// ── Credential resolution ──────────────────────────────────────────────────────
// Handled by ads-vault.ts — Vault-First strategy (Vault → env[dev only] → NOT_CONFIGURED)

// ── Fetch helpers ─────────────────────────────────────────────────────────────

/**
 * Fetch with AbortController timeout. Token passed via header, never in URL.
 * Returns null on timeout/network error.
 */
async function tikTokFetch(
  path: string,
  token: string,
  params: Record<string, string> = {},
): Promise<unknown> {
  const controller = new AbortController();
  const timer      = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const url = new URL(`${TIKTOK_API_BASE}${path}`);
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, v);
    }

    const res = await fetch(url.toString(), {
      method:  "GET",
      signal:  controller.signal,
      headers: {
        "Accept":       "application/json",
        // TikTok Business API requires token in header, not query string
        "Access-Token": token,
      },
    });

    const data = await res.json() as unknown;
    return data;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// ── Token validation ──────────────────────────────────────────────────────────

interface TikTokApiResponse<T = unknown> {
  code?:    number;
  message?: string;
  data?:    T;
}

interface AdvertiserInfoData {
  list?: {
    advertiser_id:   string;
    advertiser_name: string;
    currency:        string;
    status:          string;
  }[];
}

async function validateTokenAndListAccounts(
  token:       string,
  advertiserId: string,
): Promise<{
  valid:    boolean;
  accounts: AdsAccountSummary[];
  error?:   string;
}> {
  // TikTok validates the token implicitly — a successful advertiser list means
  // the token is valid. An error code indicates the token problem.
  const data = await tikTokFetch(
    "/advertiser/info/",
    token,
    { advertiser_ids: JSON.stringify([advertiserId]) },
  ) as TikTokApiResponse<AdvertiserInfoData> | null;

  if (!data) {
    return { valid: false, accounts: [], error: "No se pudo conectar con la API de TikTok Business." };
  }

  const code = data.code ?? 0;

  if (code !== 0) {
    // TikTok error codes: 40105 = token invalid/expired, 40001 = unauthorized
    if (code === 40105) return { valid: false, accounts: [], error: "Token TikTok inválido o vencido (código 40105)." };
    if (code === 40001) return { valid: false, accounts: [], error: "Token TikTok sin autorización (código 40001)." };
    return { valid: false, accounts: [], error: `API de TikTok rechazó el token (código ${code}).` };
  }

  const list = data.data?.list ?? [];
  const accounts: AdsAccountSummary[] = list.map(a => ({
    id:       a.advertiser_id,
    name:     a.advertiser_name,
    currency: a.currency,
    status:   a.status === "STATUS_ENABLE" ? "active" : a.status.toLowerCase(),
  }));

  return { valid: true, accounts };
}

// ── Permissions / scopes ──────────────────────────────────────────────────────

interface ScopeResponse {
  code?:  number;
  data?:  { scope_list?: string[] };
}

async function checkScopes(token: string, advertiserId: string): Promise<AdsPermissionSummary[]> {
  // TikTok exposes granted scopes via the oauth/token/info endpoint
  const data = await tikTokFetch(
    "/oauth2/advertiser/get/",
    token,
    { advertiser_id: advertiserId, fields: JSON.stringify(["scope"]) },
  ) as ScopeResponse | null;

  if (!data?.data?.scope_list) return [];

  const grantedSet = new Set(data.data.scope_list);
  const allKnown   = [...TIKTOK_ADS_REQUIRED_SCOPES, ...TIKTOK_ADS_RECOMMENDED_SCOPES];

  return allKnown.map(scope => ({
    scope,
    granted: grantedSet.has(scope),
  }));
}

// ── Main diagnostic ───────────────────────────────────────────────────────────

/**
 * Runs a full read-only diagnostic against the TikTok Business API.
 * Never creates, modifies, or charges any TikTok resource.
 * Never returns the access token.
 *
 * Credentials resolved via Vault-First strategy (ads-vault.ts):
 *   1. VaultService (encrypted, org-scoped) — always tried first
 *   2. process.env                          — dev only, never in production
 *   3. NOT_CONFIGURED                       — safe fail-closed return
 *
 * @param tenantId — orgSlug of the tenant. Required.
 */
export async function runTikTokAdsDiagnostic(
  tenantId: string,
): Promise<AdsConnectorResult> {
  const checkedAt = new Date().toISOString();

  const makeDiag = (
    status: AdsConnectorDiagnostic["status"],
    overrides: Partial<AdsConnectorDiagnostic> = {},
  ): AdsConnectorResult => ({
    ok: status === "connected",
    diagnostic: {
      platform:    "tiktok",
      status,
      accounts:    [],
      permissions: [],
      warnings:    [],
      errors:      [],
      checkedAt,
      ...overrides,
    },
  });

  // ── Step 1: resolve credentials via Vault-First ────────────────────────────
  const creds = await resolveTikTokAdsCredentials(tenantId);

  if (creds.source === "NOT_CONFIGURED" && !creds.accessToken && !creds.advertiserId) {
    return makeDiag("not_configured", {
      credentialSource: "NOT_CONFIGURED",
      errors:   ["TIKTOK_ACCESS_TOKEN no está configurado."],
      warnings: ["Aprovisiona credenciales TikTok Ads en el Vault para activar esta plataforma."],
    });
  }

  if (!creds.accessToken) {
    return makeDiag("missing_credentials", {
      credentialSource: creds.source,
      errors: ["Falta TIKTOK_ACCESS_TOKEN."],
    });
  }

  if (!creds.advertiserId) {
    return makeDiag("missing_credentials", {
      credentialSource: creds.source,
      errors:   ["Falta TIKTOK_ADVERTISER_ID."],
      warnings: ["Define TIKTOK_ADVERTISER_ID para identificar la cuenta publicitaria."],
    });
  }

  const token        = creds.accessToken;
  const advertiserId = creds.advertiserId;

  // ── Step 2: validate token + list accounts ─────────────────────────────────
  const tokenCheck = await validateTokenAndListAccounts(token, advertiserId);

  if (!tokenCheck.valid) {
    return makeDiag("invalid_credentials", {
      credentialSource: creds.source,
      errors: [tokenCheck.error ?? "Token TikTok inválido o vencido."],
    });
  }

  const { accounts } = tokenCheck;
  const errors:   string[] = [];
  const warnings: string[] = [];

  if (accounts.length === 0) {
    warnings.push("No se encontraron cuentas de anunciante asociadas al token.");
  }

  const targetAccount = accounts.find(a => a.id === advertiserId);
  if (accounts.length > 0 && !targetAccount) {
    warnings.push(`La cuenta ${advertiserId} no está accesible con el token actual.`);
  }

  // ── Step 3: check permissions ──────────────────────────────────────────────
  const permissions = await checkScopes(token, advertiserId);

  const grantedScopes = new Set(permissions.filter(p => p.granted).map(p => p.scope));

  if (permissions.length === 0) {
    warnings.push("No se pudo verificar los permisos del token. Funcionalidad puede ser limitada.");
  } else {
    const missingRequired = TIKTOK_ADS_REQUIRED_SCOPES.filter(s => !grantedScopes.has(s));
    if (missingRequired.length > 0) {
      return makeDiag("insufficient_permissions", {
        credentialSource: creds.source,
        accounts,
        permissions,
        errors: [
          `Permisos insuficientes. Faltan: ${missingRequired.join(", ")}.`,
        ],
      });
    }

    const missingRecommended = TIKTOK_ADS_RECOMMENDED_SCOPES.filter(s => !grantedScopes.has(s));
    if (missingRecommended.length > 0) {
      warnings.push(`Permisos recomendados ausentes: ${missingRecommended.join(", ")}.`);
    }
  }

  if (!creds.businessId) {
    warnings.push("TIKTOK_BUSINESS_ID no configurado — algunas funciones de Business Center no estarán disponibles.");
  }

  if (creds.source === "ENV_DEV_FALLBACK") {
    warnings.push("Credenciales resueltas desde variables de entorno (dev fallback) — migra a Vault para producción.");
  }

  return makeDiag("connected", { credentialSource: creds.source, accounts, permissions, warnings, errors });
}

// ── Status query (SYNC-01) ─────────────────────────────────────────────────────

/**
 * Maps TikTok's raw status strings to a normalized AdsExternalStatus.
 *
 * TikTok campaign/adgroup/ad operation_status values:
 *   ENABLE, DISABLE, DELETE, REVIEWING, REJECTED, COMPLETED, FROZEN
 */
function normalizeTikTokStatus(raw: string): AdsExternalStatus {
  switch (raw.toUpperCase()) {
    case "ENABLE":    return "active";
    case "DISABLE":   return "paused";
    case "REVIEWING": return "in_review";
    case "REJECTED":  return "rejected";
    case "COMPLETED": return "completed";
    case "DELETE":    return "archived";
    case "FROZEN":    return "failed";
    default:          return "unknown";
  }
}

/**
 * Queries the status of a TikTok ad campaign (or adgroup/ad as available).
 *
 * Priority: campaign_id → adgroup_id → ad_id (highest level first for TikTok,
 * since campaign status best reflects delivery state).
 * Returns the most informative status found.
 *
 * Never activates, modifies, or charges any TikTok resource.
 * Never returns the access token.
 *
 * @param tenantId   — orgSlug for Vault credential resolution.
 * @param externalIds — IDs stored in AgentExecution.externalReferenceIds.
 */
export async function getTikTokAdStatus(
  tenantId:    string,
  externalIds: AdsExternalIds,
): Promise<AdsProviderStatusPayload | null> {
  const fetchedAt = new Date().toISOString();

  const creds = await resolveTikTokAdsCredentials(tenantId);
  if (!creds.accessToken || !creds.advertiserId) return null;

  const token        = creds.accessToken;
  const advertiserId = creds.advertiserId;

  const campaignId = externalIds.tiktok_campaign_id;
  const adgroupId  = externalIds.tiktok_adgroup_id;
  const adId       = externalIds.tiktok_ad_id;

  interface TikTokListResponse {
    code:    number;
    message: string;
    data?:   {
      list?: Array<{
        campaign_id?:        string;
        adgroup_id?:         string;
        ad_id?:              string;
        operation_status?:   string;
        secondary_status?:   string;
      }>;
    };
  }

  let providerStatus: string | null = null;

  // Query campaign status (primary signal)
  if (campaignId) {
    const data = await tikTokFetch("/campaign/get/", token, {
      advertiser_id: advertiserId,
      filtering:     JSON.stringify({ campaign_ids: [campaignId] }),
      fields:        JSON.stringify(["campaign_id", "operation_status", "secondary_status"]),
    }) as TikTokListResponse | null;

    const entry = data?.data?.list?.[0];
    if (data?.code === 0 && entry?.operation_status) {
      providerStatus = entry.secondary_status ?? entry.operation_status;
    }
  }

  // Fallback: adgroup status
  if (!providerStatus && adgroupId) {
    const data = await tikTokFetch("/adgroup/get/", token, {
      advertiser_id: advertiserId,
      filtering:     JSON.stringify({ adgroup_ids: [adgroupId] }),
      fields:        JSON.stringify(["adgroup_id", "operation_status", "secondary_status"]),
    }) as TikTokListResponse | null;

    const entry = data?.data?.list?.[0];
    if (data?.code === 0 && entry?.operation_status) {
      providerStatus = entry.secondary_status ?? entry.operation_status;
    }
  }

  // Fallback: ad status
  if (!providerStatus && adId) {
    const data = await tikTokFetch("/ad/get/", token, {
      advertiser_id: advertiserId,
      filtering:     JSON.stringify({ ad_ids: [adId] }),
      fields:        JSON.stringify(["ad_id", "operation_status", "secondary_status"]),
    }) as TikTokListResponse | null;

    const entry = data?.data?.list?.[0];
    if (data?.code === 0 && entry?.operation_status) {
      providerStatus = entry.secondary_status ?? entry.operation_status;
    }
  }

  if (!providerStatus) {
    return {
      platform:        "tiktok",
      providerStatus:  "UNKNOWN",
      normalizedStatus: "unknown",
      fetchedAt,
      campaignId:      campaignId ?? undefined,
      adsetId:         adgroupId  ?? undefined,
      adId:            adId       ?? undefined,
    };
  }

  return {
    platform:        "tiktok",
    providerStatus,
    normalizedStatus: normalizeTikTokStatus(providerStatus),
    fetchedAt,
    campaignId:      campaignId ?? undefined,
    adsetId:         adgroupId  ?? undefined,
    adId:            adId       ?? undefined,
  };
}

// ── Insights query (ANALYTICS-LIVE-01) ────────────────────────────────────────

/**
 * TikTok Ads reporting uses date strings (YYYY-MM-DD).
 * Range mapping produces [startDate, endDate] pairs.
 */
function getTikTokDateRange(range: AdsAnalyticsRange): { startDate: string; endDate: string } {
  const now   = new Date();
  const end   = now.toISOString().slice(0, 10);

  if (range === "today") {
    return { startDate: end, endDate: end };
  }

  const days  = range === "week" ? 6 : 29;
  const start = new Date(now);
  start.setDate(start.getDate() - days);
  return { startDate: start.toISOString().slice(0, 10), endDate: end };
}

interface TikTokReportResponse {
  code?:  number;
  data?:  {
    list?: {
      metrics?: {
        spend?:       string;
        impressions?: string;
        clicks?:      string;
        ctr?:         string;
        cpc?:         string;
        cpm?:         string;
        conversion?:  string;
      };
      dimensions?: {
        campaign_id?: string;
      };
    }[];
  };
}

/**
 * Fetches aggregate performance metrics from TikTok Ads Reporting API
 * for a single campaign/adgroup/ad entity.
 *
 * Never activates, modifies, or charges any TikTok resource.
 * Never returns the access token.
 *
 * @param tenantId   — orgSlug for Vault credential resolution.
 * @param externalIds — IDs stored in AgentExecution.externalReferenceIds.
 * @param range      — Time range for the insights query.
 */
export async function getTikTokAdInsights(
  tenantId:    string,
  externalIds: AdsExternalIds,
  range:       AdsAnalyticsRange,
): Promise<{ metric: AdsAnalyticsMetric; campaignId: string | null } | null> {
  const creds = await resolveTikTokAdsCredentials(tenantId);
  if (!creds.accessToken || !creds.advertiserId) return null;

  const token        = creds.accessToken;
  const advertiserId = creds.advertiserId;
  const { startDate, endDate } = getTikTokDateRange(range);

  // Determine which level to query
  const campaignId = externalIds.tiktok_campaign_id ?? null;
  const adgroupId  = externalIds.tiktok_adgroup_id  ?? null;

  const metrics = ["spend", "impressions", "clicks", "ctr", "cpc", "cpm", "conversion"];

  type TikTokReportRow = NonNullable<NonNullable<TikTokReportResponse["data"]>["list"]>[0];

  // Try campaign-level first
  let row: TikTokReportRow | null = null;

  if (campaignId) {
    const body = JSON.stringify({
      advertiser_id:  advertiserId,
      report_type:    "BASIC",
      data_level:     "AUCTION_CAMPAIGN",
      dimensions:     ["campaign_id"],
      metrics,
      start_date:     startDate,
      end_date:       endDate,
      filtering:      [{ field_name: "campaign_ids", filter_type: "IN", filter_value: JSON.stringify([campaignId]) }],
      page:           1,
      page_size:      1,
    });

    const controller = new AbortController();
    const timer      = setTimeout(() => controller.abort(), 8000);
    try {
      const res = await fetch(`${TIKTOK_API_BASE}/report/integrated/get/`, {
        method:  "POST",
        signal:  controller.signal,
        headers: {
          "Content-Type": "application/json",
          "Access-Token":  token,
        },
        body,
      });
      const data = await res.json() as TikTokReportResponse;
      if (data.code === 0 && data.data?.list?.length) {
        row = data.data.list[0];
      }
    } catch {
      // fall through to adgroup
    } finally {
      clearTimeout(timer);
    }
  }

  // Fallback: adgroup-level
  if (!row && adgroupId) {
    const body = JSON.stringify({
      advertiser_id:  advertiserId,
      report_type:    "BASIC",
      data_level:     "AUCTION_ADGROUP",
      dimensions:     ["adgroup_id"],
      metrics,
      start_date:     startDate,
      end_date:       endDate,
      filtering:      [{ field_name: "adgroup_ids", filter_type: "IN", filter_value: JSON.stringify([adgroupId]) }],
      page:           1,
      page_size:      1,
    });

    const controller = new AbortController();
    const timer      = setTimeout(() => controller.abort(), 8000);
    try {
      const res = await fetch(`${TIKTOK_API_BASE}/report/integrated/get/`, {
        method:  "POST",
        signal:  controller.signal,
        headers: {
          "Content-Type": "application/json",
          "Access-Token":  token,
        },
        body,
      });
      const data = await res.json() as TikTokReportResponse;
      if (data.code === 0 && data.data?.list?.length) {
        row = data.data.list[0];
      }
    } catch {
      // no data
    } finally {
      clearTimeout(timer);
    }
  }

  if (!row?.metrics) return null;

  const m           = row.metrics;
  const impressions = parseFloat(m.impressions ?? "0") || 0;
  const clicks      = parseFloat(m.clicks      ?? "0") || 0;
  const spend       = parseFloat(m.spend       ?? "0") || 0;
  const ctr         = impressions > 0 ? clicks / impressions : 0;
  const cpc         = clicks      > 0 ? spend  / clicks      : 0;
  const cpm         = impressions > 0 ? (spend / impressions) * 1000 : 0;
  const conversions = parseFloat(m.conversion  ?? "0") || 0;

  return {
    metric: {
      spend,
      impressions,
      clicks,
      ctr,
      cpc,
      cpm,
      conversions,
      currency: "USD",
    },
    campaignId,
  };
}
