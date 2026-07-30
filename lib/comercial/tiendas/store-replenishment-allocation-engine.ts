/**
 * lib/comercial/tiendas/store-replenishment-allocation-engine.ts
 *
 * AGENTIK-STORES-REPLENISHMENT-ENGINE-01 — Motor de asignación de surtido.
 * (Diseño aprobado con 11 ajustes obligatorios — todos incorporados.)
 *
 * Converts the certified unit needs (Sprint 5) of ALL stores into an
 * auditable replenishment plan over a SHARED, GLOBAL per-reference pool.
 *
 * BUSINESS POLICY (certified by the architectural review):
 *   ABUNDANCIA: pool ≥ demanda ejecutable concurrente → todas las tiendas
 *     se cubren; la prioridad solo aporta orden determinista (sin ventaja
 *     material, sin razón STORE_PRIORITY).
 *   ESCASEZ: pool < demanda ejecutable concurrente → las tiendas de la
 *     Regla 36 (allowedStoreIds) reciben primero, luego el resto en orden
 *     determinista. No hay reparto proporcional (ley no certificada).
 *
 * LAWS:
 *   1. Se asigna contra executableUnits (Sprint 5) — NUNCA contra
 *      requiredUnits. executableUnits es un techo individual, no una
 *      reserva: la competencia entre tiendas se resuelve AQUÍ.
 *   2. Pool GLOBAL por referenceCode — una sola verdad de stock aunque la
 *      referencia sea candidata de varias estructuras. Σ asignado ≤ pool.
 *   3. Techos en cascada: asignado ≤ executable ≤ required; por sugerencia
 *      ≤ remanente del pool al momento de asignar.
 *   4. Los RETIRO pasan al plan en su orden certificado y JAMÁS entran a la
 *      cola de asignación ni consumen pool.
 *   5. SIN_DATOS jamás se asigna. Causas de unallocated exactas (Ajuste 7):
 *      SIN_DATOS_DISPONIBILIDAD · SIN_DISPONIBILIDAD · POOL_AGOTADO.
 *      Una necesidad totalmente asignada (allocated = executable) NO aparece
 *      en unallocated aunque required > executable — esa brecha es del
 *      Sprint 5 y vive en el summary como pendiente de negocio.
 *   6. Orden dentro de tienda: compareUnitNeeds (Sprint 5) — sin criterio
 *      propio. Orden de candidatos: CANDIDATE_TYPE_PRIORITY, luego pool
 *      inicial desc, luego referenceCode asc (orden total determinista).
 *   7. Toda sugerencia se explica con razones estructuradas (code + detail
 *      + metadata). STORE_PRIORITY solo cuando la escasez la hizo material;
 *      RULE_36_SCARCITY solo cuando la referencia está bajo el umbral real.
 *   8. Fallo total con errores tipados ante datos corruptos — cero planes
 *      parciales. Postcondición interna: eligible = allocated + remaining.
 *
 * Pure functions — no DB, no Prisma, no server-only, no side effects.
 * Inputs are READ-ONLY and never mutated.
 */

import type { StoreUnitNeedsResult, UnitNeed } from "./store-unit-needs-engine";
import { compareUnitNeeds } from "./store-unit-needs-engine";

// ── Typed errors (fallo total) ───────────────────────────────────────────────

export class InvalidStorePriorityOrderError extends Error {
  readonly code = "INVALID_STORE_PRIORITY_ORDER";
  constructor(detail: string) {
    super(`[REPLENISHMENT] storePriorityOrder inválido: ${detail}`);
    this.name = "InvalidStorePriorityOrderError";
  }
}

export class InvalidReferencePoolError extends Error {
  readonly code = "INVALID_REFERENCE_POOL";
  constructor(detail: string) {
    super(`[REPLENISHMENT] Pool de referencia inválido: ${detail}`);
    this.name = "InvalidReferencePoolError";
  }
}

export class UnknownReferencePoolError extends Error {
  readonly code = "UNKNOWN_REFERENCE_POOL";
  constructor(referenceCode: string, structureKey: string) {
    super(`[REPLENISHMENT] Candidata ${referenceCode} (estructura ${structureKey}) sin pool global.`);
    this.name = "UnknownReferencePoolError";
  }
}

export class InvalidCandidateConfigurationError extends Error {
  readonly code = "INVALID_CANDIDATE_CONFIGURATION";
  constructor(detail: string) {
    super(`[REPLENISHMENT] Configuración de candidatos corrupta: ${detail}`);
    this.name = "InvalidCandidateConfigurationError";
  }
}

export class PoolAccountingError extends Error {
  readonly code = "POOL_ACCOUNTING_VIOLATION";
  constructor(referenceCode: string, eligible: number, allocated: number, remaining: number) {
    super(`[REPLENISHMENT] Postcondición rota en ${referenceCode}: eligible(${eligible}) ≠ allocated(${allocated}) + remaining(${remaining}).`);
    this.name = "PoolAccountingError";
  }
}

// ── Candidate types (Ajuste 4: enum único + prioridad en constante) ─────────

export type AllocationCandidateType =
  | "REPOSICION_MISMA_REFERENCIA"
  | "COMPLEMENTO_REFERENCIA_COMPATIBLE"
  | "REFERENCIA_NUEVA_COMPATIBLE";

export const CANDIDATE_TYPE_PRIORITY = {
  REPOSICION_MISMA_REFERENCIA: 300,
  COMPLEMENTO_REFERENCIA_COMPATIBLE: 200,
  REFERENCIA_NUEVA_COMPATIBLE: 100,
} as const;

// ── Input contracts (Ajuste 1: pool global por referencia) ───────────────────

export interface ReferencePool {
  readonly eligibleUnits: number;
  readonly productName: string;
  /** true cuando el stock global de la referencia está bajo el umbral de la Regla 36. */
  readonly underScarcityThreshold: boolean;
}

export interface StructureCandidateRef {
  readonly referenceCode: string;
  /**
   * storeId → tipo de candidato. La AUSENCIA de una tienda significa que la
   * referencia NO es elegible para esa tienda (Regla 36) — semántica
   * declarada, no corrupción. Corrupción (mapa vacío, ref duplicada en la
   * misma estructura, pool inexistente) es fallo total tipado.
   */
  readonly candidateTypeByStore: ReadonlyMap<string, AllocationCandidateType>;
}

export interface ReplenishmentAllocationInput {
  /** Permutación EXACTA de las tiendas de needsByStore (validada — Ajuste 5). */
  readonly storePriorityOrder: readonly string[];
  /** Tiendas con prioridad MATERIAL bajo escasez (Regla 36 allowedStoreIds). */
  readonly materialPriorityStoreIds: readonly string[];
  /** Necesidades del Sprint 5, VERBATIM, por tienda. */
  readonly needsByStore: ReadonlyMap<string, StoreUnitNeedsResult>;
  /** ÚNICA verdad de stock por referencia (Ajuste 1). */
  readonly referencePools: ReadonlyMap<string, ReferencePool>;
  /** Compatibilidad por estructura — referencia el pool, no declara stock. */
  readonly candidatesByStructure: ReadonlyMap<string, readonly StructureCandidateRef[]>;
}

// ── Output contracts ─────────────────────────────────────────────────────────

export type AllocationReasonCode =
  | "NEED_PRIORITY"
  | "STORE_PRIORITY"
  | "SAME_REFERENCE_FIRST"
  | "STOCK_CAP"
  | "EXECUTABLE_CAP"
  | "RULE_36_SCARCITY";

export interface AllocationReason {
  readonly code: AllocationReasonCode;
  readonly detail: string;
  readonly metadata?: Readonly<Record<string, string | number | boolean>>;
}

export interface ReplenishmentSuggestion {
  readonly storeId: string;
  readonly structureKey: string;
  readonly referenceCode: string;
  readonly productName: string;
  readonly units: number;   // > 0 siempre
  readonly candidateType: AllocationCandidateType;   // el de ESTA tienda (caso 10)
  readonly reasons: readonly AllocationReason[];
}

export interface UnallocatedNeed {
  readonly storeId: string;
  readonly structureKey: string;
  readonly requiredUnits: number;
  readonly executableUnits: number;
  readonly allocatedUnits: number;
  /** Falta dentro del trabajo que SÍ era ejecutable (executable − allocated). */
  readonly unallocatedExecutableUnits: number;
  /** Brecha de negocio tras asignar (required − allocated). */
  readonly totalPendingUnits: number;
  readonly reason: "SIN_DATOS_DISPONIBILIDAD" | "SIN_DISPONIBILIDAD" | "POOL_AGOTADO";
}

export interface StoreReplenishmentSummary {
  readonly storeId: string;
  readonly requiredUnits: number;
  readonly executableUnits: number;
  readonly allocatedUnits: number;
  /** executable − allocated (falla de asignación). */
  readonly allocationPendingUnits: number;
  /** required − allocated (brecha de negocio total). */
  readonly totalBusinessPendingUnits: number;
  readonly withdrawalUnits: number;
  readonly suggestionCount: number;
}

export interface PoolUsage {
  readonly eligible: number;
  readonly allocated: number;
  readonly remaining: number;
}

export interface StoreReplenishmentPlan {
  readonly suggestions: readonly ReplenishmentSuggestion[];
  /** RETIRO del Sprint 5, passthrough en su orden certificado — sin pool. */
  readonly withdrawals: readonly UnitNeed[];
  readonly unallocated: readonly UnallocatedNeed[];
  readonly poolUsage: ReadonlyMap<string, PoolUsage>;
  readonly summaryByStore: readonly StoreReplenishmentSummary[];
  /** true si alguna necesidad ejecutable quedó sin cubrir por pool agotado. */
  readonly scarcityMaterialized: boolean;
}

// ── Validation ───────────────────────────────────────────────────────────────

function validateInput(input: ReplenishmentAllocationInput): void {
  // Ajuste 5 — permutación exacta.
  const order = input.storePriorityOrder;
  const seen = new Set<string>();
  for (const id of order) {
    if (!id || id.trim() === "") throw new InvalidStorePriorityOrderError("identificador vacío");
    if (seen.has(id)) throw new InvalidStorePriorityOrderError(`tienda duplicada: ${id}`);
    seen.add(id);
    if (!input.needsByStore.has(id)) throw new InvalidStorePriorityOrderError(`tienda desconocida (sin necesidades): ${id}`);
  }
  for (const id of input.needsByStore.keys()) {
    if (!seen.has(id)) throw new InvalidStorePriorityOrderError(`tienda con necesidades ausente del orden: ${id}`);
  }

  // Ajuste 6 — pools válidos.
  for (const [ref, pool] of input.referencePools) {
    if (!ref || ref.trim() === "") throw new InvalidReferencePoolError("referenceCode vacío");
    if (pool.eligibleUnits < 0 || !Number.isInteger(pool.eligibleUnits)) {
      throw new InvalidReferencePoolError(`${ref}: eligibleUnits inválido (${pool.eligibleUnits})`);
    }
  }

  // Ajuste 6 — candidatos válidos: pool existente, sin duplicados por
  // estructura, mapa de tipos no vacío.
  for (const [structureKey, candidates] of input.candidatesByStructure) {
    const refsInStructure = new Set<string>();
    for (const c of candidates) {
      if (!c.referenceCode || c.referenceCode.trim() === "") {
        throw new InvalidCandidateConfigurationError(`referencia vacía en ${structureKey}`);
      }
      if (refsInStructure.has(c.referenceCode)) {
        throw new InvalidCandidateConfigurationError(
          `referencia ${c.referenceCode} duplicada en ${structureKey} — un solo pool global por referencia`,
        );
      }
      refsInStructure.add(c.referenceCode);
      if (!input.referencePools.has(c.referenceCode)) {
        throw new UnknownReferencePoolError(c.referenceCode, structureKey);
      }
      if (c.candidateTypeByStore.size === 0) {
        throw new InvalidCandidateConfigurationError(`candidata ${c.referenceCode} en ${structureKey} sin tipos por tienda`);
      }
    }
  }
}

// ── Deterministic candidate ordering (ley 6) ─────────────────────────────────

function orderCandidatesForStore(
  candidates: readonly StructureCandidateRef[],
  storeId: string,
  pools: ReadonlyMap<string, ReferencePool>,
): StructureCandidateRef[] {
  return candidates
    .filter(c => c.candidateTypeByStore.has(storeId))   // ausencia = no elegible para la tienda
    .slice()
    .sort((a, b) => {
      const ta = CANDIDATE_TYPE_PRIORITY[a.candidateTypeByStore.get(storeId)!];
      const tb = CANDIDATE_TYPE_PRIORITY[b.candidateTypeByStore.get(storeId)!];
      if (tb !== ta) return tb - ta;
      const pa = pools.get(a.referenceCode)!.eligibleUnits;
      const pb = pools.get(b.referenceCode)!.eligibleUnits;
      if (pb !== pa) return pb - pa;
      return a.referenceCode < b.referenceCode ? -1 : a.referenceCode > b.referenceCode ? 1 : 0;
    });
}

// ── Engine ───────────────────────────────────────────────────────────────────

export function buildStoreReplenishmentPlan(
  input: ReplenishmentAllocationInput,
): StoreReplenishmentPlan {
  validateInput(input);

  const remaining = new Map<string, number>();
  for (const [ref, pool] of input.referencePools) remaining.set(ref, pool.eligibleUnits);

  const suggestions: ReplenishmentSuggestion[] = [];
  const unallocated: UnallocatedNeed[] = [];
  const withdrawals: UnitNeed[] = [];
  const suggestionsByRef = new Map<string, ReplenishmentSuggestion[]>();
  const perStoreTotals = new Map<string, { required: number; executable: number; allocated: number; withdraw: number; suggCount: number }>();

  const getTotals = (storeId: string) => {
    if (!perStoreTotals.has(storeId)) {
      perStoreTotals.set(storeId, { required: 0, executable: 0, allocated: 0, withdraw: 0, suggCount: 0 });
    }
    return perStoreTotals.get(storeId)!;
  };

  // ── Ajuste 9: retiros fuera de la cola de asignación, orden certificado ──
  for (const storeId of input.storePriorityOrder) {
    const result = input.needsByStore.get(storeId)!;
    for (const need of result.needs) {
      if (need.action === "RETIRO") {
        withdrawals.push(need);
        getTotals(storeId).withdraw += need.requiredUnits;
      }
    }
  }

  // ── Asignación: solo REPOSICION, contra executableUnits (Ajustes 2 y 3) ──
  for (const storeId of input.storePriorityOrder) {
    const result = input.needsByStore.get(storeId)!;
    const replNeeds = result.needs
      .filter(n => n.action === "REPOSICION")
      .slice()
      .sort(compareUnitNeeds);   // orden certificado del Sprint 5 — sin criterio propio

    for (const need of replNeeds) {
      const totals = getTotals(storeId);
      totals.required += need.requiredUnits;

      // Ajuste 7 — causas exactas.
      if (need.executionStatus === "SIN_DATOS_DISPONIBILIDAD") {
        unallocated.push({
          storeId, structureKey: need.structureKey,
          requiredUnits: need.requiredUnits,
          executableUnits: 0,
          allocatedUnits: 0,
          unallocatedExecutableUnits: 0,
          totalPendingUnits: need.requiredUnits,
          reason: "SIN_DATOS_DISPONIBILIDAD",
        });
        continue;
      }

      const executable = need.executableUnits ?? 0;
      totals.executable += executable;

      if (executable <= 0) {
        unallocated.push({
          storeId, structureKey: need.structureKey,
          requiredUnits: need.requiredUnits,
          executableUnits: 0,
          allocatedUnits: 0,
          unallocatedExecutableUnits: 0,
          totalPendingUnits: need.requiredUnits,
          reason: "SIN_DISPONIBILIDAD",
        });
        continue;
      }

      const candidates = orderCandidatesForStore(
        input.candidatesByStructure.get(need.structureKey) ?? [],
        storeId,
        input.referencePools,
      );

      let allocatedForNeed = 0;

      for (const cand of candidates) {
        if (allocatedForNeed >= executable) break;   // techo executable (ley 1)

        const rem = remaining.get(cand.referenceCode)!;
        if (rem <= 0) continue;                      // agotada → siguiente candidata (caso 14)

        const wanted = executable - allocatedForNeed;
        const take = Math.min(wanted, rem);
        remaining.set(cand.referenceCode, rem - take);
        allocatedForNeed += take;

        const pool = input.referencePools.get(cand.referenceCode)!;
        const candidateType = cand.candidateTypeByStore.get(storeId)!;

        // ── Razones estructuradas (Ajuste 8) ──
        const reasons: AllocationReason[] = [
          {
            code: "NEED_PRIORITY",
            detail: `Necesidad ${need.priorityClass} (score ${need.priorityScore}) según el orden certificado del Sprint 5.`,
            metadata: { priorityClass: need.priorityClass, priorityScore: need.priorityScore },
          },
          {
            code: "SAME_REFERENCE_FIRST",
            detail: candidateType === "REPOSICION_MISMA_REFERENCIA"
              ? "Reposición de una referencia que la tienda ya tiene."
              : candidateType === "COMPLEMENTO_REFERENCIA_COMPATIBLE"
                ? "Complemento compatible: la tienda no tiene esta referencia pero sí la estructura."
                : "Referencia nueva compatible para una estructura sin cobertura.",
            metadata: { candidateType, typePriority: CANDIDATE_TYPE_PRIORITY[candidateType] },
          },
          take < wanted
            ? {
                code: "STOCK_CAP" as const,
                detail: `La referencia solo tenía ${rem} unidades restantes en el pool.`,
                metadata: {
                  eligibleUnits: pool.eligibleUnits,
                  previouslyAllocatedUnits: pool.eligibleUnits - rem,
                  remainingBeforeAllocation: rem,
                },
              }
            : {
                code: "EXECUTABLE_CAP" as const,
                detail: `Cantidad limitada por el techo ejecutable de la necesidad (${executable} unds, Sprint 5).`,
                metadata: { executableUnits: executable, requiredUnits: need.requiredUnits },
              },
        ];
        if (pool.underScarcityThreshold) {
          reasons.push({
            code: "RULE_36_SCARCITY",
            detail: "Referencia bajo el umbral de escasez de la Regla 36: solo tiendas autorizadas con reposición.",
            metadata: { eligibleUnits: pool.eligibleUnits },
          });
        }

        const suggestion: ReplenishmentSuggestion = {
          storeId,
          structureKey: need.structureKey,
          referenceCode: cand.referenceCode,
          productName: pool.productName,
          units: take,
          candidateType,
          reasons,
        };
        suggestions.push(suggestion);
        if (!suggestionsByRef.has(cand.referenceCode)) suggestionsByRef.set(cand.referenceCode, []);
        suggestionsByRef.get(cand.referenceCode)!.push(suggestion);
        totals.suggCount += 1;
      }

      totals.allocated += allocatedForNeed;

      // Ajuste 7 — asignación completa del ejecutable NUNCA va a unallocated,
      // aunque required > executable (esa brecha pertenece al Sprint 5).
      if (allocatedForNeed < executable) {
        unallocated.push({
          storeId, structureKey: need.structureKey,
          requiredUnits: need.requiredUnits,
          executableUnits: executable,
          allocatedUnits: allocatedForNeed,
          unallocatedExecutableUnits: executable - allocatedForNeed,
          totalPendingUnits: need.requiredUnits - allocatedForNeed,
          reason: "POOL_AGOTADO",
        });
      }
    }
  }

  // ── Escasez materializada + STORE_PRIORITY retroactivo (política) ─────────
  const poolExhaustedRefs = new Set(
    [...remaining.entries()].filter(([, rem]) => rem === 0).map(([ref]) => ref),
  );
  const scarcityMaterialized = unallocated.some(u => u.reason === "POOL_AGOTADO");

  let finalSuggestions: ReplenishmentSuggestion[] = suggestions;
  if (scarcityMaterialized) {
    // Refs disputadas: agotadas Y con una necesidad POOL_AGOTADO cuya
    // estructura las tenía como candidatas.
    const contestedRefs = new Set<string>();
    for (const u of unallocated) {
      if (u.reason !== "POOL_AGOTADO") continue;
      const cands = input.candidatesByStructure.get(u.structureKey) ?? [];
      for (const c of cands) {
        if (poolExhaustedRefs.has(c.referenceCode)) contestedRefs.add(c.referenceCode);
      }
    }
    const material = new Set(input.materialPriorityStoreIds);
    finalSuggestions = suggestions.map(s => {
      if (!contestedRefs.has(s.referenceCode) || !material.has(s.storeId)) return s;
      return {
        ...s,
        reasons: [
          ...s.reasons,
          {
            code: "STORE_PRIORITY" as const,
            detail: "Pool en escasez: esta tienda recibe primero por la prioridad Centro/Caldas (Regla 36).",
            metadata: { scarcity: true },
          },
        ],
      };
    });
  }

  // ── Postcondición de contabilidad del pool (ley 8) ────────────────────────
  const poolUsage = new Map<string, PoolUsage>();
  for (const [ref, pool] of input.referencePools) {
    const allocated = (suggestionsByRef.get(ref) ?? []).reduce((t, s) => t + s.units, 0);
    const rem = remaining.get(ref)!;
    if (pool.eligibleUnits !== allocated + rem) {
      throw new PoolAccountingError(ref, pool.eligibleUnits, allocated, rem);
    }
    poolUsage.set(ref, { eligible: pool.eligibleUnits, allocated, remaining: rem });
  }

  // ── Summary por tienda (Ajuste 10: tres conceptos separados) ──────────────
  const summaryByStore: StoreReplenishmentSummary[] = input.storePriorityOrder.map(storeId => {
    const t = getTotals(storeId);
    return {
      storeId,
      requiredUnits: t.required,
      executableUnits: t.executable,
      allocatedUnits: t.allocated,
      allocationPendingUnits: t.executable - t.allocated,
      totalBusinessPendingUnits: t.required - t.allocated,
      withdrawalUnits: t.withdraw,
      suggestionCount: t.suggCount,
    };
  });

  return {
    suggestions: finalSuggestions,
    withdrawals,
    unallocated,
    poolUsage,
    summaryByStore,
    scarcityMaterialized,
  };
}
