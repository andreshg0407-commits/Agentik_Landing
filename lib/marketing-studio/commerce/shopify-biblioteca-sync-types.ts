/**
 * lib/marketing-studio/commerce/shopify-biblioteca-sync-types.ts
 *
 * SHOPIFY-EXPERIENCIAS-06 — Biblioteca Sync Types
 *
 * Domain types for the Biblioteca → Commerce sync engine.
 * Safe for RSC -> client boundary (all plain JSON values).
 *
 * Multi-platform ready: types are platform-agnostic.
 * ShopifyExperienceSyncProvider is the first implementation.
 */

import type { ExperienceReadiness } from "./shopify-experiences-types";

// ── Sync events ──────────────────────────────────────────────────────────────

export type BibliotecaSyncEventType =
  | "image_approved"
  | "video_approved"
  | "video_archived"
  | "image_deleted"
  | "new_version_approved"
  | "reference_changed"
  | "main_asset_changed";

export interface BibliotecaSyncEvent {
  type:          BibliotecaSyncEventType;
  assetId:       string;
  referenceId:   string | null;
  sku:           string | null;
  tenantId:      string;
  timestamp:     string;
  userId:        string | null;
}

// ── Reference resolution ─────────────────────────────────────────────────────

export type ReferenceResolutionMethod =
  | "referenceId"
  | "sku"
  | "comercial_reference"
  | "tenant_alias";

export interface ResolvedReference {
  productId:   string;
  productName: string;
  method:      ReferenceResolutionMethod;
  confidence:  number;
}

// ── Primary assets per reference ─────────────────────────────────────────────

export interface ReferencePrimaryAssets {
  referenceId:     string;
  heroImage:       PrimaryAssetRef | null;
  mainVideo:       PrimaryAssetRef | null;
  recommendedBanner: PrimaryAssetRef | null;
  selectionMethod: "manual" | "auto";
}

export interface PrimaryAssetRef {
  assetId:    string;
  url:        string | null;
  assetType:  string;
  approvedAt: string | null;
}

// ── Availability snapshot ────────────────────────────────────────────────────

export interface ExperienceAvailabilitySnapshot {
  productId:     string;
  readiness:     ExperienceReadiness;
  assetQuality:  "full" | "basic" | "insufficient" | "none";
  photoCount:    number;
  videoCount:    number;
  evaluatedAt:   string;
  reasons:       string[];
  sourceVersion: number;
}

// ── Sync log entry ───────────────────────────────────────────────────────────

export interface SyncLogEntry {
  id:            string;
  timestamp:     string;
  tenantId:      string;
  referenceId:   string | null;
  productId:     string;
  productName:   string;
  previousState: ExperienceReadiness;
  newState:      ExperienceReadiness;
  reason:        string;
  triggeredBy:   string;
}

// ── Sync result ──────────────────────────────────────────────────────────────

export interface SyncResult {
  ok:            boolean;
  productsUpdated: number;
  stateChanges:  StateChange[];
  errors:        string[];
  durationMs:    number;
}

export interface StateChange {
  productId:     string;
  productName:   string;
  previousState: ExperienceReadiness;
  newState:      ExperienceReadiness;
  reason:        string;
}

// ── Sync summary ─────────────────────────────────────────────────────────────

export interface SyncSummary {
  lastSyncAt:         string;
  totalProducts:      number;
  readyCount:         number;
  partialCount:       number;
  missingAssetsCount: number;
  noMediaCount:       number;
  recentChanges:      StateChange[];
}

// ── Asset usage (for Biblioteca drawer) ──────────────────────────────────────

export interface AssetUsageRef {
  type:      "product" | "landing_published" | "landing_draft" | "banner";
  label:     string;
  entityId:  string;
  status:    string | null;
}

// ── Commerce sync provider interface ─────────────────────────────────────────

/**
 * Multi-platform sync provider.
 * First implementation: ShopifyExperienceSyncProvider.
 * Future: WooCommerce, Tiendanube, marketplaces.
 */
export interface CommerceExperienceSyncProvider {
  readonly platform: string;

  syncProductAssets(
    tenantId:    string,
    productId:   string,
  ): Promise<SyncResult>;

  syncReferenceAssets(
    tenantId:    string,
    referenceId: string,
  ): Promise<SyncResult>;

  recalculateAvailability(
    tenantId:    string,
    productIds:  string[],
  ): Promise<ExperienceAvailabilitySnapshot[]>;

  findProductsByReference(
    tenantId:    string,
    referenceId: string,
  ): Promise<ResolvedReference[]>;

  getAssetUsage(
    tenantId:    string,
    assetId:     string,
  ): Promise<AssetUsageRef[]>;

  getSyncSummary(
    tenantId:    string,
  ): Promise<SyncSummary>;
}

// ── Copilot signal from sync ─────────────────────────────────────────────────

export interface SyncCopilotSignal {
  category:  "upgrade" | "downgrade" | "info";
  message:   string;
  productId: string;
  timestamp: string;
}
