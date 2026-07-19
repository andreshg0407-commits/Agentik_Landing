/**
 * lib/marketing-studio/commerce/commerce-types.ts
 *
 * MS-09A — Commerce Domain Layer
 *
 * Channel-agnostic commerce types and enums.
 * Shopify is the first implementation destination, but the architecture
 * supports TikTok Shop, Meta Catalog, WhatsApp Commerce, MercadoLibre, etc.
 *
 * ── GOVERNANCE ────────────────────────────────────────────────────────────────
 *   All enums follow MS-05F pattern (as const objects).
 *   No UI imports, no Prisma imports, no side effects.
 */

// ── Commerce destination ───────────────────────────────────────────────────────

export const COMMERCE_DESTINATION = {
  SHOPIFY:          "shopify",
  WHATSAPP_CATALOG: "whatsapp_catalog",
  META_CATALOG:     "meta_catalog",
  TIKTOK_SHOP:      "tiktok_shop",
  LANDING_STORE:    "landing_store",
  CUSTOM_API:       "custom_api",
} as const;
export type CommerceDestination = typeof COMMERCE_DESTINATION[keyof typeof COMMERCE_DESTINATION];

export const DESTINATION_LABEL: Record<CommerceDestination, string> = {
  shopify:          "Shopify",
  whatsapp_catalog: "WhatsApp Catalog",
  meta_catalog:     "Meta Catalog",
  tiktok_shop:      "TikTok Shop",
  landing_store:    "Landing Store",
  custom_api:       "API personalizada",
};

// ── Publication status ─────────────────────────────────────────────────────────

export const PUBLICATION_STATUS = {
  DRAFT:     "draft",
  QUEUED:    "queued",
  SYNCING:   "syncing",
  PUBLISHED: "published",
  PARTIAL:   "partial",
  FAILED:    "failed",
  ARCHIVED:  "archived",
  PAUSED:    "paused",
} as const;
export type PublicationStatus = typeof PUBLICATION_STATUS[keyof typeof PUBLICATION_STATUS];

export const PUBLICATION_STATUS_LABEL: Record<PublicationStatus, string> = {
  draft:     "Borrador",
  queued:    "En cola",
  syncing:   "Sincronizando",
  published: "Publicado",
  partial:   "Parcial",
  failed:    "Fallido",
  archived:  "Archivado",
  paused:    "Pausado",
};

// ── Sync health ────────────────────────────────────────────────────────────────

export const SYNC_HEALTH = {
  HEALTHY:      "healthy",
  WARNING:      "warning",
  CRITICAL:     "critical",
  DISCONNECTED: "disconnected",
} as const;
export type SyncHealth = typeof SYNC_HEALTH[keyof typeof SYNC_HEALTH];

export const SYNC_HEALTH_LABEL: Record<SyncHealth, string> = {
  healthy:      "Saludable",
  warning:      "Advertencia",
  critical:     "Crítico",
  disconnected: "Desconectado",
};

// ── Sync action type ───────────────────────────────────────────────────────────

export const SYNC_ACTION_TYPE = {
  CREATE:    "create",
  UPDATE:    "update",
  DELETE:    "delete",
  RETRY:     "retry",
  REPUBLISH: "republish",
  ARCHIVE:   "archive",
} as const;
export type SyncActionType = typeof SYNC_ACTION_TYPE[keyof typeof SYNC_ACTION_TYPE];

// ── Issue severity ─────────────────────────────────────────────────────────────

export const ISSUE_SEVERITY = {
  BLOCKING: "blocking",
  WARNING:  "warning",
  INFO:     "info",
} as const;
export type IssueSeverity = typeof ISSUE_SEVERITY[keyof typeof ISSUE_SEVERITY];

// ── Core interfaces ────────────────────────────────────────────────────────────

/** A specific issue blocking or warning about a publication. */
export interface PublicationIssue {
  code:        string;
  severity:    IssueSeverity;
  label:       string;
  detail:      string;
  field?:      string;       // which product field is the culprit
  destination: CommerceDestination;
}

/** A single sync event record (timeline entry). */
export interface SyncEvent {
  id:          string;
  destination: CommerceDestination;
  action:      SyncActionType;
  status:      "success" | "failed" | "pending";
  occurredAt:  string;          // ISO string
  detail?:     string;
  retryCount?: number;
}

/** Per-destination sync state snapshot for a product. */
export interface CommerceSyncState {
  destination:   CommerceDestination;
  externalId:    string | null;
  syncHealth:    SyncHealth;
  lastSyncAt:    string | null;    // ISO string
  syncDriftDays: number | null;    // days since last successful sync
  retryCount:    number;
  issues:        PublicationIssue[];
}

/** Publication record for a product × destination pair. */
export interface PublicationRecord {
  productId:         string;
  destination:       CommerceDestination;
  publicationStatus: PublicationStatus;
  publishedAt:       string | null;
  publicationUrl:    string | null;
  externalId:        string | null;
}

/** Full snapshot of a product's publication state across all destinations. */
export interface PublicationSnapshot {
  productId:    string;
  productName:  string;
  destinations: Array<{
    destination:   CommerceDestination;
    publication:   PublicationRecord;
    sync:          CommerceSyncState;
  }>;
  overallHealth: SyncHealth;
}

/** What a commerce destination is capable of. */
export interface CommerceChannelCapabilities {
  destination:         CommerceDestination;
  supportsVariants:    boolean;
  supportsInventory:   boolean;
  supportsCollections: boolean;
  supportsSEO:         boolean;
  supportsScheduling:  boolean;
  requiredFields:      string[];
  optionalFields:      string[];
}

// ── Channel capability registry ────────────────────────────────────────────────

export const CHANNEL_CAPABILITIES: Record<CommerceDestination, CommerceChannelCapabilities> = {
  shopify: {
    destination:         "shopify",
    supportsVariants:    true,
    supportsInventory:   true,
    supportsCollections: true,
    supportsSEO:         true,
    supportsScheduling:  true,
    requiredFields:      ["name", "category", "sku"],
    optionalFields:      ["description", "price", "tags", "images"],
  },
  whatsapp_catalog: {
    destination:         "whatsapp_catalog",
    supportsVariants:    false,
    supportsInventory:   true,
    supportsCollections: false,
    supportsSEO:         false,
    supportsScheduling:  false,
    requiredFields:      ["name", "availability"],
    optionalFields:      ["description", "price", "image"],
  },
  meta_catalog: {
    destination:         "meta_catalog",
    supportsVariants:    true,
    supportsInventory:   true,
    supportsCollections: false,
    supportsSEO:         false,
    supportsScheduling:  false,
    requiredFields:      ["name", "category", "image"],
    optionalFields:      ["description", "price", "brand"],
  },
  tiktok_shop: {
    destination:         "tiktok_shop",
    supportsVariants:    true,
    supportsInventory:   true,
    supportsCollections: true,
    supportsSEO:         false,
    supportsScheduling:  false,
    requiredFields:      ["name", "category", "image", "price"],
    optionalFields:      ["description", "brand", "variants"],
  },
  landing_store: {
    destination:         "landing_store",
    supportsVariants:    true,
    supportsInventory:   false,
    supportsCollections: true,
    supportsSEO:         true,
    supportsScheduling:  false,
    requiredFields:      ["name", "description", "image"],
    optionalFields:      ["price", "category", "tags"],
  },
  custom_api: {
    destination:         "custom_api",
    supportsVariants:    true,
    supportsInventory:   true,
    supportsCollections: true,
    supportsSEO:         false,
    supportsScheduling:  false,
    requiredFields:      ["name"],
    optionalFields:      [],
  },
};
