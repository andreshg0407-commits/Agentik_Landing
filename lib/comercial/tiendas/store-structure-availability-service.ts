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
import { isRule36Eligible } from "./store-rule36-eligibility";

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

      // AGENTIK-NEEDS-RULE36-DIAGNOSIS-FIX-01: predicado canónico único.
      // Bajo escasez (≤ umbral), las tiendas permitidas (Centro/Caldas)
      // SIEMPRE son elegibles — reposición, complemento o referencia nueva.
      const eligible = isRule36Eligible({
        mainStockUnits: mainStock,
        scarcityThreshold: scarcity.threshold,
        destinationStoreId: storeId,
        allowedStoreIds: scarcity.allowedIds,
      });
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

// ═══════════════════════════════════════════════════════════════════════════
// STRUCTURE CANDIDATES — AGENTIK-STORES-REPLENISHMENT-ENGINE-01 (Ajuste 11)
// ═══════════════════════════════════════════════════════════════════════════
//
// Returns ONLY: compatibility per structure, candidate type per store,
// certified per-reference GLOBAL pools, and Rule 36 application.
// It decides NOTHING about distribution: no winners, no quantities, no
// priorities, no pool deductions. All allocation belongs exclusively to
// store-replenishment-allocation-engine.

import type {
  ReferencePool,
  StructureCandidateRef,
  AllocationCandidateType,
} from "./store-replenishment-allocation-engine";

export interface StructureCandidatesResolution {
  /** ÚNICA verdad de stock por referencia — pool GLOBAL (Ajuste 1). */
  readonly referencePools: ReadonlyMap<string, ReferencePool>;
  readonly candidatesByStructure: ReadonlyMap<string, readonly StructureCandidateRef[]>;
}

export async function resolveStructureCandidates(
  orgId: string,
  storeIds: readonly string[],
  structureKeys: readonly string[],
  /** structureKeys SIN cobertura por tienda (para tipar NUEVA vs COMPLEMENTO). */
  uncoveredStructuresByStore: ReadonlyMap<string, ReadonlySet<string>>,
): Promise<StructureCandidatesResolution> {
  const distData = await loadDistributionData(orgId);
  const details = await Promise.all(
    storeIds.map(id => getCanonicalStoreDetail(orgId, id).then(d => [id, d] as const)),
  );

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

  // Presencia con stock por tienda
  const refsWithStockByStore = new Map<string, Set<string>>();
  for (const [storeId, detail] of details) {
    const set = new Set<string>();
    if (detail) {
      for (const item of detail.items) {
        if (item.currentUnits > 0) set.add(item.referenceCode);
      }
    }
    refsWithStockByStore.set(storeId, set);
  }

  const referencePools = new Map<string, ReferencePool>();
  const candidatesByStructure = new Map<string, StructureCandidateRef[]>();

  for (const structureKey of structureKeys) {
    const catalogInfo = resolveCatalogInfo(structureKey);
    if (!catalogInfo) continue;   // sin catálogo → sin candidatos (el engine lo trata vía Sprint 5)

    const compatibleRefs = findCompatibleRefs(catalogInfo, subIndex);
    const candidates: StructureCandidateRef[] = [];

    for (const ref of compatibleRefs) {
      const mainStock = mainStockIndex.byReference.get(ref) ?? 0;
      if (mainStock <= 0) continue;

      // Pool GLOBAL: una sola verdad por referencia, idéntica en toda estructura.
      if (!referencePools.has(ref)) {
        const meta = subIndex.refMeta.get(ref);
        referencePools.set(ref, {
          eligibleUnits: mainStock,
          productName: meta?.productName ?? ref,
          underScarcityThreshold: mainStock <= scarcity.threshold,
        });
      }

      // Tipo de candidato por tienda; AUSENCIA = no elegible (Regla 36).
      const candidateTypeByStore = new Map<string, AllocationCandidateType>();
      for (const storeId of storeIds) {
        const present = refsWithStockByStore.get(storeId)?.has(ref) ?? false;
        // AGENTIK-NEEDS-RULE36-DIAGNOSIS-FIX-01: predicado canónico único —
        // la presencia solo decide el TIPO de candidato, nunca la elegibilidad.
        const eligible = isRule36Eligible({
          mainStockUnits: mainStock,
          scarcityThreshold: scarcity.threshold,
          destinationStoreId: storeId,
          allowedStoreIds: scarcity.allowedIds,
        });
        if (!eligible) continue;

        const uncovered = uncoveredStructuresByStore.get(storeId)?.has(structureKey) ?? false;
        candidateTypeByStore.set(
          storeId,
          present ? "REPOSICION_MISMA_REFERENCIA"
            : uncovered ? "REFERENCIA_NUEVA_COMPATIBLE"
            : "COMPLEMENTO_REFERENCIA_COMPATIBLE",
        );
      }

      if (candidateTypeByStore.size > 0) {
        candidates.push({ referenceCode: ref, candidateTypeByStore });
      }
    }

    candidatesByStructure.set(structureKey, candidates);
  }

  return { referencePools, candidatesByStructure };
}
