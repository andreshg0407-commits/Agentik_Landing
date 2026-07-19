/**
 * lib/integrations/resource-discovery.ts
 *
 * MARKETING-CONNECTIONS-HARDENING-01 — Phase 1: Automatic Resource Discovery
 *
 * Discovers external resources (pages, ad accounts, pixels, etc.) after OAuth
 * and persists them as IntegrationResource records.
 *
 * SERVER ONLY — never import in client components.
 *
 * SECURITY:
 * - Access tokens fetched from Vault per connectionId — never passed by client.
 * - No secret fields stored in IntegrationResource.
 * - organizationId always comes from server session — never from client params.
 * - Errors are caught and logged; they never block the OAuth redirect.
 */

import "server-only";

import { prisma }                  from "@/lib/prisma";
import { getIntegrationSecret }    from "@/lib/integrations/vault/vault-service";
import { recordIntegrationAuditEvent } from "@/lib/integrations/integration-audit";

// ── Resource snapshot type (serializable, no secrets) ─────────────────────────

export interface DiscoveredResource {
  provider:     string;
  resourceType: string;
  externalId:   string;
  externalName: string;
  metadataJson: Record<string, unknown> | null;
}

export interface DiscoveryResult {
  provider:        string;
  organizationId:  string;
  discovered:      number;
  upserted:        number;
  errors:          string[];
}

// ── Upsert helper ─────────────────────────────────────────────────────────────

async function upsertResource(
  organizationId: string,
  connectionId:   string | null,
  resource:       DiscoveredResource,
): Promise<void> {
  await (prisma as any).integrationResource.upsert({
    where: {
      organizationId_provider_externalId: {
        organizationId,
        provider:   resource.provider,
        externalId: resource.externalId,
      },
    },
    create: {
      organizationId,
      connectionId,
      provider:     resource.provider,
      resourceType: resource.resourceType,
      externalId:   resource.externalId,
      externalName: resource.externalName,
      metadataJson: resource.metadataJson ?? undefined,
      selected:     false,
    },
    update: {
      connectionId,
      externalName: resource.externalName,
      metadataJson: resource.metadataJson ?? undefined,
    },
  });
}

// ── Meta discovery ─────────────────────────────────────────────────────────────

interface MetaAdAccount {
  id:           string;
  name:         string;
  account_status?: number;
  currency?:    string;
  timezone_name?: string;
}

interface MetaPixel {
  id:   string;
  name: string;
}

interface MetaCatalog {
  id:   string;
  name: string;
}

interface MetaBusinessManager {
  id:   string;
  name: string;
}

async function fetchMetaUserToken(
  organizationId: string,
  connectionId:   string,
): Promise<string | null> {
  try {
    const secret = await getIntegrationSecret({
      organizationId,
      connectionId,
      secretType: "access_token",
    });
    return secret?.plainValue ?? null;
  } catch {
    return null;
  }
}

async function fetchMetaAdAccounts(userToken: string): Promise<MetaAdAccount[]> {
  try {
    const res  = await fetch(
      `https://graph.facebook.com/v19.0/me/adaccounts?fields=id,name,account_status,currency,timezone_name&access_token=${userToken}`,
    );
    const data = await res.json() as { data?: MetaAdAccount[] };
    return data.data ?? [];
  } catch {
    return [];
  }
}

async function fetchMetaPixels(userToken: string, adAccountId: string): Promise<MetaPixel[]> {
  try {
    const res  = await fetch(
      `https://graph.facebook.com/v19.0/${adAccountId}/adspixels?fields=id,name&access_token=${userToken}`,
    );
    const data = await res.json() as { data?: MetaPixel[] };
    return data.data ?? [];
  } catch {
    return [];
  }
}

async function fetchMetaCatalogs(userToken: string): Promise<MetaCatalog[]> {
  try {
    const res  = await fetch(
      `https://graph.facebook.com/v19.0/me/owned_product_catalogs?fields=id,name&access_token=${userToken}`,
    );
    const data = await res.json() as { data?: MetaCatalog[] };
    return data.data ?? [];
  } catch {
    return [];
  }
}

async function fetchMetaBusinessManagers(userToken: string): Promise<MetaBusinessManager[]> {
  try {
    const res  = await fetch(
      `https://graph.facebook.com/v19.0/me/businesses?fields=id,name&access_token=${userToken}`,
    );
    const data = await res.json() as { data?: MetaBusinessManager[] };
    return data.data ?? [];
  } catch {
    return [];
  }
}

/**
 * Discovers Meta resources (ad accounts, pixels, catalogs, BMs) for an org.
 * Reads page-level connections to find available user tokens.
 * Fire-and-forget safe — all errors caught internally.
 */
export async function discoverMetaResources(
  organizationId: string,
): Promise<DiscoveryResult> {
  const result: DiscoveryResult = {
    provider: "meta",
    organizationId,
    discovered: 0,
    upserted:   0,
    errors:     [],
  };

  try {
    // Find the primary meta_facebook connection to get a user token
    const connections = await prisma.integrationConnection.findMany({
      where: {
        organizationId,
        provider: { in: ["meta_facebook", "meta"] },
        status:   "connected",
      },
      orderBy: [{ isPrimary: "desc" }, { createdAt: "desc" }],
      take: 3,
    });

    if (connections.length === 0) {
      result.errors.push("No connected meta_facebook connection found");
      return result;
    }

    // Try each connection until we get a valid token
    let userToken: string | null = null;
    let primaryConnectionId: string | null = null;

    for (const conn of connections) {
      const token = await fetchMetaUserToken(organizationId, conn.id);
      if (token) {
        userToken           = token;
        primaryConnectionId = conn.id;
        break;
      }
    }

    if (!userToken) {
      result.errors.push("Could not retrieve access token for meta_facebook");
      return result;
    }

    // Facebook pages are already discovered in callback — skip re-discovery here.
    // Focus on: Ad Accounts, Business Managers, Pixels, Catalogs.

    const [adAccounts, catalogs, businessManagers] = await Promise.all([
      fetchMetaAdAccounts(userToken),
      fetchMetaCatalogs(userToken),
      fetchMetaBusinessManagers(userToken),
    ]);

    result.discovered += adAccounts.length + catalogs.length + businessManagers.length;

    // Upsert ad accounts
    for (const ac of adAccounts) {
      try {
        await upsertResource(organizationId, primaryConnectionId, {
          provider:     "meta_ads",
          resourceType: "ad_account",
          externalId:   ac.id,
          externalName: ac.name,
          metadataJson: {
            currency:      ac.currency,
            timezone:      ac.timezone_name,
            accountStatus: ac.account_status,
          },
        });
        result.upserted++;
      } catch (e) {
        result.errors.push(`ad_account ${ac.id}: ${e instanceof Error ? e.message : "error"}`);
      }
    }

    // Discover pixels per ad account (up to first 3 ad accounts to avoid rate limits)
    const adAccountsForPixels = adAccounts.slice(0, 3);
    for (const ac of adAccountsForPixels) {
      const pixels = await fetchMetaPixels(userToken, ac.id);
      result.discovered += pixels.length;
      for (const px of pixels) {
        try {
          await upsertResource(organizationId, primaryConnectionId, {
            provider:     "meta_ads",
            resourceType: "pixel",
            externalId:   px.id,
            externalName: px.name,
            metadataJson: { adAccountId: ac.id },
          });
          result.upserted++;
        } catch (e) {
          result.errors.push(`pixel ${px.id}: ${e instanceof Error ? e.message : "error"}`);
        }
      }
    }

    // Upsert catalogs
    for (const cat of catalogs) {
      try {
        await upsertResource(organizationId, primaryConnectionId, {
          provider:     "meta_facebook",
          resourceType: "catalog",
          externalId:   cat.id,
          externalName: cat.name,
          metadataJson: null,
        });
        result.upserted++;
      } catch (e) {
        result.errors.push(`catalog ${cat.id}: ${e instanceof Error ? e.message : "error"}`);
      }
    }

    // Upsert business managers
    for (const bm of businessManagers) {
      try {
        await upsertResource(organizationId, primaryConnectionId, {
          provider:     "meta_facebook",
          resourceType: "business_manager",
          externalId:   bm.id,
          externalName: bm.name,
          metadataJson: null,
        });
        result.upserted++;
      } catch (e) {
        result.errors.push(`business_manager ${bm.id}: ${e instanceof Error ? e.message : "error"}`);
      }
    }

    await recordIntegrationAuditEvent({
      organizationId,
      provider:  "meta_facebook",
      eventType: "SYNC_JOB_COMPLETED",
      payload:   { action: "resource_discovery", discovered: result.discovered, upserted: result.upserted },
    }).catch(() => {});

  } catch (err) {
    result.errors.push(err instanceof Error ? err.message : "discovery_failed");
  }

  return result;
}

// ── TikTok discovery ───────────────────────────────────────────────────────────

interface TikTokAdvertiser {
  advertiser_id:   string;
  advertiser_name: string;
  currency?:       string;
  timezone?:       string;
  status?:         string;
}

async function fetchTikTokAdvertisers(accessToken: string): Promise<TikTokAdvertiser[]> {
  try {
    const res  = await fetch(
      `https://business-api.tiktok.com/open_api/v1.3/oauth2/advertiser/get/?access_token=${accessToken}&fields=["advertiser_id","advertiser_name","currency","timezone","status"]`,
    );
    const data = await res.json() as { data?: { list?: TikTokAdvertiser[] }; code?: number };
    return data.data?.list ?? [];
  } catch {
    return [];
  }
}

/**
 * Discovers TikTok resources (advertiser accounts) for an org.
 * Fire-and-forget safe — all errors caught internally.
 */
export async function discoverTikTokResources(
  organizationId: string,
): Promise<DiscoveryResult> {
  const result: DiscoveryResult = {
    provider: "tiktok",
    organizationId,
    discovered: 0,
    upserted:   0,
    errors:     [],
  };

  try {
    const connection = await prisma.integrationConnection.findFirst({
      where: {
        organizationId,
        provider: "tiktok",
        status:   "connected",
      },
      orderBy: { createdAt: "desc" },
    });

    if (!connection) {
      result.errors.push("No connected TikTok connection found");
      return result;
    }

    const secret = await getIntegrationSecret({
      organizationId,
      connectionId: connection.id,
      secretType:   "access_token",
    });

    if (!secret?.plainValue) {
      result.errors.push("Could not retrieve TikTok access token");
      return result;
    }

    const advertisers = await fetchTikTokAdvertisers(secret.plainValue);
    result.discovered += advertisers.length;

    for (const adv of advertisers) {
      try {
        await upsertResource(organizationId, connection.id, {
          provider:     "tiktok",
          resourceType: "tiktok_advertiser",
          externalId:   adv.advertiser_id,
          externalName: adv.advertiser_name,
          metadataJson: {
            currency: adv.currency,
            timezone: adv.timezone,
            status:   adv.status,
          },
        });
        result.upserted++;
      } catch (e) {
        result.errors.push(`advertiser ${adv.advertiser_id}: ${e instanceof Error ? e.message : "error"}`);
      }
    }

    await recordIntegrationAuditEvent({
      organizationId,
      connectionId: connection.id,
      provider:     "tiktok",
      eventType:    "SYNC_JOB_COMPLETED",
      payload:      { action: "resource_discovery", discovered: result.discovered, upserted: result.upserted },
    }).catch(() => {});

  } catch (err) {
    result.errors.push(err instanceof Error ? err.message : "discovery_failed");
  }

  return result;
}

// ── Resource query helpers ─────────────────────────────────────────────────────

export interface IntegrationResourceSnapshot {
  id:           string;
  provider:     string;
  resourceType: string;
  externalId:   string;
  externalName: string;
  selected:     boolean;
  metadataJson: Record<string, unknown> | null;
  discoveredAt: string;
}

export async function listIntegrationResources(
  organizationId: string,
  provider?:      string,
  resourceType?:  string,
): Promise<IntegrationResourceSnapshot[]> {
  const where: Record<string, unknown> = { organizationId };
  if (provider)     where.provider     = provider;
  if (resourceType) where.resourceType = resourceType;

  const records = await (prisma as any).integrationResource.findMany({
    where,
    orderBy: { discoveredAt: "desc" },
  });

  return records.map((r: any) => ({
    id:           r.id,
    provider:     r.provider,
    resourceType: r.resourceType,
    externalId:   r.externalId,
    externalName: r.externalName,
    selected:     r.selected,
    metadataJson: r.metadataJson as Record<string, unknown> | null,
    discoveredAt: r.discoveredAt.toISOString(),
  }));
}

export async function updateResourceSelection(
  organizationId: string,
  resourceId:     string,
  selected:       boolean,
): Promise<void> {
  await (prisma as any).integrationResource.updateMany({
    where: { id: resourceId, organizationId },
    data:  { selected },
  });
}

export async function bulkUpdateResourceSelection(
  organizationId: string,
  resourceIds:    string[],
  selected:       boolean,
): Promise<void> {
  await (prisma as any).integrationResource.updateMany({
    where: { id: { in: resourceIds }, organizationId },
    data:  { selected },
  });
}

// ── Google discovery ───────────────────────────────────────────────────────────

/**
 * Discovers Google Ads or YouTube resources for an org immediately after OAuth.
 * Called with a fresh access token directly from the OAuth callback.
 * Fire-and-forget safe — all errors caught internally.
 *
 * @param providerKey "google_ads" | "youtube"
 * @param accessToken fresh OAuth access token
 */
export async function discoverGoogleResources(
  organizationId: string,
  providerKey:    string,
  accessToken:    string,
): Promise<DiscoveryResult> {
  const result: DiscoveryResult = {
    provider: providerKey,
    organizationId,
    discovered: 0,
    upserted:   0,
    errors:     [],
  };

  try {
    // Find the newly created connection
    const connection = await prisma.integrationConnection.findFirst({
      where:   { organizationId, provider: providerKey, status: "connected" },
      orderBy: { createdAt: "desc" },
    });
    const connectionId = connection?.id ?? null;

    if (providerKey === "google_ads") {
      const developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN ?? "";
      if (!developerToken) {
        result.errors.push("GOOGLE_ADS_DEVELOPER_TOKEN not set — skipping customer discovery");
        return result;
      }
      const { fetchGoogleAdsCustomers } = await import("./oauth/providers/google-oauth");
      const customers = await fetchGoogleAdsCustomers(accessToken, developerToken);
      result.discovered += customers.length;
      for (const c of customers) {
        try {
          await upsertResource(organizationId, connectionId, {
            provider:     "google_ads",
            resourceType: c.managerAccount ? "mcc_account" : "customer",
            externalId:   c.customerId,
            externalName: c.descriptiveName || `Customer ${c.customerId}`,
            metadataJson: { currencyCode: c.currencyCode, timeZone: c.timeZone, managerAccount: c.managerAccount },
          });
          result.upserted++;
        } catch (e) {
          result.errors.push(`customer ${c.customerId}: ${e instanceof Error ? e.message : "error"}`);
        }
      }
    }

    if (providerKey === "youtube") {
      const { fetchYouTubeChannels } = await import("./oauth/providers/google-oauth");
      const channels = await fetchYouTubeChannels(accessToken);
      result.discovered += channels.length;
      for (const ch of channels) {
        try {
          await upsertResource(organizationId, connectionId, {
            provider:     "youtube",
            resourceType: "channel",
            externalId:   ch.id,
            externalName: ch.title,
            metadataJson: { description: ch.description, thumbnail: ch.thumbnail, subscriberCount: ch.subscriberCount },
          });
          result.upserted++;
        } catch (e) {
          result.errors.push(`channel ${ch.id}: ${e instanceof Error ? e.message : "error"}`);
        }
      }
    }

    await recordIntegrationAuditEvent({
      organizationId,
      provider:  providerKey,
      eventType: "SYNC_JOB_COMPLETED",
      payload:   { action: "resource_discovery", discovered: result.discovered, upserted: result.upserted },
    }).catch(() => {});

  } catch (err) {
    result.errors.push(err instanceof Error ? err.message : "discovery_failed");
  }

  return result;
}
