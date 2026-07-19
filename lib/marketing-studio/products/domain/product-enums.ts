/**
 * lib/marketing-studio/products/domain/product-enums.ts
 *
 * MS-05F-B — Product Domain Enum Governance
 *
 * Single source of truth for all valid string values in the product domain.
 * Nothing uses inline magic strings. Everything imports from here.
 *
 * ── DESIGN ────────────────────────────────────────────────────────────────────
 *   Using `as const` objects instead of TypeScript enums for:
 *   - Tree-shakeable runtime values
 *   - Iterable constant arrays
 *   - Direct JSON serialization (no enum transform)
 *   - Prisma String field compatibility
 */

// ── ProductStatus ──────────────────────────────────────────────────────────────

export const ProductStatus = {
  PENDING:          "pending",
  APPROVED:         "approved",
  REJECTED:         "rejected",
  ARCHIVED:         "archived",
} as const;

export type ProductStatus = typeof ProductStatus[keyof typeof ProductStatus];

export const PRODUCT_STATUS_VALUES = Object.values(ProductStatus);

export const PRODUCT_STATUS_LABELS: Record<ProductStatus, string> = {
  pending:  "Pendiente",
  approved: "Aprobado",
  rejected: "Rechazado",
  archived: "Archivado",
};

// ── CommercialStatus ───────────────────────────────────────────────────────────

export const CommercialStatus = {
  ACTIVE:        "active",
  DRAFT:         "draft",
  DISCONTINUED:  "discontinued",
} as const;

export type CommercialStatus = typeof CommercialStatus[keyof typeof CommercialStatus];

export const COMMERCIAL_STATUS_VALUES = Object.values(CommercialStatus);

export const COMMERCIAL_STATUS_LABELS: Record<CommercialStatus, string> = {
  active:       "Activo",
  draft:        "Borrador",
  discontinued: "Descontinuado",
};

// ── UsagePermission ────────────────────────────────────────────────────────────

export const UsagePermission = {
  COMMERCIAL: "commercial",
  INTERNAL:   "internal",
  EDITORIAL:  "editorial",
  RESTRICTED: "restricted",
} as const;

export type UsagePermission = typeof UsagePermission[keyof typeof UsagePermission];

export const USAGE_PERMISSION_VALUES = Object.values(UsagePermission);

export const USAGE_PERMISSION_LABELS: Record<UsagePermission, string> = {
  commercial: "Comercial",
  internal:   "Interno",
  editorial:  "Editorial",
  restricted: "Restringido",
};

// ── SyncChannel ────────────────────────────────────────────────────────────────

export const SyncChannel = {
  SHOPIFY:  "shopify",
  CRM:      "crm",
  WHATSAPP: "whatsapp",
  CATALOG:  "catalog",
  ADS:      "ads",
  LANDING:  "landing",
} as const;

export type SyncChannel = typeof SyncChannel[keyof typeof SyncChannel];

export const SYNC_CHANNEL_VALUES = Object.values(SyncChannel);

export const SYNC_CHANNEL_LABELS: Record<SyncChannel, string> = {
  shopify:  "Shopify",
  crm:      "CRM",
  whatsapp: "WhatsApp",
  catalog:  "Catálogo",
  ads:      "Ads",
  landing:  "Landing",
};

// ── SyncStatus ─────────────────────────────────────────────────────────────────

export const SyncStatus = {
  PENDING:        "pending",
  SYNCED:         "synced",
  FAILED:         "failed",
  OUTDATED:       "outdated",
  NOT_CONFIGURED: "not_configured",
} as const;

export type SyncStatus = typeof SyncStatus[keyof typeof SyncStatus];

export const SYNC_STATUS_VALUES = Object.values(SyncStatus);

export const SYNC_STATUS_LABELS: Record<SyncStatus, string> = {
  pending:        "Pendiente",
  synced:         "Sincronizado",
  failed:         "Falló",
  outdated:       "Desactualizado",
  not_configured: "No configurado",
};

// ── PublicationStatus ──────────────────────────────────────────────────────────

export const PublicationStatus = {
  UNPUBLISHED: "unpublished",
  PUBLISHED:   "published",
  SCHEDULED:   "scheduled",
  PAUSED:      "paused",
  ARCHIVED:    "archived",
} as const;

export type PublicationStatus = typeof PublicationStatus[keyof typeof PublicationStatus];

export const PUBLICATION_STATUS_VALUES = Object.values(PublicationStatus);

export const PUBLICATION_STATUS_LABELS: Record<PublicationStatus, string> = {
  unpublished: "Sin publicar",
  published:   "Publicado",
  scheduled:   "Programado",
  paused:      "Pausado",
  archived:    "Archivado",
};

// ── ProductAssetRole ───────────────────────────────────────────────────────────

export const ProductAssetRole = {
  HERO:     "hero",
  GALLERY:  "gallery",
  SWATCH:   "swatch",
  VIDEO:    "video",
  DOCUMENT: "document",
} as const;

export type ProductAssetRole = typeof ProductAssetRole[keyof typeof ProductAssetRole];

export const PRODUCT_ASSET_ROLE_VALUES = Object.values(ProductAssetRole);

export const PRODUCT_ASSET_ROLE_LABELS: Record<ProductAssetRole, string> = {
  hero:     "Principal",
  gallery:  "Galería",
  swatch:   "Muestra",
  video:    "Video",
  document: "Documento",
};

// ── ProductEventType ───────────────────────────────────────────────────────────

export const ProductEventType = {
  PRODUCT_CREATED:            "PRODUCT_CREATED",
  PRODUCT_APPROVED:           "PRODUCT_APPROVED",
  PRODUCT_UPDATED:            "PRODUCT_UPDATED",
  PRODUCT_ATTRIBUTE_UPDATED:  "PRODUCT_ATTRIBUTE_UPDATED",
  PRODUCT_VARIANT_CREATED:    "PRODUCT_VARIANT_CREATED",
  PRODUCT_CHANNEL_ENABLED:    "PRODUCT_CHANNEL_ENABLED",
  PRODUCT_READINESS_CHANGED:  "PRODUCT_READINESS_CHANGED",
  PRODUCT_SYNC_FAILED:        "PRODUCT_SYNC_FAILED",
  PRODUCT_PUBLISHED:          "PRODUCT_PUBLISHED",
  PRODUCT_ASSET_LINKED:       "PRODUCT_ASSET_LINKED",
} as const;

export type ProductEventType = typeof ProductEventType[keyof typeof ProductEventType];

export const PRODUCT_EVENT_TYPE_VALUES = Object.values(ProductEventType);

// ── ReadinessLevel ─────────────────────────────────────────────────────────────

export const ReadinessLevel = {
  READY:    "ready",
  PARTIAL:  "partial",
  NOT_READY: "not_ready",
} as const;

export type ReadinessLevel = typeof ReadinessLevel[keyof typeof ReadinessLevel];

export const READINESS_LEVEL_VALUES = Object.values(ReadinessLevel);

export const READINESS_LEVEL_LABELS: Record<ReadinessLevel, string> = {
  ready:     "Listo",
  partial:   "Parcial",
  not_ready: "No listo",
};

// ── PropagationJobStatus ───────────────────────────────────────────────────────

export const PropagationJobStatus = {
  PENDING:   "pending",
  RUNNING:   "running",
  COMPLETED: "completed",
  FAILED:    "failed",
  CANCELLED: "cancelled",
} as const;

export type PropagationJobStatus = typeof PropagationJobStatus[keyof typeof PropagationJobStatus];

export const PROPAGATION_JOB_STATUS_VALUES = Object.values(PropagationJobStatus);

// ── AttributeValueType ─────────────────────────────────────────────────────────

export const AttributeValueType = {
  TEXT:        "text",
  NUMBER:      "number",
  BOOLEAN:     "boolean",
  SELECT:      "select",
  MULTISELECT: "multiselect",
  DIMENSION:   "dimension",
  COLOR:       "color",
} as const;

export type AttributeValueType = typeof AttributeValueType[keyof typeof AttributeValueType];

export const ATTRIBUTE_VALUE_TYPE_VALUES = Object.values(AttributeValueType);

// ── AssetSourceType ────────────────────────────────────────────────────────────
// Used by ProductAssetLink.sourceType for provenance tracking.

export const AssetSourceType = {
  AI_GENERATED:   "ai_generated",
  MANUAL_UPLOAD:  "manual_upload",
  EXTERNAL:       "external",
} as const;

export type AssetSourceType = typeof AssetSourceType[keyof typeof AssetSourceType];
