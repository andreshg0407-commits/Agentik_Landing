/**
 * lib/comercial/tiendas/store-replenishment-plan-service.ts
 *
 * AGENTIK-STORES-REPLENISHMENT-ENGINE-01 — Plan loader.
 *
 * Thin server-only bridge:
 *   loadStoreUnitNeeds × tiendas activas (Sprint 5, verbatim)
 *     + resolveStructureCandidates (proveedor compartido — pools globales,
 *       compatibilidad y tipos por tienda; cero decisiones de reparto)
 *     → buildStoreReplenishmentPlan (motor puro certificado)
 *
 * Orden de prioridad de tiendas (documentado, canónico):
 *   1. allowedStoreIds de la Regla 36 (CASTILLITOS_GLOBAL_LOW_STOCK), en su
 *      orden de configuración → prioridad MATERIAL solo bajo escasez.
 *   2. Resto de tiendas en el orden canónico de CANONICAL_SALES_STORES.
 * El motor valida que el orden sea una permutación exacta — este servicio
 * nunca entrega órdenes incompletos.
 */

import "server-only";

import { loadStoreUnitNeeds } from "./store-unit-needs-service";
import { resolveStructureCandidates } from "./store-structure-availability-service";
import {
  buildStoreReplenishmentPlan,
  type StoreReplenishmentPlan,
} from "./store-replenishment-allocation-engine";
import type { StoreUnitNeedsResult } from "./store-unit-needs-engine";
import { CASTILLITOS_GLOBAL_LOW_STOCK } from "./store-policy-pack-config";
import { CANONICAL_SALES_STORES } from "../sales-canonical-source";
import { resolveScarcityFromPolicies } from "./store-distribution-actions";
import { listStorePolicies } from "./store-policy-service";

// ── Cache ────────────────────────────────────────────────────────────────────

const CACHE_TTL_MS = 2 * 60 * 1000;
const cache = new Map<string, { data: StoreReplenishmentPlan; ts: number }>();

// ── Canonical store priority order ───────────────────────────────────────────

/**
 * Build store priority order using tenant default.
 * @deprecated Use buildEffectiveStorePriorityOrder() for persistence-aware resolution.
 */
export function buildCanonicalStorePriorityOrder(): {
  order: string[];
  materialPriorityStoreIds: string[];
} {
  const material = [...CASTILLITOS_GLOBAL_LOW_STOCK.allowedStoreIds];
  const rest = CANONICAL_SALES_STORES
    .map(s => s.storeId)
    .filter(id => !material.includes(id));
  return { order: [...material, ...rest], materialPriorityStoreIds: material };
}

/**
 * Build store priority order from effective (persisted) Rule 36 config.
 */
export async function buildEffectiveStorePriorityOrder(orgId: string): Promise<{
  order: string[];
  materialPriorityStoreIds: string[];
}> {
  const rawPolicies = await listStorePolicies(orgId);
  const scarcity = resolveScarcityFromPolicies(rawPolicies);
  const material = [...scarcity.allowedIds];
  const rest = CANONICAL_SALES_STORES
    .map(s => s.storeId)
    .filter(id => !material.includes(id));
  return { order: [...material, ...rest], materialPriorityStoreIds: material };
}

// ── Main loader ──────────────────────────────────────────────────────────────

export async function loadStoreReplenishmentPlan(
  orgId: string,
): Promise<StoreReplenishmentPlan> {
  return (await loadStoreReplenishmentPlanWithMeta(orgId)).plan;
}

/**
 * AGENTIK-STORES-REPLENISHMENT-DOCUMENT-01 (ajuste certificado): el documento
 * separa CUÁNDO se calculó el plan de CUÁNDO se creó el documento. Esta
 * variante expone el timestamp real de cálculo (respetando el cache).
 */
export async function loadStoreReplenishmentPlanWithMeta(
  orgId: string,
): Promise<{ plan: StoreReplenishmentPlan; planGeneratedAt: string }> {
  const cacheKey = `replPlan:${orgId}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    return { plan: cached.data, planGeneratedAt: new Date(cached.ts).toISOString() };
  }

  const { order, materialPriorityStoreIds } = await buildEffectiveStorePriorityOrder(orgId);

  // Necesidades del Sprint 5, verbatim, por tienda.
  const needsByStore = new Map<string, StoreUnitNeedsResult>();
  for (const storeId of order) {
    needsByStore.set(storeId, await loadStoreUnitNeeds(orgId, storeId));
  }

  // Universo de estructuras con reposición y su estatus de cobertura por tienda.
  const structureKeys = new Set<string>();
  const uncoveredByStore = new Map<string, Set<string>>();
  for (const [storeId, result] of needsByStore) {
    const uncovered = new Set<string>();
    for (const n of result.needs) {
      if (n.action !== "REPOSICION") continue;
      if (n.source !== "ESTRUCTURA") continue;   // ESPECIAL|* no resuelve en catálogo (SIN_DATOS por diseño)
      structureKeys.add(n.structureKey);
      if (n.priorityClass === "NO_COVERAGE") uncovered.add(n.structureKey);
    }
    uncoveredByStore.set(storeId, uncovered);
  }

  const { referencePools, candidatesByStructure } = await resolveStructureCandidates(
    orgId,
    order,
    [...structureKeys],
    uncoveredByStore,
  );

  const plan = buildStoreReplenishmentPlan({
    storePriorityOrder: order,
    materialPriorityStoreIds,
    needsByStore,
    referencePools,
    candidatesByStructure,
  });

  const ts = Date.now();
  cache.set(cacheKey, { data: plan, ts });
  return { plan, planGeneratedAt: new Date(ts).toISOString() };
}
