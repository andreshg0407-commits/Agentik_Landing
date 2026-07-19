/**
 * lib/marketing-studio/catalogs/catalog-definition-repository.ts
 *
 * MARKETING-STUDIO-CATALOG-BUILDER-01 — Catalog Definition Repository
 *
 * All Prisma CRUD operations for CatalogDefinition.
 * SERVER ONLY — never import from client components.
 *
 * ── DESIGN ────────────────────────────────────────────────────────────────────
 *   - All ops are organizationId-scoped
 *   - filters JSON is serialized/deserialized as CatalogFilterRule[]
 *   - No partial returns — always returns full CatalogDefinitionRecord
 */

import { prisma }                from "@/lib/prisma";
import type {
  CatalogDefinitionRecord,
  CatalogDefinitionStatus,
  CatalogFilterRule,
  CatalogGroupBy,
  CatalogLayout,
  CatalogSortField,
  CatalogTemplateKey,
  CategorySortMode,
  CreateCatalogDefinitionInput,
  PricingMode,
  CtaMode,
  SortDirection,
  UpdateCatalogDefinitionInput,
} from "./catalog-definition-types";

// ── Row mapper ────────────────────────────────────────────────────────────────

function mapRecord(row: {
  id:              string;
  organizationId:  string;
  name:            string;
  description:     string | null;
  status:          string;
  filters:         unknown;
  sortField:       string;
  sortDirection:   string;
  groupBy:         string | null;
  pricingMode:     string;
  ctaMode:         string;
  whatsAppPhone:   string | null;
  layout:          string;
  groupByCategory: boolean;
  categorySort:    string;
  categoryOrder:   unknown;
  templateKey?:    string;  // optional until prisma generate is run
  createdAt:       Date;
  updatedAt:       Date;
  createdBy:       string | null;
}): CatalogDefinitionRecord {
  return {
    id:              row.id,
    organizationId:  row.organizationId,
    name:            row.name,
    description:     row.description,
    status:          row.status as CatalogDefinitionStatus,
    filters:         Array.isArray(row.filters) ? (row.filters as CatalogFilterRule[]) : [],
    sortField:       row.sortField as CatalogSortField,
    sortDirection:   row.sortDirection as SortDirection,
    groupBy:         (row.groupBy ?? null) as CatalogGroupBy,
    pricingMode:     row.pricingMode as PricingMode,
    ctaMode:         row.ctaMode as CtaMode,
    whatsAppPhone:   row.whatsAppPhone,
    layout:          (row.layout ?? "GRID_STANDARD") as CatalogLayout,
    groupByCategory: row.groupByCategory ?? true,
    categorySort:    (row.categorySort ?? "alphabetical") as CategorySortMode,
    categoryOrder:   Array.isArray(row.categoryOrder) ? (row.categoryOrder as string[]) : [],
    templateKey:     (row.templateKey ?? "retail") as CatalogTemplateKey,
    createdAt:       row.createdAt,
    updatedAt:       row.updatedAt,
    createdBy:       row.createdBy,
  };
}

// ── Read ──────────────────────────────────────────────────────────────────────

export async function listCatalogDefinitions(
  organizationId: string,
  statusFilter?: CatalogDefinitionStatus,
): Promise<CatalogDefinitionRecord[]> {
  const rows = await prisma.catalogDefinition.findMany({
    where: {
      organizationId,
      ...(statusFilter ? { status: statusFilter } : {}),
    },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (rows as any[]).map(mapRecord);
}

export async function getCatalogDefinition(
  organizationId: string,
  catalogId:      string,
): Promise<CatalogDefinitionRecord | null> {
  const row = await prisma.catalogDefinition.findFirst({
    where: { id: catalogId, organizationId },
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return row ? mapRecord(row as any) : null;
}

// ── Create ────────────────────────────────────────────────────────────────────

export async function createCatalogDefinition(
  input: CreateCatalogDefinitionInput,
): Promise<CatalogDefinitionRecord> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const row = await (prisma.catalogDefinition.create as any)({
    data: {
      organizationId:  input.organizationId,
      name:            input.name,
      description:     input.description   ?? null,
      status:          input.status        ?? "draft",
      filters:         (input.filters      ?? []) as object[],
      sortField:       input.sortField     ?? "sortOrder",
      sortDirection:   input.sortDirection ?? "asc",
      groupBy:         input.groupBy       ?? null,
      pricingMode:     input.pricingMode   ?? "with_prices",
      ctaMode:         input.ctaMode       ?? "none",
      whatsAppPhone:   input.whatsAppPhone ?? null,
      layout:          input.layout        ?? "GRID_STANDARD",
      groupByCategory: input.groupByCategory ?? true,
      categorySort:    input.categorySort  ?? "alphabetical",
      categoryOrder:   (input.categoryOrder ?? []) as string[],
      templateKey:     input.templateKey   ?? "retail",
      createdBy:       input.createdBy     ?? null,
    },
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return mapRecord(row as any);
}

// ── Update ────────────────────────────────────────────────────────────────────

export async function updateCatalogDefinition(
  organizationId: string,
  catalogId:      string,
  input:          UpdateCatalogDefinitionInput,
): Promise<CatalogDefinitionRecord | null> {
  const existing = await prisma.catalogDefinition.findFirst({
    where: { id: catalogId, organizationId },
  });
  if (!existing) return null;

  const data: Record<string, unknown> = { updatedAt: new Date() };
  if (input.name          !== undefined) data.name          = input.name;
  if (input.description   !== undefined) data.description   = input.description;
  if (input.status        !== undefined) data.status        = input.status;
  if (input.filters       !== undefined) data.filters       = input.filters as object[];
  if (input.sortField     !== undefined) data.sortField     = input.sortField;
  if (input.sortDirection !== undefined) data.sortDirection = input.sortDirection;
  if (input.groupBy       !== undefined) data.groupBy       = input.groupBy;
  if (input.pricingMode    !== undefined) data.pricingMode    = input.pricingMode;
  if (input.ctaMode        !== undefined) data.ctaMode        = input.ctaMode;
  if (input.whatsAppPhone  !== undefined) data.whatsAppPhone  = input.whatsAppPhone;
  if (input.layout         !== undefined) data.layout         = input.layout;
  if (input.groupByCategory !== undefined) data.groupByCategory = input.groupByCategory;
  if (input.categorySort   !== undefined) data.categorySort   = input.categorySort;
  if (input.categoryOrder  !== undefined) data.categoryOrder  = input.categoryOrder as string[];
  if (input.templateKey    !== undefined) data.templateKey    = input.templateKey;

  const row = await prisma.catalogDefinition.update({
    where: { id: catalogId },
    data,
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return mapRecord(row as any);
}

// ── Duplicate ─────────────────────────────────────────────────────────────────

export async function duplicateCatalogDefinition(
  organizationId: string,
  catalogId:      string,
  newName:        string,
  createdBy?:     string,
): Promise<CatalogDefinitionRecord | null> {
  const source = await getCatalogDefinition(organizationId, catalogId);
  if (!source) return null;

  return createCatalogDefinition({
    organizationId,
    name:          newName,
    description:   source.description,
    status:        "draft",
    filters:       source.filters,
    sortField:     source.sortField,
    sortDirection: source.sortDirection,
    groupBy:       source.groupBy,
    pricingMode:     source.pricingMode,
    ctaMode:         source.ctaMode,
    whatsAppPhone:   source.whatsAppPhone,
    layout:          source.layout,
    groupByCategory: source.groupByCategory,
    categorySort:    source.categorySort,
    categoryOrder:   source.categoryOrder,
    templateKey:     source.templateKey,
    createdBy:       createdBy ?? null,
  });
}

// ── Delete ────────────────────────────────────────────────────────────────────

export async function deleteCatalogDefinition(
  organizationId: string,
  catalogId:      string,
): Promise<boolean> {
  const result = await prisma.catalogDefinition.deleteMany({
    where: { id: catalogId, organizationId },
  });
  return result.count > 0;
}
