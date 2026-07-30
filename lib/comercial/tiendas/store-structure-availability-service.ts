/**
 * lib/comercial/tiendas/store-structure-availability-service.ts
 *
 * AGENTIK-STORES-UNIT-BASED-NEEDS-ENGINE-01 — Shared structure availability
 * provider (Ajuste 1 de la revisión arquitectónica).
 *
 * Canonical, single implementation of "how many main-warehouse units exist
 * for a coverage structure". Consumed by BOTH:
 *   - store-coverage-service (candidate expansion)
 *   - store-unit-needs-service (unit-based needs)
 * so neither service depends on the other's internals.
 *
 * Machinery MOVED (not duplicated) from store-coverage-service:
 *   resolveCatalogInfo · findCompatibleRefs
 *
 * Semantics:
 *   - structureKey the catalog cannot resolve → SIN_DATOS (NOT_FOUND ≠ 0).
 *   - resolvable structure → CONOCIDA with:
 *       eligibleUnits  (Rule-36-eligible refs)
 *       blockedUnits   (Rule-36-blocked refs)
 *       totalUnits     (eligibleUnits + blockedUnits — invariante contractual)
 *     Zero units is a KNOWN zero, never missing data.
 *
 * SERVER ONLY.
 */

import "server-only";

import {
  loadDistributionData,
  buildMainStockIndex,
  buildSubstitutionIndex,
  loadHeroImageMap,
  getScarcityParams,
  getCanonicalStoreDetail,
} from "./store-distribution-service";
import type { SubstitutionIndex } from "./store-distribution-service";
import {
  buildCastillitosTextilCatalog,
  buildLatinKidsTextilCatalog,
  buildImportAccesoriosCatalog,
} from "../maletas/assortment-catalog/castillitos-mallet-assortment-catalog";
import { normalizeCanonicalGroup, normalizeCanonicalSubgroup } from "./classification-normalization";
import type { StructureAvailability } from "./store-unit-needs-engine";

// ── Catalog resolution (moved from store-coverage-service) ──────────────────

export interface StructureCatalogInfo {
  structureKey: string;
  line: "CASTILLITOS" | "LATIN_KIDS" | "ACCESORIOS";
  sagGrupo: string | null;
  sagSubgrupo: string | string[] | null;
  sizeClass: string | null;
}

export function resolveCatalogInfo(structureKey: string): StructureCatalogInfo | null {
  const parts = structureKey.split("|");
  if (parts.length < 2) return null;

  const prefix = parts[0];

  if (prefix === "CS" && parts.length >= 3) {
    const sagGrupo = parts[1];
    const subgroupName = parts.slice(2).join("|");
    const catalog = buildCastillitosTextilCatalog();
    for (const group of catalog.groups) {
      if (group.sagGrupo !== sagGrupo) continue;
      for (const entry of group.entries) {
        if (entry.subgroupName === subgroupName && entry.active) {
          return { structureKey, line: "CASTILLITOS", sagGrupo: group.sagGrupo, sagSubgrupo: entry.sagSubgrupo, sizeClass: null };
        }
      }
    }
    return null;
  }

  if (prefix === "LK") {
    const subgroupName = parts.slice(1).join("|");
    const catalog = buildLatinKidsTextilCatalog();
    for (const group of catalog.groups) {
      for (const entry of group.entries) {
        if (entry.subgroupName === subgroupName && entry.active) {
          return { structureKey, line: "LATIN_KIDS", sagGrupo: null, sagSubgrupo: entry.sagSubgrupo, sizeClass: null };
        }
      }
    }
    return null;
  }

  if (prefix === "ACC") {
    const subgroupName = parts.slice(1).join("|");
    const scMap: Record<string, string> = { PEQUENO: "small", MEDIANO: "medium", GRANDE: "large" };
    const catalog = buildImportAccesoriosCatalog();
    for (const group of catalog.groups) {
      for (const entry of group.entries) {
        if (entry.subgroupName === subgroupName && entry.active) {
          const sc = entry.subgroupCode ? scMap[entry.subgroupCode.toUpperCase()] ?? null : null;
          return { structureKey, line: "ACCESORIOS", sagGrupo: null, sagSubgrupo: null, sizeClass: sc };
        }
      }
    }
    return null;
  }

  return null;
}

// ── Compatible refs (moved from store-coverage-service) ─────────────────────

export function findCompatibleRefs(
  input: StructureCatalogInfo,
  subIndex: SubstitutionIndex,
): Set<string> {
  const result = new Set<string>();

  if (input.line === "CASTILLITOS") {
    const sagSubgrupos = Array.isArray(input.sagSubgrupo)
      ? input.sagSubgrupo
      : input.sagSubgrupo ? [input.sagSubgrupo] : [];
    const normalizedGrupo = normalizeCanonicalGroup(input.sagGrupo);

    for (const sub of sagSubgrupos) {
      const normalizedSub = normalizeCanonicalSubgroup(sub);
      for (const [key, refs] of subIndex.byGroupAndSubgroup) {
        const pipeIdx = key.indexOf("|");
        if (pipeIdx < 0) continue;
        const keyGroupSubgroup = key.substring(pipeIdx + 1);
        if (keyGroupSubgroup === `${normalizedGrupo}|${normalizedSub}`) {
          for (const ref of refs) result.add(ref);
        }
      }
    }
  } else if (input.line === "LATIN_KIDS") {
    const sagSub = typeof input.sagSubgrupo === "string" ? input.sagSubgrupo : null;
    if (sagSub) {
      const normalizedSub = normalizeCanonicalSubgroup(sagSub);
      for (const [key, refs] of subIndex.bySubgroup) {
        const pipeIdx = key.indexOf("|");
        if (pipeIdx < 0) continue;
        const keySubgroup = key.substring(pipeIdx + 1);
        if (keySubgroup === normalizedSub) {
          for (const ref of refs) result.add(ref);
        }
      }
    }
  } else if (input.line === "ACCESORIOS") {
    if (input.sizeClass) {
      const refs = subIndex.byLineSizeClass.get(input.sizeClass);
      if (refs) {
        for (const ref of refs) result.add(ref);
      }
    }
  }

  return result;
}

// ── Structure availability (canonical, shared) ──────────────────────────────

export async function resolveStructureAvailability(
  orgId: string,
  storeId: string,
  structureKeys: string[],
): Promise<Map<string, StructureAvailability>> {
  const [distData, detail] = await Promise.all([
    loadDistributionData(orgId),
    getCanonicalStoreDetail(orgId, storeId),
  ]);

  const result = new Map<string, StructureAvailability>();
  if (!detail) {
    for (const key of structureKeys) result.set(key, { status: "SIN_DATOS" });
    return result;
  }

  const mainStockIndex = buildMainStockIndex(distData.mainStock);
  const heroImageMap = await loadHeroImageMap(orgId);
  const subIndex = buildSubstitutionIndex(
    distData.storeInventory,
    mainStockIndex,
    distData.grupoByRef,
    heroImageMap,
    distData.refToProductId,
    distData.sizeClassByRef,
  );
  const scarcity = getScarcityParams();

  const storeRefsWithStock = new Set<string>();
  for (const item of detail.items) {
    if (item.currentUnits > 0) storeRefsWithStock.add(item.referenceCode);
  }

  for (const structureKey of structureKeys) {
    const catalogInfo = resolveCatalogInfo(structureKey);
    if (!catalogInfo) {
      result.set(structureKey, { status: "SIN_DATOS" });
      continue;
    }

    const compatibleRefs = findCompatibleRefs(catalogInfo, subIndex);
    let eligibleUnits = 0;
    let blockedUnits = 0;

    for (const ref of compatibleRefs) {
      const mainStock = mainStockIndex.byReference.get(ref) ?? 0;
      if (mainStock <= 0) continue;

      // Same Rule 36 logic as the candidate expansion:
      // reposición (ref already in store) may use the scarcity allowlist;
      // new/complement refs require stock above the scarcity threshold.
      const isReposicion = storeRefsWithStock.has(ref);
      const eligible = mainStock > scarcity.threshold ||
        (isReposicion && scarcity.allowedIds.includes(storeId));
      if (eligible) eligibleUnits += mainStock;
      else blockedUnits += mainStock;
    }

    result.set(structureKey, {
      status: "CONOCIDA",
      eligibleUnits,
      blockedUnits,
      totalUnits: eligibleUnits + blockedUnits,   // invariante por construcción
    });
  }

  return result;
}
