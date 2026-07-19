/**
 * lib/marketing-studio/catalogs/catalog-public-link-types.ts
 *
 * MARKETING-STUDIO-CATALOG-PUBLIC-LINKS-01 — Public Link Domain Types
 *
 * ── DESIGN ────────────────────────────────────────────────────────────────────
 *   - CatalogPublicLink is a reference to a CatalogDefinition — NOT a copy
 *   - Products are never stored; always resolved at view time
 *   - PublicCatalogView is the security-safe shape for public rendering
 *     (no organizationId, no createdBy, no admin metadata)
 *   - No Prisma imports in this file
 */

import type {
  CatalogLayout,
  CatalogTemplateKey,
  CategorySortMode,
  CtaMode,
  PricingMode,
} from "./catalog-definition-types";
import type { CatalogLayoutResult } from "./catalog-layout-engine";

// ── Public Link Record ────────────────────────────────────────────────────────

export interface CatalogPublicLinkRecord {
  id:             string;
  catalogId:      string;
  organizationId: string;
  slug:           string;
  isActive:       boolean;
  createdAt:      Date;
  updatedAt:      Date;
  createdBy:      string | null;
  expiresAt:      Date | null;
  accessCount:    number;
  lastAccessAt:   Date | null;
}

// ── Derived state ─────────────────────────────────────────────────────────────

export type PublicLinkStatus =
  | "not_published"  // no link exists
  | "active"         // link exists, isActive=true, not expired
  | "inactive"       // link exists, isActive=false
  | "expired";       // link exists, isActive=true, expiresAt < now

export function resolvePublicLinkStatus(link: CatalogPublicLinkRecord | null): PublicLinkStatus {
  if (!link) return "not_published";
  if (!link.isActive) return "inactive";
  if (link.expiresAt && link.expiresAt < new Date()) return "expired";
  return "active";
}

export const PUBLIC_LINK_STATUS_LABELS: Record<PublicLinkStatus, string> = {
  not_published: "No publicado",
  active:        "Publicado",
  inactive:      "Desactivado",
  expired:       "Expirado",
};

// ── Input types ───────────────────────────────────────────────────────────────

export interface CreatePublicLinkInput {
  catalogId:      string;
  organizationId: string;
  createdBy?:     string | null;
  expiresAt?:     Date | null;
}

export interface UpdatePublicLinkInput {
  isActive?:   boolean;
  expiresAt?:  Date | null;
  regenerate?: boolean;  // if true, generates a new slug (old one stops working)
}

// ── Security-safe public view ─────────────────────────────────────────────────

/**
 * PublicCatalogView — the ONLY shape that reaches the public page and API.
 *
 * Never includes:
 *   - organizationId (internal DB identifier)
 *   - catalogId (internal DB identifier)
 *   - createdBy (email / user data)
 *   - admin metadata (filters, groupBy config details)
 *   - draft products
 *
 * Safe to render for anonymous public users.
 */
export interface PublicCatalogView {
  // ── Catalog identity ────────────────────────────────────────────────────────
  catalogName:        string;
  catalogDescription: string | null;

  // ── Org identity (display name only) ────────────────────────────────────────
  orgDisplayName:     string;

  // ── Catalog config (needed by renderer) ─────────────────────────────────────
  layout:             CatalogLayout;
  groupByCategory:    boolean;
  categorySort:       CategorySortMode;
  categoryOrder:      string[];
  pricingMode:        PricingMode;
  ctaMode:            CtaMode;
  whatsAppPhone:      string | null;
  templateKey:        CatalogTemplateKey;

  // ── Resolved products ────────────────────────────────────────────────────────
  layoutResult:       CatalogLayoutResult;

  // ── Link metadata (public-safe) ─────────────────────────────────────────────
  linkSlug:           string;
  linkStatus:         PublicLinkStatus;
  catalogUpdatedAt:   Date;
}
