/**
 * lib/marketing-studio/commerce/shopify-publish-types.ts
 *
 * SHOPIFY-EXPERIENCIAS-04 — Publication Model
 *
 * Domain types for publishing landing drafts to Shopify.
 * Safe for RSC -> client boundary (all plain JSON values).
 */

// ── Sync status ──────────────────────────────────────────────────────────────

export type PublicationSyncStatus =
  | "pending"
  | "published"
  | "updated"
  | "failed"
  | "archived";

export const PUBLICATION_SYNC_LABEL: Record<PublicationSyncStatus, string> = {
  pending:   "Pendiente",
  published: "Publicado",
  updated:   "Actualizado",
  failed:    "Error",
  archived:  "Archivado",
};

export const PUBLICATION_SYNC_COLOR: Record<PublicationSyncStatus, string> = {
  pending:   "#94a3b8",
  published: "#22c55e",
  updated:   "#3b82f6",
  failed:    "#ef4444",
  archived:  "#94a3b8",
};

// ── Publication record ───────────────────────────────────────────────────────

export interface ShopifyPublishedExperience {
  id:               string;
  orgId:            string;
  draftId:          string;
  productId:        string;
  productName:      string;
  shopifyPageId:    string | null;
  shopifyHandle:    string | null;
  publicationType:  "landing";
  publishedAt:      string;
  publishedBy:      string;
  lastSyncAt:       string;
  syncStatus:       PublicationSyncStatus;
  lastError:        string | null;
  version:          number;
}

// ── Publication history entry ────────────────────────────────────────────────

export interface PublicationHistoryEntry {
  id:           string;
  draftId:      string;
  productName:  string;
  action:       "publish" | "update" | "unpublish";
  result:       "ok" | "error";
  error:        string | null;
  version:      number;
  publishedBy:  string;
  publishedAt:  string;
  durationMs:   number;
}

// ── Publish request / result ─────────────────────────────────────────────────

export interface PublishLandingRequest {
  orgId:     string;
  draftId:   string;
  userId:    string;
  /** "update" to overwrite existing, "new" to create new version */
  mode:      "update" | "new";
}

export interface PublishLandingResult {
  ok:           boolean;
  publication:  ShopifyPublishedExperience | null;
  error:        string | null;
  durationMs:   number;
}

// ── Existing landing check ───────────────────────────────────────────────────

export interface ExistingLandingCheck {
  exists:       boolean;
  publication:  ShopifyPublishedExperience | null;
}
