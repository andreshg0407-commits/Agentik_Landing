/**
 * lib/marketing-studio/ads/connectors/meta-ads-connector.ts
 *
 * MARKETING-ADS-CONNECTORS-01 — Meta Ads API Connector
 * SERVER ONLY — @server-only
 *
 * Responsibility:
 *   - Read Meta Ads credentials from env (temporal — future: Vault tenant-scoped).
 *   - Validate access token via Graph API /me endpoint.
 *   - List ad accounts accessible to the token.
 *   - Validate permission scopes.
 *   - Return a safe AdsConnectorDiagnostic. Never expose the token.
 *
 * This connector does NOT create or modify any Meta resource.
 * It is strictly a diagnostic/read-only connector.
 *
 * Required env vars (document for operators):
 *   META_ACCESS_TOKEN   — User or System User access token with Ads read scopes.
 *   META_AD_ACCOUNT_ID  — Target ad account ID (act_XXXXXXXX).
 *   META_BUSINESS_ID    — Meta Business Manager ID (optional).
 *   META_PAGE_ID        — Facebook Page ID (optional).
 *
 * Related existing env vars (OAuth app — DO NOT confuse):
 *   META_APP_ID       — OAuth app client ID (lib/integrations/oauth/providers/meta-oauth.ts)
 *   META_APP_SECRET   — OAuth app secret
 *   META_REDIRECT_URI — OAuth callback URI
 *
 * Recommended scopes for Ads:
 *   ads_read, ads_management, business_management, pages_read_engagement
 *
 * Graph API version: v19.0
 */
import "server-only";

import { resolveMetaAdsCredentials } from "../ads-vault";

import type {
  AdsConnectorDiagnostic,
  AdsConnectorResult,
  AdsAccountSummary,
  AdsPermissionSummary,
} from "./ads-connector-types";
import type { AdsExternalIds, AdsProviderStatusPayload, AdsExternalStatus } from "../ads-sync-types";
import type { AdsAnalyticsRange, AdsAnalyticsMetric } from "../ads-analytics-types";

const META_GRAPH_BASE = "https://graph.facebook.com/v19.0";

/** Scopes required for Meta Ads management. */
const META_ADS_REQUIRED_SCOPES = [
  "ads_read",
  "ads_management",
  "business_management",
];

/** Non-critical scopes — warn if absent but don't fail. */
const META_ADS_RECOMMENDED_SCOPES = [
  "pages_read_engagement",
  "pages_show_list",
];

const TIMEOUT_MS = 8000;

// ── Credential resolution ──────────────────────────────────────────────────────
// Handled by ads-vault.ts — Vault-First strategy (Vault → env[dev only] → NOT_CONFIGURED)

// ── Fetch helpers ─────────────────────────────────────────────────────────────

/** Fetch with AbortController timeout. Returns null on timeout/network error. */
async function graphFetch(
  path: string,
  token: string,
  params: Record<string, string> = {},
): Promise<unknown> {
  const controller = new AbortController();
  const timer      = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const url = new URL(`${META_GRAPH_BASE}${path}`);
    // Token appended last in URL — never logged by our code, but visible in
    // access logs on the server. Operators should treat access logs as sensitive.
    url.searchParams.set("access_token", token);
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, v);
    }

    const res = await fetch(url.toString(), {
      method: "GET",
      signal: controller.signal,
      headers: { "Accept": "application/json" },
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

interface MeResponse {
  id?:    string;
  name?:  string;
  error?: { message?: string; code?: number };
}

async function validateToken(token: string): Promise<{
  valid: boolean;
  userId?: string;
  name?:   string;
  error?:  string;
}> {
  const data = await graphFetch("/me", token, { fields: "id,name" }) as MeResponse | null;

  if (!data) return { valid: false, error: "No se pudo conectar con la API de Meta." };

  if (data.error) {
    // Do NOT include raw error.message — may contain token hints
    const code = data.error.code ?? 0;
    if (code === 190) return { valid: false, error: "Token Meta inválido o vencido (código 190)." };
    if (code === 200) return { valid: false, error: "Token Meta sin permisos suficientes (código 200)." };
    return { valid: false, error: `API de Meta rechazó el token (código ${code}).` };
  }

  return { valid: true, userId: data.id, name: data.name };
}

// ── Ad accounts ───────────────────────────────────────────────────────────────

interface AdAccountsResponse {
  data?:  { id: string; name: string; currency: string; account_status: number }[];
  error?: { code?: number };
}

async function listAdAccounts(token: string): Promise<AdsAccountSummary[]> {
  const data = await graphFetch(
    "/me/adaccounts",
    token,
    { fields: "id,name,currency,account_status", limit: "20" },
  ) as AdAccountsResponse | null;

  if (!data?.data) return [];

  return data.data.map(a => ({
    id:       a.id,
    name:     a.name,
    currency: a.currency,
    // account_status: 1 = ACTIVE, 2 = DISABLED, etc.
    status:   a.account_status === 1 ? "active" : `status_${a.account_status}`,
  }));
}

// ── Permissions ───────────────────────────────────────────────────────────────

interface PermissionsResponse {
  data?: { permission: string; status: string }[];
  error?: { code?: number };
}

async function checkPermissions(token: string): Promise<AdsPermissionSummary[]> {
  const data = await graphFetch("/me/permissions", token) as PermissionsResponse | null;

  if (!data?.data) return [];

  return data.data.map(p => ({
    scope:   p.permission,
    granted: p.status === "granted",
  }));
}

// ── Main diagnostic ───────────────────────────────────────────────────────────

/**
 * Runs a full read-only diagnostic against the Meta Ads API.
 * Never creates, modifies, or charges any Meta resource.
 * Never returns the access token.
 *
 * Credentials resolved via Vault-First strategy (ads-vault.ts):
 *   1. VaultService (encrypted, org-scoped) — always tried first
 *   2. process.env                          — dev only, never in production
 *   3. NOT_CONFIGURED                       — safe fail-closed return
 *
 * @param tenantId — orgSlug of the tenant. Required.
 */
export async function runMetaAdsDiagnostic(
  tenantId: string,
): Promise<AdsConnectorResult> {
  const checkedAt = new Date().toISOString();

  const makeDiag = (
    status: AdsConnectorDiagnostic["status"],
    overrides: Partial<AdsConnectorDiagnostic> = {},
  ): AdsConnectorResult => ({
    ok: status === "connected",
    diagnostic: {
      platform:    "meta",
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
  const creds = await resolveMetaAdsCredentials(tenantId);

  if (creds.source === "NOT_CONFIGURED" && !creds.accessToken && !creds.adAccountId) {
    return makeDiag("not_configured", {
      credentialSource: "NOT_CONFIGURED",
      errors:   ["META_ACCESS_TOKEN no está configurado."],
      warnings: ["Aprovisiona credenciales Meta Ads en el Vault para activar esta plataforma."],
    });
  }

  if (!creds.accessToken) {
    return makeDiag("missing_credentials", {
      credentialSource: creds.source,
      errors: ["Falta META_ACCESS_TOKEN."],
    });
  }

  if (!creds.adAccountId) {
    return makeDiag("missing_credentials", {
      credentialSource: creds.source,
      errors:   ["Falta META_AD_ACCOUNT_ID."],
      warnings: ["Define META_AD_ACCOUNT_ID para identificar la cuenta publicitaria."],
    });
  }

  const token = creds.accessToken;

  // ── Step 2: validate token ─────────────────────────────────────────────────
  const tokenCheck = await validateToken(token);

  if (!tokenCheck.valid) {
    return makeDiag("invalid_credentials", {
      credentialSource: creds.source,
      errors: [tokenCheck.error ?? "Token Meta inválido o vencido."],
    });
  }

  // ── Step 3: list ad accounts ──────────────────────────────────────────────
  const accounts = await listAdAccounts(token);

  const errors:   string[] = [];
  const warnings: string[] = [];

  if (accounts.length === 0) {
    warnings.push("No se encontraron cuentas publicitarias asociadas al token.");
  }

  // Verify the configured account is accessible
  const targetAccount = accounts.find(
    a => a.id === creds.adAccountId || a.id === `act_${creds.adAccountId}`,
  );
  if (creds.adAccountId && accounts.length > 0 && !targetAccount) {
    warnings.push(`La cuenta ${creds.adAccountId} no está accesible con el token actual.`);
  }

  // ── Step 4: check permissions ─────────────────────────────────────────────
  const permissions = await checkPermissions(token);

  const grantedScopes = new Set(permissions.filter(p => p.granted).map(p => p.scope));

  const missingRequired = META_ADS_REQUIRED_SCOPES.filter(s => !grantedScopes.has(s));
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

  const missingRecommended = META_ADS_RECOMMENDED_SCOPES.filter(s => !grantedScopes.has(s));
  if (missingRecommended.length > 0) {
    warnings.push(`Permisos recomendados ausentes: ${missingRecommended.join(", ")}.`);
  }

  if (!creds.businessId) {
    warnings.push("META_BUSINESS_ID no configurado — algunas funciones de Business Manager no estarán disponibles.");
  }

  if (creds.source === "ENV_DEV_FALLBACK") {
    warnings.push("Credenciales resueltas desde variables de entorno (dev fallback) — migra a Vault para producción.");
  }

  return makeDiag("connected", { credentialSource: creds.source, accounts, permissions, warnings, errors });
}

// ── Status query (SYNC-01) ─────────────────────────────────────────────────────

/**
 * Maps Meta's raw ad/campaign/adset status strings to a normalized AdsExternalStatus.
 *
 * Meta effective_status values:
 *   ACTIVE, PAUSED, IN_PROCESS, PENDING_REVIEW, DISAPPROVED,
 *   WITH_ISSUES, DELETED, ARCHIVED, CAMPAIGN_PAUSED, ADSET_PAUSED
 */
function normalizeMetaStatus(raw: string): AdsExternalStatus {
  switch (raw.toUpperCase()) {
    case "ACTIVE":                  return "active";
    case "PAUSED":
    case "CAMPAIGN_PAUSED":
    case "ADSET_PAUSED":            return "paused";
    case "IN_PROCESS":
    case "PENDING_REVIEW":          return "in_review";
    case "DISAPPROVED":             return "rejected";
    case "WITH_ISSUES":             return "failed";
    case "DELETED":
    case "ARCHIVED":                return "archived";
    default:                        return "unknown";
  }
}

/**
 * Queries the status of a Meta ad (or campaign/adset as fallback).
 *
 * Priority: ad_id → adset_id → campaign_id (most specific first).
 * Reads effective_status which reflects actual delivery state including
 * parent pauses (CAMPAIGN_PAUSED, ADSET_PAUSED).
 *
 * Never activates, modifies, or charges any Meta resource.
 * Never returns the access token.
 *
 * @param tenantId   — orgSlug for Vault credential resolution.
 * @param externalIds — IDs stored in AgentExecution.externalReferenceIds.
 */
export async function getMetaAdStatus(
  tenantId:    string,
  externalIds: AdsExternalIds,
): Promise<AdsProviderStatusPayload | null> {
  const fetchedAt = new Date().toISOString();

  // Resolve credentials — Vault-First
  const creds = await resolveMetaAdsCredentials(tenantId);
  if (!creds.accessToken) return null;

  const token = creds.accessToken;

  // Determine which entity to query (most specific first)
  const adId       = externalIds.meta_ad_id;
  const adsetId    = externalIds.meta_adset_id;
  const campaignId = externalIds.meta_campaign_id;

  interface StatusResponse {
    id?:               string;
    effective_status?: string;
    status?:           string;
    error?:            { code?: number };
  }

  let providerStatus: string | null = null;
  let queriedId:      string | null = null;

  if (adId) {
    // Query ad effective_status — most granular
    const data = await graphFetch(`/${adId}`, token, { fields: "id,effective_status" }) as StatusResponse | null;
    if (data && !data.error && data.effective_status) {
      providerStatus = data.effective_status;
      queriedId      = adId;
    }
  }

  if (!providerStatus && adsetId) {
    const data = await graphFetch(`/${adsetId}`, token, { fields: "id,effective_status" }) as StatusResponse | null;
    if (data && !data.error && data.effective_status) {
      providerStatus = data.effective_status;
      queriedId      = adsetId;
    }
  }

  if (!providerStatus && campaignId) {
    const data = await graphFetch(`/${campaignId}`, token, { fields: "id,effective_status" }) as StatusResponse | null;
    if (data && !data.error && data.effective_status) {
      providerStatus = data.effective_status;
      queriedId      = campaignId;
    }
  }

  if (!providerStatus) {
    // Could not determine status — return unknown
    return {
      platform:        "meta",
      providerStatus:  "UNKNOWN",
      normalizedStatus: "unknown",
      fetchedAt,
      campaignId:      campaignId ?? undefined,
      adsetId:         adsetId    ?? undefined,
      adId:            adId       ?? undefined,
    };
  }

  void queriedId; // used for resolution, not stored

  return {
    platform:        "meta",
    providerStatus,
    normalizedStatus: normalizeMetaStatus(providerStatus),
    fetchedAt,
    campaignId:      campaignId ?? undefined,
    adsetId:         adsetId    ?? undefined,
    adId:            adId       ?? undefined,
  };
}

// ── Insights query (ANALYTICS-LIVE-01) ────────────────────────────────────────

const META_DATE_PRESET: Record<AdsAnalyticsRange, string> = {
  today: "today",
  week:  "last_7_d",
  month: "last_30_d",
};

interface MetaInsightsResponse {
  data?: {
    impressions?: string;
    clicks?:      string;
    spend?:       string;
    ctr?:         string;
    cpc?:         string;
    cpm?:         string;
    actions?:     { action_type: string; value: string }[];
  }[];
  error?: { code?: number };
}

/**
 * Fetches aggregate performance metrics from Meta Insights API for a single
 * campaign/adset/ad entity.
 *
 * Priority: ad_id → adset_id → campaign_id (most specific first).
 * Uses date_preset for range mapping.
 *
 * Never activates, modifies, or charges any Meta resource.
 * Never returns the access token.
 *
 * @param tenantId   — orgSlug for Vault credential resolution.
 * @param externalIds — IDs stored in AgentExecution.externalReferenceIds.
 * @param range      — Time range for the insights query.
 */
export async function getMetaAdInsights(
  tenantId:    string,
  externalIds: AdsExternalIds,
  range:       AdsAnalyticsRange,
): Promise<{ metric: AdsAnalyticsMetric; campaignId: string | null } | null> {
  const creds = await resolveMetaAdsCredentials(tenantId);
  if (!creds.accessToken) return null;

  const token      = creds.accessToken;
  const preset     = META_DATE_PRESET[range];
  const fields     = "impressions,clicks,spend,ctr,cpc,cpm,actions";

  // Determine which entity to query (most specific first)
  const objectId = externalIds.meta_ad_id
    ?? externalIds.meta_adset_id
    ?? externalIds.meta_campaign_id
    ?? null;

  if (!objectId) return null;

  const data = await graphFetch(
    `/${objectId}/insights`,
    token,
    { date_preset: preset, fields, limit: "1" },
  ) as MetaInsightsResponse | null;

  if (!data || data.error || !data.data?.length) return null;

  const row = data.data[0];
  const impressions = parseFloat(row.impressions ?? "0") || 0;
  const clicks      = parseFloat(row.clicks      ?? "0") || 0;
  const spend       = parseFloat(row.spend       ?? "0") || 0;
  const ctr         = impressions > 0 ? clicks / impressions : 0;
  const cpc         = clicks      > 0 ? spend  / clicks      : 0;
  const cpm         = impressions > 0 ? (spend / impressions) * 1000 : 0;

  // Count purchase/conversion actions
  const conversions = (row.actions ?? [])
    .filter(a => a.action_type === "purchase" || a.action_type === "offsite_conversion.fb_pixel_purchase")
    .reduce((acc, a) => acc + (parseFloat(a.value) || 0), 0);

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
    campaignId: externalIds.meta_campaign_id ?? null,
  };
}
