/**
 * lib/marketing-studio/catalogs/catalog-public-link-repository.ts
 *
 * MARKETING-STUDIO-CATALOG-PUBLIC-LINKS-01 — Public Link Repository
 *
 * All Prisma CRUD for CatalogPublicLink.
 * SERVER ONLY — never import from client components.
 *
 * ── DESIGN ────────────────────────────────────────────────────────────────────
 *   - All org-scoped reads use organizationId to prevent cross-tenant leakage
 *   - getPublicCatalogView() is the single entry point for the public page
 *     and public API — it strips all internal fields before returning
 *   - Access tracking (accessCount, lastAccessAt) is updated on each public view
 *   - Slug generation: "cpl_" + 8 random alphanumeric chars (not guessable)
 */

import { prisma }               from "@/lib/prisma";
import { resolveCatalog }       from "./catalog-query-service";
import type {
  CatalogPublicLinkRecord,
  CreatePublicLinkInput,
  PublicCatalogView,
  UpdatePublicLinkInput,
}                               from "./catalog-public-link-types";
import { resolvePublicLinkStatus } from "./catalog-public-link-types";

// ── Slug generation ───────────────────────────────────────────────────────────

const SLUG_CHARS = "abcdefghijklmnopqrstuvwxyz0123456789";

function generateSlug(): string {
  let suffix = "";
  for (let i = 0; i < 8; i++) {
    suffix += SLUG_CHARS[Math.floor(Math.random() * SLUG_CHARS.length)];
  }
  return `cpl_${suffix}`;
}

async function generateUniqueSlug(): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const slug = generateSlug();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const existing = await (prisma as any).catalogPublicLink.findUnique({
      where: { slug },
      select: { id: true },
    });
    if (!existing) return slug;
  }
  // Fallback: use timestamp suffix
  return `cpl_${Date.now().toString(36)}`;
}

// ── Row mapper ────────────────────────────────────────────────────────────────

function mapRecord(row: {
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
}): CatalogPublicLinkRecord {
  return {
    id:             row.id,
    catalogId:      row.catalogId,
    organizationId: row.organizationId,
    slug:           row.slug,
    isActive:       row.isActive,
    createdAt:      row.createdAt,
    updatedAt:      row.updatedAt,
    createdBy:      row.createdBy,
    expiresAt:      row.expiresAt,
    accessCount:    row.accessCount,
    lastAccessAt:   row.lastAccessAt,
  };
}

// ── Read ──────────────────────────────────────────────────────────────────────

/** Returns all public links for a catalog (org-scoped). */
export async function listPublicLinksForCatalog(
  organizationId: string,
  catalogId:      string,
): Promise<CatalogPublicLinkRecord[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = await (prisma as any).catalogPublicLink.findMany({
    where: { organizationId, catalogId },
    orderBy: { createdAt: "desc" },
  });
  return rows.map(mapRecord);
}

/** Returns a single public link by id (org-scoped). */
export async function getPublicLink(
  organizationId: string,
  linkId:         string,
): Promise<CatalogPublicLinkRecord | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const row = await (prisma as any).catalogPublicLink.findFirst({
    where: { id: linkId, organizationId },
  });
  return row ? mapRecord(row) : null;
}

// ── Public view (security-safe) ───────────────────────────────────────────────

/**
 * getPublicCatalogView
 *
 * The single entry point for the public page and public API.
 * - Resolves the link by slug (never by internal ID)
 * - Validates isActive and expiresAt
 * - Increments accessCount + lastAccessAt
 * - Returns PublicCatalogView with NO internal identifiers
 *
 * Returns null if the link does not exist.
 * Returns a view with linkStatus="inactive" or "expired" for disabled links
 * (so the page can show an appropriate message).
 */
export async function getPublicCatalogView(
  slug: string,
): Promise<PublicCatalogView | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const linkRow = await (prisma as any).catalogPublicLink.findUnique({
    where: { slug },
    include: {
      catalog: {
        select: {
          id:              true,
          organizationId:  true,
          name:            true,
          description:     true,
          status:          true,
          filters:         true,
          sortField:       true,
          sortDirection:   true,
          groupBy:         true,
          pricingMode:     true,
          ctaMode:         true,
          whatsAppPhone:   true,
          layout:          true,
          groupByCategory: true,
          categorySort:    true,
          categoryOrder:   true,
          templateKey:     true,
          updatedAt:       true,
          organization: {
            select: { name: true },
          },
        },
      },
    },
  });

  if (!linkRow) return null;

  const link    = mapRecord(linkRow);
  const catalog = linkRow.catalog;
  const status  = resolvePublicLinkStatus(link);

  // Track access regardless of active/expired state
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (prisma as any).catalogPublicLink.update({
      where: { id: link.id },
      data: {
        accessCount:  { increment: 1 },
        lastAccessAt: new Date(),
      },
    });
  } catch {
    // Non-blocking — tracking failures must never break the public page
  }

  // For inactive/expired links: return stub view so the page can render the
  // appropriate message without doing a full product resolution
  if (status !== "active") {
    return {
      catalogName:        catalog.name,
      catalogDescription: catalog.description,
      orgDisplayName:     catalog.organization?.name ?? "",
      layout:             (catalog.layout ?? "GRID_STANDARD") as PublicCatalogView["layout"],
      groupByCategory:    catalog.groupByCategory ?? true,
      categorySort:       (catalog.categorySort ?? "alphabetical") as PublicCatalogView["categorySort"],
      categoryOrder:      Array.isArray(catalog.categoryOrder) ? catalog.categoryOrder : [],
      pricingMode:        (catalog.pricingMode ?? "with_prices") as PublicCatalogView["pricingMode"],
      ctaMode:            (catalog.ctaMode ?? "none") as PublicCatalogView["ctaMode"],
      whatsAppPhone:      catalog.whatsAppPhone ?? null,
      templateKey:        (catalog.templateKey ?? "retail") as PublicCatalogView["templateKey"],
      layoutResult:       { sections: [], totalCount: 0, hasUncategorized: false, categoryKeys: [] },
      linkSlug:           slug,
      linkStatus:         status,
      catalogUpdatedAt:   catalog.updatedAt,
    };
  }

  // Resolve products live from the catalog definition
  const resolved = await resolveCatalog(
    {
      id:              catalog.id,
      organizationId:  catalog.organizationId,
      name:            catalog.name,
      description:     catalog.description,
      status:          catalog.status,
      filters:         Array.isArray(catalog.filters) ? catalog.filters : [],
      sortField:       catalog.sortField,
      sortDirection:   catalog.sortDirection,
      groupBy:         catalog.groupBy ?? null,
      pricingMode:     catalog.pricingMode,
      ctaMode:         catalog.ctaMode,
      whatsAppPhone:   catalog.whatsAppPhone ?? null,
      layout:          catalog.layout ?? "GRID_STANDARD",
      groupByCategory: catalog.groupByCategory ?? true,
      categorySort:    catalog.categorySort ?? "alphabetical",
      categoryOrder:   Array.isArray(catalog.categoryOrder) ? catalog.categoryOrder : [],
      templateKey:     catalog.templateKey ?? "retail",
      createdAt:       new Date(),
      updatedAt:       catalog.updatedAt,
      createdBy:       null,
    },
    { limit: 500 },
  );

  return {
    catalogName:        catalog.name,
    catalogDescription: catalog.description,
    orgDisplayName:     catalog.organization?.name ?? "",
    layout:             resolved.layout,
    groupByCategory:    resolved.groupByCategory,
    categorySort:       resolved.categorySort,
    categoryOrder:      resolved.categoryOrder,
    pricingMode:        resolved.pricingMode,
    ctaMode:            catalog.ctaMode,
    whatsAppPhone:      catalog.whatsAppPhone ?? null,
    templateKey:        (catalog.templateKey ?? "retail") as PublicCatalogView["templateKey"],
    layoutResult:       resolved.layoutResult,
    linkSlug:           slug,
    linkStatus:         "active",
    catalogUpdatedAt:   catalog.updatedAt,
  };
}

// ── Create ────────────────────────────────────────────────────────────────────

export async function createPublicLink(
  input: CreatePublicLinkInput,
): Promise<CatalogPublicLinkRecord> {
  const slug = await generateUniqueSlug();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const row = await (prisma as any).catalogPublicLink.create({
    data: {
      catalogId:      input.catalogId,
      organizationId: input.organizationId,
      slug,
      isActive:       true,
      createdBy:      input.createdBy ?? null,
      expiresAt:      input.expiresAt ?? null,
    },
  });
  return mapRecord(row);
}

// ── Update ────────────────────────────────────────────────────────────────────

export async function updatePublicLink(
  organizationId: string,
  linkId:         string,
  input:          UpdatePublicLinkInput,
): Promise<CatalogPublicLinkRecord | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const existing = await (prisma as any).catalogPublicLink.findFirst({
    where: { id: linkId, organizationId },
  });
  if (!existing) return null;

  const data: Record<string, unknown> = { updatedAt: new Date() };

  if (input.isActive  !== undefined) data.isActive  = input.isActive;
  if (input.expiresAt !== undefined) data.expiresAt = input.expiresAt;
  if (input.regenerate) {
    data.slug = await generateUniqueSlug();
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const row = await (prisma as any).catalogPublicLink.update({
    where: { id: linkId },
    data,
  });
  return mapRecord(row);
}

// ── Delete ────────────────────────────────────────────────────────────────────

export async function deletePublicLink(
  organizationId: string,
  linkId:         string,
): Promise<boolean> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result = await (prisma as any).catalogPublicLink.deleteMany({
    where: { id: linkId, organizationId },
  });
  return result.count > 0;
}
