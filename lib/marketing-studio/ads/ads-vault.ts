/**
 * lib/marketing-studio/ads/ads-vault.ts
 *
 * MARKETING-ADS-VAULT-01 — Multi-Tenant Ads Credential Resolver
 * SERVER ONLY — @server-only
 *
 * Resolves Ads platform credentials using three-tier strategy:
 *   1. OAuth Vault (IntegrationSecret per connection — from real OAuth flow)
 *   2. process.env fallback  — dev only
 *   3. NOT_CONFIGURED        — fail-safe result
 *
 * The OAuth Vault tier bridges the token stored during Meta/TikTok/Google
 * OAuth callback (via storeIntegrationSecret) to the analytics credential resolver.
 * This is the primary path for real connected tenants.
 *
 * Principles:
 *   - orgSlug is MANDATORY — all lookups are tenant-scoped.
 *   - Credential values are NEVER returned to callers outside this module.
 *   - Never logs secret values.
 *   - All results include the source for UI audit display.
 */
import "server-only";

import { EnvironmentSecretProvider } from "@/lib/security/vault/legacy-secret-adapter";
import { SECRET_KEYS }               from "@/lib/security/vault/secret-provider";
import { getIntegrationSecret }      from "@/lib/integrations/vault/vault-service";
import { prisma }                    from "@/lib/prisma";
import type { AdsCredentialSource }  from "./connectors/ads-connector-types";

export type { AdsCredentialSource };

// ── Credential bundles ────────────────────────────────────────────────────────

/** Resolved Meta Ads credentials — values are null when not configured. */
export interface MetaAdsCredential {
  source:      AdsCredentialSource;
  /** Graph API access token. NEVER log or serialize. */
  accessToken: string | null;
  /** Target ad account ID (e.g. "act_123456"). */
  adAccountId: string | null;
  /** Meta Business Manager ID (optional). */
  businessId:  string | null;
  /** Facebook Page ID (optional). */
  pageId:      string | null;
}

/** Resolved TikTok Ads credentials — values are null when not configured. */
export interface TikTokAdsCredential {
  source:       AdsCredentialSource;
  /** TikTok Business API access token. NEVER log or serialize. */
  accessToken:  string | null;
  /** Target TikTok advertiser account ID. */
  advertiserId: string | null;
  /** TikTok Business Center ID (optional). */
  businessId:   string | null;
}

/** Safe metadata about a single platform's vault state. Never includes values. */
export interface AdsVaultMetadataEntry {
  platform:         string;
  credentialSource: AdsCredentialSource;
  exists:           boolean;
  resolvedAt:       string;
  /** Whether all required credentials are present. */
  complete:         boolean;
  /** Missing required fields, if any. */
  missing:          string[];
}

// ── Environment provider (singleton — stateless) ──────────────────────────────

const envProvider = new EnvironmentSecretProvider();

// ── OAuth vault resolution map ─────────────────────────────────────────────────

/**
 * Maps a canonical SECRET_KEY to the OAuth vault resolution strategy.
 *
 * "token"    — resolved via IntegrationConnection + IntegrationSecret.
 * "resource" — resolved via IntegrationResource.externalId (discovered post-OAuth).
 */
type OAuthResolutionStrategy =
  | { kind: "token";    providers: string[]; secretType: "access_token" | "refresh_token" }
  | { kind: "resource"; providers: string[]; resourceTypes: string[] };

const OAUTH_RESOLUTION_MAP: Record<string, OAuthResolutionStrategy> = {
  [SECRET_KEYS.META_ACCESS_TOKEN]:    { kind: "token",    providers: ["meta_facebook", "meta"], secretType: "access_token" },
  [SECRET_KEYS.META_AD_ACCOUNT_ID]:   { kind: "resource", providers: ["meta_ads"],              resourceTypes: ["ad_account"] },
  [SECRET_KEYS.META_BUSINESS_ID]:     { kind: "resource", providers: ["meta_facebook"],          resourceTypes: ["business_manager"] },
  [SECRET_KEYS.META_PAGE_ID]:         { kind: "resource", providers: ["meta_facebook"],          resourceTypes: ["page"] },
  [SECRET_KEYS.TIKTOK_TOKEN]:         { kind: "token",    providers: ["tiktok"],                 secretType: "access_token" },
  [SECRET_KEYS.TIKTOK_ADVERTISER_ID]: { kind: "resource", providers: ["tiktok"],                 resourceTypes: ["tiktok_advertiser"] },
  [SECRET_KEYS.TIKTOK_BUSINESS_ID]:   { kind: "resource", providers: ["tiktok"],                 resourceTypes: ["tiktok_business"] },
};

// ── OAuth-aware vault lookup ───────────────────────────────────────────────────

/**
 * Resolves a credential by secretKey for a given tenant using the OAuth vault.
 *
 * Resolution priority:
 *   - Token keys  → IntegrationConnection (primary, connected) + IntegrationSecret.
 *   - Resource keys → IntegrationResource.externalId (selected first, newest first).
 *
 * Returns null (never throws) if:
 *   - secretKey has no mapping in OAUTH_RESOLUTION_MAP
 *   - org not found
 *   - no connected connection exists for the required provider(s)
 *   - no IntegrationSecret/Resource found
 */
async function tryVaultLookup(
  orgSlug:   string,
  secretKey: string,
): Promise<string | null> {
  const strategy = OAUTH_RESOLUTION_MAP[secretKey];
  if (!strategy) return null;

  try {
    // Resolve organizationId — all vault queries are org-scoped
    const org = await prisma.organization.findUnique({
      where:  { slug: orgSlug },
      select: { id: true },
    });
    if (!org) return null;
    const organizationId = org.id;

    if (strategy.kind === "token") {
      // Find the primary connected integration connection for this provider group
      const connection = await prisma.integrationConnection.findFirst({
        where: {
          organizationId,
          provider: { in: strategy.providers },
          status:   "connected",
        },
        orderBy: [{ isPrimary: "desc" }, { createdAt: "desc" }],
        select:  { id: true },
      });
      if (!connection) return null;

      const secret = await getIntegrationSecret({
        organizationId,
        connectionId: connection.id,
        secretType:   strategy.secretType,
      });
      return secret?.plainValue ?? null;
    }

    if (strategy.kind === "resource") {
      // Return the externalId of the first matching resource (selected preferred)
      const resource = await (prisma as any).integrationResource.findFirst({
        where: {
          organizationId,
          provider:     { in: strategy.providers },
          resourceType: { in: strategy.resourceTypes },
        },
        orderBy: [{ selected: "desc" }, { discoveredAt: "desc" }],
        select:  { externalId: true },
      });
      return resource?.externalId ?? null;
    }
  } catch {
    // Fail safe — never propagate vault lookup errors to callers
    return null;
  }

  return null;
}

// ── Resolution helpers ────────────────────────────────────────────────────────

const isProduction = process.env.NODE_ENV === "production";

/**
 * Resolve a single secret value using Vault-First strategy.
 * Returns { value: string, source: AdsCredentialSource } or null if not found.
 */
async function resolveOne(
  orgSlug:   string,
  secretKey: string,
): Promise<{ value: string; source: AdsCredentialSource } | null> {
  // 1. Vault (primary — always attempted regardless of environment)
  const vaultValue = await tryVaultLookup(orgSlug, secretKey);
  if (vaultValue) {
    return { value: vaultValue, source: "VAULT" };
  }

  // 2. Environment fallback — DEV ONLY
  // In production: no env fallback — operators must provision Vault.
  if (!isProduction) {
    const envResult = await envProvider.getSecret(orgSlug, secretKey);
    if (envResult.found && envResult.secret) {
      return { value: envResult.secret, source: "ENV_DEV_FALLBACK" };
    }
  }

  return null;
}

// ── Meta Ads credential resolver ─────────────────────────────────────────────

/**
 * Resolve Meta Ads credentials for a tenant.
 *
 * @param orgSlug — tenant identifier. Required — throws if empty.
 * @returns MetaAdsCredential — values null if not configured.
 *          Never throws; returns NOT_CONFIGURED on any failure.
 */
export async function resolveMetaAdsCredentials(
  orgSlug: string,
): Promise<MetaAdsCredential> {
  if (!orgSlug || orgSlug.trim().length === 0) {
    throw new Error("[ads-vault] orgSlug is required — no tenant-less lookups.");
  }

  try {
    // Access token is the primary signal — determines overall source
    const atResult = await resolveOne(orgSlug, SECRET_KEYS.META_ACCESS_TOKEN);

    if (!atResult) {
      return { source: "NOT_CONFIGURED", accessToken: null, adAccountId: null, businessId: null, pageId: null };
    }

    const source = atResult.source;

    // Remaining fields resolved with the same source constraint
    const [aaResult, biResult, piResult] = await Promise.all([
      resolveOne(orgSlug, SECRET_KEYS.META_AD_ACCOUNT_ID),
      resolveOne(orgSlug, SECRET_KEYS.META_BUSINESS_ID),
      resolveOne(orgSlug, SECRET_KEYS.META_PAGE_ID),
    ]);

    return {
      source,
      accessToken: atResult.value,
      adAccountId: aaResult?.value ?? null,
      businessId:  biResult?.value  ?? null,
      pageId:      piResult?.value  ?? null,
    };
  } catch {
    // Fail safe — never propagate credential resolution errors
    return { source: "NOT_CONFIGURED", accessToken: null, adAccountId: null, businessId: null, pageId: null };
  }
}

// ── TikTok Ads credential resolver ───────────────────────────────────────────

/**
 * Resolve TikTok Ads credentials for a tenant.
 *
 * @param orgSlug — tenant identifier. Required — throws if empty.
 * @returns TikTokAdsCredential — values null if not configured.
 *          Never throws; returns NOT_CONFIGURED on any failure.
 */
export async function resolveTikTokAdsCredentials(
  orgSlug: string,
): Promise<TikTokAdsCredential> {
  if (!orgSlug || orgSlug.trim().length === 0) {
    throw new Error("[ads-vault] orgSlug is required — no tenant-less lookups.");
  }

  try {
    // TIKTOK_TOKEN maps to TIKTOK_ACCESS_TOKEN env var via LEGACY_ENV_MAP
    const atResult = await resolveOne(orgSlug, SECRET_KEYS.TIKTOK_TOKEN);

    if (!atResult) {
      return { source: "NOT_CONFIGURED", accessToken: null, advertiserId: null, businessId: null };
    }

    const source = atResult.source;

    const [adResult, biResult] = await Promise.all([
      resolveOne(orgSlug, SECRET_KEYS.TIKTOK_ADVERTISER_ID),
      resolveOne(orgSlug, SECRET_KEYS.TIKTOK_BUSINESS_ID),
    ]);

    return {
      source,
      accessToken:  atResult.value,
      advertiserId: adResult?.value ?? null,
      businessId:   biResult?.value ?? null,
    };
  } catch {
    return { source: "NOT_CONFIGURED", accessToken: null, advertiserId: null, businessId: null };
  }
}

// ── Vault metadata (safe — no values) ────────────────────────────────────────

/**
 * Returns safe metadata about Ads vault state for both platforms.
 * Never returns secret values. Safe to pass to client via RSC props.
 *
 * @param orgSlug — tenant identifier. Required.
 */
export async function getAdsVaultMetadata(
  orgSlug: string,
): Promise<AdsVaultMetadataEntry[]> {
  if (!orgSlug || orgSlug.trim().length === 0) {
    throw new Error("[ads-vault] orgSlug is required.");
  }

  const resolvedAt = new Date().toISOString();

  const [meta, tiktok] = await Promise.allSettled([
    resolveMetaAdsCredentials(orgSlug),
    resolveTikTokAdsCredentials(orgSlug),
  ]);

  const metaCreds   = meta.status   === "fulfilled" ? meta.value   : null;
  const tiktokCreds = tiktok.status === "fulfilled" ? tiktok.value : null;

  const metaMissing: string[] = [];
  if (!metaCreds?.accessToken)  metaMissing.push("META_ACCESS_TOKEN");
  if (!metaCreds?.adAccountId)  metaMissing.push("META_AD_ACCOUNT_ID");

  const tiktokMissing: string[] = [];
  if (!tiktokCreds?.accessToken)  tiktokMissing.push("TIKTOK_ACCESS_TOKEN");
  if (!tiktokCreds?.advertiserId) tiktokMissing.push("TIKTOK_ADVERTISER_ID");

  return [
    {
      platform:         "meta",
      credentialSource: metaCreds?.source ?? "NOT_CONFIGURED",
      exists:           !!metaCreds?.accessToken,
      resolvedAt,
      complete:         metaMissing.length === 0,
      missing:          metaMissing,
    },
    {
      platform:         "tiktok",
      credentialSource: tiktokCreds?.source ?? "NOT_CONFIGURED",
      exists:           !!tiktokCreds?.accessToken,
      resolvedAt,
      complete:         tiktokMissing.length === 0,
      missing:          tiktokMissing,
    },
  ];
}
