/**
 * lib/marketing-studio/ads/ads-accounts-config-service.ts
 *
 * MARKETING-ADS-ACCOUNTS-01 — Ads Account Selection Persistence
 * SERVER ONLY — @server-only
 *
 * Read/write TenantAdsConfig records (saved selections per platform).
 * No secrets stored here — only external resource IDs and display names.
 * Secrets live exclusively in the Vault (VaultSecret model).
 *
 * Uses `prisma as any` for the new TenantAdsConfig model until
 * `prisma generate` is run after the migration is applied.
 */
import "server-only";

import { prisma }                 from "@/lib/prisma";
import type {
  TenantAdsConfigData,
  SaveAdsSelectionInput,
} from "./ads-accounts-types";

// ── Row → domain mapper ────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toConfigData(row: any): TenantAdsConfigData {
  return {
    id:                          row.id,
    platform:                    row.platform,
    selectedAdAccountId:         row.selectedAdAccountId         ?? null,
    selectedAdAccountName:       row.selectedAdAccountName       ?? null,
    selectedBusinessId:          row.selectedBusinessId          ?? null,
    selectedBusinessName:        row.selectedBusinessName        ?? null,
    selectedPageId:              row.selectedPageId              ?? null,
    selectedPageName:            row.selectedPageName            ?? null,
    selectedInstagramAccountId:  row.selectedInstagramAccountId  ?? null,
    selectedInstagramAccountName:row.selectedInstagramAccountName ?? null,
    selectedAdvertiserId:        row.selectedAdvertiserId        ?? null,
    selectedAdvertiserName:      row.selectedAdvertiserName      ?? null,
    lastDiscoveredAt:            row.lastDiscoveredAt ? (row.lastDiscoveredAt as Date).toISOString() : null,
    updatedAt:                   (row.updatedAt as Date).toISOString(),
  };
}

// ── Read ───────────────────────────────────────────────────────────────────────

/**
 * Load all saved ads configurations for an organization.
 * Returns one entry per configured platform (meta, tiktok, etc.).
 */
export async function getAdsAccountsConfig(
  organizationId: string,
): Promise<TenantAdsConfigData[]> {
  if (!organizationId) return [];

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = await (prisma as any).tenantAdsConfig.findMany({
      where:   { organizationId },
      orderBy: { platform: "asc" },
    });

    return (rows as unknown[]).map(toConfigData);
  } catch {
    // No table yet (migration pending) — return empty gracefully
    return [];
  }
}

/**
 * Load config for a specific platform.
 * Returns null if not configured.
 */
export async function getAdsAccountsConfigForPlatform(
  organizationId: string,
  platform:        string,
): Promise<TenantAdsConfigData | null> {
  if (!organizationId || !platform) return null;

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row = await (prisma as any).tenantAdsConfig.findUnique({
      where: { organizationId_platform: { organizationId, platform } },
    });

    return row ? toConfigData(row) : null;
  } catch {
    return null;
  }
}

// ── Write ──────────────────────────────────────────────────────────────────────

/**
 * Upsert ads account selections for a platform.
 * Only external IDs and display names are persisted — never secrets.
 *
 * @param organizationId — tenant owner.
 * @param input          — platform + selection fields.
 * @returns Updated TenantAdsConfigData.
 */
export async function saveAdsAccountSelection(
  organizationId: string,
  input:          SaveAdsSelectionInput,
): Promise<TenantAdsConfigData> {
  if (!organizationId) throw new Error("[ads-accounts-config] organizationId required");
  if (!input.platform)  throw new Error("[ads-accounts-config] platform required");

  const data = {
    selectedAdAccountId:          input.selectedAdAccountId          ?? null,
    selectedAdAccountName:        input.selectedAdAccountName        ?? null,
    selectedBusinessId:           input.selectedBusinessId           ?? null,
    selectedBusinessName:         input.selectedBusinessName         ?? null,
    selectedPageId:               input.selectedPageId               ?? null,
    selectedPageName:             input.selectedPageName             ?? null,
    selectedInstagramAccountId:   input.selectedInstagramAccountId   ?? null,
    selectedInstagramAccountName: input.selectedInstagramAccountName ?? null,
    selectedAdvertiserId:         input.selectedAdvertiserId         ?? null,
    selectedAdvertiserName:       input.selectedAdvertiserName       ?? null,
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const row = await (prisma as any).tenantAdsConfig.upsert({
    where: {
      organizationId_platform: { organizationId, platform: input.platform },
    },
    update: data,
    create: {
      organizationId,
      platform: input.platform,
      ...data,
    },
  });

  return toConfigData(row);
}

/**
 * Mark lastDiscoveredAt for a platform (called after a discovery run).
 */
export async function markDiscoveryRun(
  organizationId: string,
  platform:        string,
): Promise<void> {
  if (!organizationId || !platform) return;

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (prisma as any).tenantAdsConfig.upsert({
      where: {
        organizationId_platform: { organizationId, platform },
      },
      update: { lastDiscoveredAt: new Date() },
      create: {
        organizationId,
        platform,
        lastDiscoveredAt: new Date(),
      },
    });
  } catch {
    // Non-critical — best effort
  }
}
