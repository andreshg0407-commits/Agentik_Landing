/**
 * lib/comercial/maletas/assortment-catalog/mallet-assortment-catalog.ts
 *
 * Multi-tenant assortment catalog registry.
 * In-memory store — same pattern as Business Policy Engine.
 *
 * Sprint: CASTILLITOS-MALLET-POLICIES-01
 */

import type {
  MalletAssortmentCatalog,
  CatalogRegistryEntry,
  CatalogListFilter,
  CatalogValidationResult,
} from "./mallet-assortment-types";

import { validateCatalog } from "./mallet-assortment-validation";

import {
  buildCastillitosTextilCatalog,
  buildLatinKidsTextilCatalog,
  buildImportAccesoriosCatalog,
} from "./castillitos-mallet-assortment-catalog";

// ── In-memory store ─────────────────────────────────────────────────────────

const catalogStore = new Map<string, CatalogRegistryEntry>();

// ── Seed default catalogs ───────────────────────────────────────────────────

function seedCastillitosCatalogs(): void {
  const catalogs = [
    buildCastillitosTextilCatalog(),
    buildLatinKidsTextilCatalog(),
    buildImportAccesoriosCatalog(),
  ];
  for (const catalog of catalogs) {
    if (!catalogStore.has(catalog.catalogId)) {
      catalogStore.set(catalog.catalogId, {
        catalog,
        registeredAt: new Date(),
      });
    }
  }
}

// Auto-seed on module load
seedCastillitosCatalogs();

// ── Public API ──────────────────────────────────────────────────────────────

export interface RegisterCatalogResult {
  readonly success: boolean;
  readonly catalog: MalletAssortmentCatalog;
  readonly validation: CatalogValidationResult;
}

export function registerCatalog(
  catalog: MalletAssortmentCatalog,
): RegisterCatalogResult {
  const validation = validateCatalog(catalog);
  if (!validation.valid) {
    return { success: false, catalog, validation };
  }

  if (catalogStore.has(catalog.catalogId)) {
    return {
      success: false,
      catalog,
      validation: {
        valid: false,
        issues: [
          {
            field: "catalogId",
            message: `Catalog ${catalog.catalogId} already registered`,
            severity: "ERROR",
          },
        ],
      },
    };
  }

  catalogStore.set(catalog.catalogId, {
    catalog,
    registeredAt: new Date(),
  });

  return { success: true, catalog, validation };
}

export function getCatalog(
  catalogId: string,
): MalletAssortmentCatalog | null {
  return catalogStore.get(catalogId)?.catalog ?? null;
}

export function listCatalogs(
  filter: CatalogListFilter,
): readonly MalletAssortmentCatalog[] {
  const results: MalletAssortmentCatalog[] = [];

  for (const entry of catalogStore.values()) {
    const c = entry.catalog;

    if (c.tenantId !== filter.tenantId) continue;
    if (filter.status && c.status !== filter.status) continue;
    if (filter.commercialWorld && c.commercialWorld !== filter.commercialWorld) continue;
    if (filter.brand !== undefined && c.brand !== filter.brand) continue;

    results.push(c);
  }

  return results;
}

export function resolveActiveCatalogs(
  tenantId: string,
): readonly MalletAssortmentCatalog[] {
  return listCatalogs({ tenantId, status: "ACTIVE" });
}

export function resolveCatalogForBrand(
  tenantId: string,
  brand: string | null,
  commercialWorld: string,
): MalletAssortmentCatalog | null {
  for (const entry of catalogStore.values()) {
    const c = entry.catalog;
    if (
      c.tenantId === tenantId &&
      c.status === "ACTIVE" &&
      c.commercialWorld === commercialWorld &&
      c.brand === brand
    ) {
      return c;
    }
  }
  return null;
}

export function _clearCatalogStore(): void {
  catalogStore.clear();
  seedCastillitosCatalogs();
}

export function _resetCatalogStore(): void {
  catalogStore.clear();
}
