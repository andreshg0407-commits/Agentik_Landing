/**
 * lib/marketing-studio/ads/ads-accounts-types.ts
 *
 * MARKETING-ADS-ACCOUNTS-01 — Ads Resource Discovery & Selection Types
 *
 * All types are JSON-safe — safe for RSC → client boundary.
 * No secrets, no tokens, no encrypted values.
 * Prepared for MARKETING-ADS-EXECUTION-01 (will consume selectedAdAccountId etc.).
 */

// ── Resource types ─────────────────────────────────────────────────────────────

/**
 * Type of advertising resource discovered on a platform.
 */
export type AdsPlatformResourceType =
  | "ad_account"
  | "business"
  | "facebook_page"
  | "instagram_account"
  | "advertiser"
  | "pixel"
  | "other";

/**
 * Normalized resource discovered from an ads platform.
 * All fields are safe — no credentials, tokens, or secrets.
 *
 * Ready for MARKETING-ADS-EXECUTION-01: the executor will read
 * selectedAdAccountId from TenantAdsConfig to know which account to use.
 */
export interface AdsPlatformResource {
  /** Stable internal ID (cuid or UUID). */
  id:          string;
  /** External ID as returned by the platform API. */
  externalId:  string;
  /** Platform that owns this resource. */
  platform:    string;
  /** What kind of resource this is. */
  type:        AdsPlatformResourceType;
  /** Display name for UI rendering. */
  displayName: string;
  /** Platform-reported status (e.g. "active", "disabled"). */
  status:      string;
  /** Whether this resource is the currently selected one for this type. */
  selected:    boolean;
  /** Safe metadata key-value pairs — never includes credentials. */
  metadata:    Record<string, string>;
}

// ── Discovery status ───────────────────────────────────────────────────────────

export type AdsDiscoveryStatus =
  | "ready"                   // resources found
  | "empty"                   // connected but no resources returned
  | "insufficient_permissions"// connected but missing scopes
  | "not_configured"          // no credentials for this platform
  | "error";                  // unexpected failure

/** Discovery result for a single platform. */
export interface AdsPlatformDiscoveryResult {
  platform:    string;
  status:      AdsDiscoveryStatus;
  resources:   AdsPlatformResource[];
  discoveredAt: string; // ISO timestamp
  /** User-facing message (never includes secret values). */
  message?:    string;
}

/** Aggregated discovery result for all configured platforms. */
export interface AdsAccountsDiscoveryResult {
  platforms:    AdsPlatformDiscoveryResult[];
  discoveredAt: string;
}

// ── Tenant config (selections) ────────────────────────────────────────────────

/**
 * Saved resource selections for one platform — derived from TenantAdsConfig Prisma model.
 * Safe to pass RSC → client. Contains only external IDs and display names.
 */
export interface TenantAdsConfigData {
  id:            string;
  platform:      string; // "meta" | "tiktok" | "google"

  selectedAdAccountId:          string | null;
  selectedAdAccountName:        string | null;
  selectedBusinessId:           string | null;
  selectedBusinessName:         string | null;
  selectedPageId:               string | null;
  selectedPageName:             string | null;
  selectedInstagramAccountId:   string | null;
  selectedInstagramAccountName: string | null;
  selectedAdvertiserId:         string | null;
  selectedAdvertiserName:       string | null;

  lastDiscoveredAt: string | null; // ISO timestamp
  updatedAt:        string;        // ISO timestamp
}

// ── API response shape ─────────────────────────────────────────────────────────

/** Response from GET /api/orgs/[orgSlug]/marketing-studio/ads/accounts */
export interface AdsAccountsApiResponse {
  /** Currently saved selections per platform. */
  config:     TenantAdsConfigData[];
  /** Live discovery result — present when discovery was triggered. */
  discovery?: AdsAccountsDiscoveryResult;
}

// ── Save input ─────────────────────────────────────────────────────────────────

/** Request body for PUT /api/orgs/[orgSlug]/marketing-studio/ads/accounts */
export interface SaveAdsSelectionInput {
  platform:    string;

  selectedAdAccountId?:          string | null;
  selectedAdAccountName?:        string | null;
  selectedBusinessId?:           string | null;
  selectedBusinessName?:         string | null;
  selectedPageId?:               string | null;
  selectedPageName?:             string | null;
  selectedInstagramAccountId?:   string | null;
  selectedInstagramAccountName?: string | null;
  selectedAdvertiserId?:         string | null;
  selectedAdvertiserName?:       string | null;
}
