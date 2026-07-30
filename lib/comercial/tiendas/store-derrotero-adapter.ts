/**
 * lib/comercial/tiendas/store-derrotero-adapter.ts
 *
 * AGENTIK-STORES-DERROTERO-COVERAGE-FOUNDATION-01 — PRIMERO
 *
 * Adapter: transforms Maletas assortment catalogs into a Store Derrotero.
 * Reuses the SAME taxonomy (grupo + subgrupo from DERROTERO CS.xlsx,
 * subgrupo from DERROTERO LT, sizeClass from Import) but applies
 * store-specific quantity rules.
 *
 * ⚠️ SCOPE BOUNDARY (AGENTIK-DERROTERO-MEASUREMENT-SEMANTICS-01):
 * This adapter crosses from SALES_PORTFOLIO (maletas, measured in
 * REFERENCES) to STORE (tiendas, measured in UNITS). Only TAXONOMY
 * (grupos/subgrupos/sizeClass) may cross this boundary — measurement
 * targets from the mallet catalog (targetUnits = reference counts)
 * MUST NEVER be copied into store thresholds. The output re-declares
 * scope: "STORE" / measurementUnit: "UNITS".
 *
 * Key concepts (separated, not conflated):
 *   1. Coverage:  minimumCoverageReferences (default 1 — does the entry exist?)
 *   2. Quantity:  minUnitsPerRef / idealUnitsPerRef / maxUnitsPerRef (8/10/12 or 6/4/1)
 *   3. Variety:   NOT_EVALUATED until tenant defines limits per entry
 *
 * Pure function — no DB, no side effects.
 */

import type { MalletAssortmentCatalog, MalletAssortmentGroup, MalletAssortmentEntry } from "../maletas/assortment-catalog/mallet-assortment-types";
import {
  buildCastillitosTextilCatalog,
  buildLatinKidsTextilCatalog,
  buildImportAccesoriosCatalog,
} from "../maletas/assortment-catalog/castillitos-mallet-assortment-catalog";

import type { TextileCoverageConfig, AccessoryCoverageConfig } from "./store-policy-pack-config";
import {
  CASTILLITOS_TEXTILE_COVERAGE,
  LATIN_KIDS_TEXTILE_COVERAGE,
  CASTILLITOS_ACCESSORY_COVERAGE,
} from "./store-policy-pack-config";

import type {
  StoreDerrotero,
  StoreDerroteroGroup,
  StoreDerroteroEntry,
  StoreDerroteroLine,
  DerroteroMatchMode,
} from "./store-derrotero-types";

import type { StoreSizeClass } from "./store-policy-types";

// ── Config for the adapter ──────────────────────────────────────────────────

export interface StoreDerroteroAdapterConfig {
  /** Textile thresholds for Castillitos line */
  castillitosTextile: TextileCoverageConfig;
  /** Textile thresholds for Latin Kids line */
  latinKidsTextile: TextileCoverageConfig;
  /** Accessory thresholds by size class */
  accessory: AccessoryCoverageConfig;
  /** Minimum refs with stock > 0 to consider an entry covered (default 1) */
  minimumCoverageReferences: number;
}

const DEFAULT_CONFIG: StoreDerroteroAdapterConfig = {
  castillitosTextile: CASTILLITOS_TEXTILE_COVERAGE,
  latinKidsTextile: LATIN_KIDS_TEXTILE_COVERAGE,
  accessory: CASTILLITOS_ACCESSORY_COVERAGE,
  minimumCoverageReferences: 1,
};

// ── Main adapter function ───────────────────────────────────────────────────

/**
 * Build a Store Derrotero by adapting the 3 Maletas assortment catalogs
 * to the store context with store-specific quantity rules.
 *
 * Uses the SAME taxonomy (no duplication) but transforms:
 * - Coverage threshold: minimumCoverageReferences (does the entry exist in the store?)
 * - Units per ref: from policy pack (8/10/12 textile, 6/4/1 accessory)
 */
export function buildStoreDerroteroFromSalesPortfolioDerrotero(
  tenantId: string,
  config: StoreDerroteroAdapterConfig = DEFAULT_CONFIG,
): StoreDerrotero {
  const csCatalog = buildCastillitosTextilCatalog();
  const ltCatalog = buildLatinKidsTextilCatalog();
  const importCatalog = buildImportAccesoriosCatalog();

  const castillitosGroups = adaptTextileCatalog(
    csCatalog,
    "CASTILLITOS",
    "GROUP_AND_SUBGROUP",
    config.castillitosTextile,
    config,
  );

  const latinKidsGroups = adaptTextileCatalog(
    ltCatalog,
    "LATIN_KIDS",
    "SUBGROUP",
    config.latinKidsTextile,
    config,
  );

  const accessoriesGroups = adaptAccessoryCatalog(
    importCatalog,
    config.accessory,
    config,
  );

  const totalEntries =
    castillitosGroups.reduce((s, g) => s + g.entries.length, 0) +
    latinKidsGroups.reduce((s, g) => s + g.entries.length, 0) +
    accessoriesGroups.reduce((s, g) => s + g.entries.length, 0);

  return {
    tenantId,
    scope: "STORE",
    measurementUnit: "UNITS",
    version: `${csCatalog.version}+${ltCatalog.version}+${importCatalog.version}`,
    lines: {
      castillitos: castillitosGroups,
      latinKids: latinKidsGroups,
      accessories: accessoriesGroups,
    },
    totalEntries,
    sourceEvidence: `Adapted from: ${csCatalog.name}, ${ltCatalog.name}, ${importCatalog.name}`,
    builtAt: new Date().toISOString(),
  };
}

// ── Textile catalog adapter ─────────────────────────────────────────────────

function adaptTextileCatalog(
  catalog: MalletAssortmentCatalog,
  line: StoreDerroteroLine,
  matchMode: DerroteroMatchMode,
  textileConfig: TextileCoverageConfig,
  adapterConfig: StoreDerroteroAdapterConfig,
): StoreDerroteroGroup[] {
  return catalog.groups.map((group: MalletAssortmentGroup) =>
    adaptTextileGroup(group, line, matchMode, textileConfig, adapterConfig, catalog.name),
  );
}

function adaptTextileGroup(
  group: MalletAssortmentGroup,
  line: StoreDerroteroLine,
  matchMode: DerroteroMatchMode,
  textileConfig: TextileCoverageConfig,
  adapterConfig: StoreDerroteroAdapterConfig,
  catalogName: string,
): StoreDerroteroGroup {
  const entries = group.entries
    .filter((e: MalletAssortmentEntry) => e.active)
    .map((e: MalletAssortmentEntry): StoreDerroteroEntry => ({
      entryCode: e.subgroupCode ?? e.subgroupName,
      entryName: e.subgroupName,
      line,
      sagGrupo: group.sagGrupo,
      sagSubgrupo: e.sagSubgrupo,
      sizeClass: null,
      matchMode,
      minimumCoverageReferences: adapterConfig.minimumCoverageReferences,
      minUnitsPerRef: textileConfig.minimumUnits,
      idealUnitsPerRef: textileConfig.idealUnits,
      maxUnitsPerRef: textileConfig.maximumUnits,
      priority: e.priority,
      active: true,
      sourceEvidence: `${catalogName} → ${group.groupName} → ${e.subgroupName}`,
    }));

  return {
    groupCode: group.groupCode,
    groupName: group.groupName,
    line,
    sagGrupo: group.sagGrupo,
    entries,
  };
}

// ── Accessory catalog adapter ───────────────────────────────────────────────

function adaptAccessoryCatalog(
  catalog: MalletAssortmentCatalog,
  accessoryConfig: AccessoryCoverageConfig,
  adapterConfig: StoreDerroteroAdapterConfig,
): StoreDerroteroGroup[] {
  return catalog.groups.map((group: MalletAssortmentGroup): StoreDerroteroGroup => {
    const entries = group.entries
      .filter((e: MalletAssortmentEntry) => e.active)
      .map((e: MalletAssortmentEntry): StoreDerroteroEntry => {
        const sizeClass = mapSizeClass(e.subgroupCode);
        const idealUnits = sizeClass ? accessoryConfig.idealBySize[sizeClass] : 0;

        return {
          entryCode: e.subgroupCode ?? e.subgroupName,
          entryName: e.subgroupName,
          line: "ACCESSORIES",
          sagGrupo: null,
          sagSubgrupo: null,
          sizeClass,
          matchMode: "SIZE_CLASS",
          minimumCoverageReferences: adapterConfig.minimumCoverageReferences,
          minUnitsPerRef: idealUnits,
          idealUnitsPerRef: idealUnits,
          maxUnitsPerRef: idealUnits,
          priority: e.priority,
          active: true,
          sourceEvidence: `${catalog.name} → ${group.groupName} → ${e.subgroupName}`,
        };
      });

    return {
      groupCode: group.groupCode,
      groupName: group.groupName,
      line: "ACCESSORIES",
      sagGrupo: null,
      entries,
    };
  });
}

// ── Size class mapping ──────────────────────────────────────────────────────

function mapSizeClass(subgroupCode: string | null): StoreSizeClass | null {
  if (!subgroupCode) return null;
  const upper = subgroupCode.toUpperCase();
  if (upper === "PEQUENO") return "small";
  if (upper === "MEDIANO") return "medium";
  if (upper === "GRANDE") return "large";
  return null;
}
