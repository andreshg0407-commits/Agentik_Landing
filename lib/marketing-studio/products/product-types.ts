/**
 * lib/marketing-studio/products/product-types.ts
 *
 * MS-05A / MS-05F — Product Entity Domain Types
 *
 * Core type system for the Product Intelligence layer.
 * A ProductEntity is a commercial product — it is NOT the same as a media asset.
 *
 * ── SEPARATION OF CONCERNS ────────────────────────────────────────────────────
 *   MediaAsset      = a generated image/video (GeneratedAsset in Prisma)
 *   ProductEntity   = the commercial product (this layer)
 *   ProductAssetLink = the bridge between them (1 product → N assets)
 *
 * ── IDENTITY CONVENTION ───────────────────────────────────────────────────────
 *   All entities use `organizationId` — never `orgId` or `tenantId`.
 *   Organization IS the tenant; no separate tenant dimension.
 *
 * ── ENUM GOVERNANCE ───────────────────────────────────────────────────────────
 *   All string union types are re-exported from domain/product-enums.ts.
 *   Nothing in this file defines inline string literals for status values.
 *
 * ── RULES ─────────────────────────────────────────────────────────────────────
 *   - No `any` types
 *   - No business logic
 *   - No Prisma imports
 *   - No inline magic strings for domain values
 */

// ── Re-export governed enum types ──────────────────────────────────────────────

export type {
  ProductStatus,
  CommercialStatus,
  UsagePermission,
  SyncChannel,
  SyncStatus,
  PublicationStatus,
  ProductAssetRole,
  ProductEventType,
  ReadinessLevel,
  PropagationJobStatus,
  AttributeValueType,
  AssetSourceType,
} from "./domain/product-enums";

// ── Attribute types ────────────────────────────────────────────────────────────

export type AttributeStoredValue = string | number | boolean | string[] | null;

/** Persisted attribute key-value for a product. */
export interface ProductAttributeRecord {
  id:             string;
  productId:      string;
  organizationId: string;
  key:            string;
  label:          string;
  valueText:      string | null;
  valueNumber:    number | null;
  valueBoolean:   boolean | null;
  valueJson:      string[] | null;  // used for multiselect
  type:           import("./domain/product-enums").AttributeValueType;
  destination:    string | null;    // SyncChannel target or null = all
  createdAt:      Date;
  updatedAt:      Date;
}

// ── Core entities ──────────────────────────────────────────────────────────────

import type {
  ProductStatus,
  CommercialStatus,
  UsagePermission,
  SyncChannel,
  SyncStatus,
  PublicationStatus,
  ProductAssetRole,
  ProductEventType,
  ReadinessLevel,
  PropagationJobStatus,
} from "./domain/product-enums";

/** The authoritative commercial product entity. */
export interface ProductEntity {
  id:             string;
  organizationId: string;

  version: number;

  // ── Commercial identity ──
  name:             string;
  sku:              string | null;
  category:         string | null;
  status:           ProductStatus;
  description:      string | null;
  price:            number | null;
  currency:         string;
  usagePermission:  UsagePermission;
  commercialStatus: CommercialStatus;

  // ── CRM enrichment ──
  crmName:       string | null;
  productLine:   string | null;
  segment:       string | null;
  salesArgument: string | null;
  availability:  string | null;
  notes:         string | null;

  // ── Persisted readiness snapshot ──
  readinessLevel:          ReadinessLevel;
  readinessScore:          number;
  readyDestinations:       SyncChannel[];
  partialDestinations:     SyncChannel[];
  blockedDestinations:     SyncChannel[];
  lastReadinessComputedAt: Date | null;

  // ── Relations ──
  variants:         ProductVariant[];
  attributes:       ProductAttributeRecord[];
  assetLinks:       ProductAssetLink[];
  syncStates:       ProductSyncState[];
  publicationStates: ProductPublicationState[];
  activities:       ProductActivityEvent[];

  // ── Audit ──
  approvedAt: Date | null;
  approvedBy: string | null;
  createdAt:  Date;
  updatedAt:  Date;
}

/** A size / color / format variant of a ProductEntity. */
export interface ProductVariant {
  id:             string;
  productId:      string;
  organizationId: string;
  sku:            string | null;
  name:           string;
  /** Discriminating attribute key-value snapshot. */
  attributes:     Record<string, string | number | boolean>;
  status:         "active" | "inactive" | "discontinued";
  createdAt:      Date;
  updatedAt:      Date;
}

/** Bridge between a ProductEntity and a GeneratedAsset. */
export interface ProductAssetLink {
  id:             string;
  productId:      string;
  organizationId: string;
  assetId:        string;
  role:           ProductAssetRole;
  // ── Provenance ──
  sourceType:        import("./domain/product-enums").AssetSourceType | null;
  sourceGenerationId: string | null;
  sourceProvider:    string | null;
  generatedBy:       string | null;
  generationIntent:  string | null;
  createdAt:         Date;
}

/** Per-channel sync state (data synchronization lifecycle). */
export interface ProductSyncState {
  id:             string;
  productId:      string;
  organizationId: string;
  channel:        SyncChannel;
  status:         SyncStatus;
  externalId:     string | null;
  lastSyncAt:     Date | null;
  lastErrorAt:    Date | null;
  errorMessage:   string | null;
  version:        number;
  updatedAt:      Date;
}

/** Per-channel publication state (publication lifecycle — separate from sync). */
export interface ProductPublicationState {
  id:                      string;
  productId:               string;
  organizationId:          string;
  channel:                 SyncChannel;
  publicationStatus:       PublicationStatus;
  publishedAt:             Date | null;
  lastPublicationAttemptAt: Date | null;
  externalPublicationId:   string | null;
  publicationUrl:          string | null;
  errorMessage:            string | null;
  version:                 number;
  createdAt:               Date;
  updatedAt:               Date;
}

/** A single immutable audit event on a product. */
export interface ProductActivityEvent {
  id:             string;
  productId:      string;
  organizationId: string;
  eventType:      ProductEventType;
  actorId:        string | null;
  actorLabel:     string | null;
  payload:        Record<string, unknown>;
  occurredAt:     Date;
}

// ── Readiness ──────────────────────────────────────────────────────────────────

export interface ChannelReadiness {
  channel:  SyncChannel;
  label:    string;
  status:   ReadinessLevel;
  missing:  string[];
}

export interface ProductReadinessState {
  productId:    string;
  destinations: ChannelReadiness[];
  readyCount:   number;
  partialCount: number;
  totalEnabled: number;
  score:        number;
  computedAt:   Date;
}

// ── Propagation ────────────────────────────────────────────────────────────────

export interface PropagationJob {
  id:             string;
  organizationId: string;
  productId:      string;
  eventType:      ProductEventType;
  channel:        SyncChannel;
  status:         PropagationJobStatus;
  priority:       number;
  payload:        Record<string, unknown> | null;
  scheduledAt:    Date;
  startedAt:      Date | null;
  completedAt:    Date | null;
  retryCount:     number;
  lastError:      string | null;
  createdAt:      Date;
  updatedAt:      Date;
}

// ── Input/output shapes for server actions ─────────────────────────────────────

/** Form data sent by ApprovalMetadataPanel when confirming approval. */
export interface ApprovalFormInput {
  assetId:          string;
  organizationId:   string;   // canonical field name (was orgId + tenantId)
  channels:         string[];
  // Minimal metadata
  commercialName:   string;
  category:         string;
  sku:              string;
  usagePermission:  string;
  commercialStatus: string;
  shortDescription: string;
  price:            string;
  // CRM
  crmName:          string;
  productLine:      string;
  segment:          string;
  salesArgument:    string;
  availability:     string;
  notes:            string;
  // Dynamic attributes (key → value)
  dynamicAttributes: Record<string, string>;
  // Asset provenance (optional — populated by BibliotecaClient)
  assetSourceType?:    string;
  assetSourceProvider?: string;
}

export interface ApprovalResult {
  success:    boolean;
  productId?: string;
  error?:     string;
  retryable?: boolean;
}

export interface AttributeUpdateInput {
  productId:      string;
  organizationId: string;
  key:            string;
  label:          string;
  value:          AttributeStoredValue;
  type:           import("./domain/product-enums").AttributeValueType;
  destination?:   string;
}
