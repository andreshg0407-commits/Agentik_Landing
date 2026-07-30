/**
 * lib/comercial/tiendas/store-unit-needs-service.ts
 *
 * AGENTIK-STORES-UNIT-BASED-NEEDS-ENGINE-01 — Needs loader.
 *
 * Thin server-only bridge:
 *   loadStoreCoverage (Sprint 4, certified unit deficits)
 *     + resolveStructureAvailability (shared canonical provider —
 *       store-structure-availability-service, Ajuste 1)
 *     → buildStoreUnitNeeds (pure certified engine)
 *
 * This layer resolves DATA only. Every law lives in the pure engine.
 * No dependency on store-coverage-service internals beyond its public
 * coverage result.
 */

import "server-only";

import { loadStoreCoverage } from "./store-coverage-service";
import { resolveStructureAvailability } from "./store-structure-availability-service";
import { buildStoreUnitNeeds, type StoreUnitNeedsResult } from "./store-unit-needs-engine";

// ── Cache ────────────────────────────────────────────────────────────────────

const CACHE_TTL_MS = 2 * 60 * 1000;
const cache = new Map<string, { data: StoreUnitNeedsResult; ts: number }>();

export async function loadStoreUnitNeeds(
  orgId: string,
  storeId: string,
): Promise<StoreUnitNeedsResult> {
  const cacheKey = `unitNeeds:${orgId}:${storeId}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) return cached.data;

  const coverage = await loadStoreCoverage(orgId, storeId);

  // Availability only for structures that actually have a deficit —
  // healthy structures never produce needs (engine drops them anyway).
  const keysWithDeficit = coverage.structures
    .filter(s => s.unitRule.deficitToIdeal > 0)
    .map(s => s.structureKey);

  const availability = keysWithDeficit.length > 0
    ? await resolveStructureAvailability(orgId, storeId, keysWithDeficit)
    : new Map();

  const result = buildStoreUnitNeeds({
    storeId,
    structures: coverage.structures.map(s => ({
      structureKey: s.structureKey,
      label: s.label,
      line: s.line,
      structuralCoverageStatus: s.structuralCoverageStatus,
      unitRule: s.unitRule,   // VERBATIM — the engine enforces UNITS
    })),
    specialRules: coverage.specialRules,
    availability,
  });

  cache.set(cacheKey, { data: result, ts: Date.now() });
  return result;
}
