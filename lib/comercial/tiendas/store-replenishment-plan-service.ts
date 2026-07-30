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

// ── Cache ────────────────────────────────────────────────────────────────────

const CACHE_TTL_MS = 2 * 60 * 1000;
const cache = new Map<string, { data: StoreReplenishmentPlan; ts: number }>();

// ── Canonical store priority order ───────────────────────────────────────────

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

// ── Main loader ──────────────────────────────────────────────────────────────

export async function loadStoreReplenishmentPlan(
  orgId: string,
): Promise<StoreReplenishmentPlan> {
  const cacheKey = `replPlan:${orgId}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) return cached.data;

  const { order, materialPriorityStoreIds } = buildCanonicalStorePriorityOrder();

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

  cache.set(cacheKey, { data: plan, ts: Date.now() });
  return plan;
}
