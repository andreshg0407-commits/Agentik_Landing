/**
 * lib/comercial/tiendas/__tests__/store-replenishment-allocation-engine.test.ts
 *
 * AGENTIK-STORES-REPLENISHMENT-ENGINE-01 — certification tests.
 * Incluye los 15 casos obligatorios de la revisión arquitectónica.
 *
 * Las necesidades de entrada se construyen con el motor REAL del Sprint 5
 * (buildStoreUnitNeeds) — nunca a mano — para certificar la integración.
 *
 * Run: npx tsx --test lib/comercial/tiendas/__tests__/store-replenishment-allocation-engine.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  buildStoreReplenishmentPlan,
  CANDIDATE_TYPE_PRIORITY,
  InvalidStorePriorityOrderError,
  UnknownReferencePoolError,
  InvalidCandidateConfigurationError,
  type ReplenishmentAllocationInput,
  type ReferencePool,
  type StructureCandidateRef,
  type AllocationCandidateType,
} from "../store-replenishment-allocation-engine";
import {
  buildStoreUnitNeeds,
  type StoreUnitNeedsResult,
  type StructureAvailability,
} from "../store-unit-needs-engine";
import type { SpecialRuleEvaluation } from "../store-unit-coverage-engine";
import { evaluateUnitsRule } from "../../derrotero-semantics";

// ── Helpers ──────────────────────────────────────────────────────────────────

function known(eligibleUnits: number, blockedUnits = 0): StructureAvailability {
  return { status: "CONOCIDA", eligibleUnits, blockedUnits, totalUnits: eligibleUnits + blockedUnits };
}

interface NeedSpec {
  key: string;
  totalUnits: number;           // unidades actuales (regla 8/10/12 salvo override)
  availability?: StructureAvailability;   // ausente = SIN_DATOS en Sprint 5
  covered?: boolean;
  min?: number; ideal?: number; max?: number;
}

/** Construye necesidades con el motor REAL del Sprint 5. */
function makeNeeds(storeId: string, specs: NeedSpec[], specials: SpecialRuleEvaluation[] = []): StoreUnitNeedsResult {
  const availability = new Map<string, StructureAvailability>();
  for (const s of specs) {
    if (s.availability) availability.set(s.key, s.availability);
  }
  return buildStoreUnitNeeds({
    storeId,
    structures: specs.map(s => ({
      structureKey: s.key,
      label: s.key,
      line: "CASTILLITOS",
      structuralCoverageStatus: (s.covered === false ? "SIN_COBERTURA" : "CUBIERTA") as "CUBIERTA" | "SIN_COBERTURA",
      unitRule: evaluateUnitsRule(s.totalUnits, {
        minUnits: s.min ?? 8, idealUnits: s.ideal ?? 10, maxUnits: s.max ?? 12,
      }),
    })),
    specialRules: specials,
    availability,
  });
}

function pool(eligibleUnits: number, underScarcityThreshold = false, productName = "Producto"): ReferencePool {
  return { eligibleUnits, productName, underScarcityThreshold };
}

function candidate(
  referenceCode: string,
  types: Record<string, AllocationCandidateType>,
): StructureCandidateRef {
  return { referenceCode, candidateTypeByStore: new Map(Object.entries(types)) };
}

function makeInput(over: Partial<ReplenishmentAllocationInput> & {
  needsByStore: ReadonlyMap<string, StoreUnitNeedsResult>;
}): ReplenishmentAllocationInput {
  return {
    storePriorityOrder: [...over.needsByStore.keys()],
    materialPriorityStoreIds: ["centro", "caldas"],
    referencePools: new Map(),
    candidatesByStructure: new Map(),
    ...over,
  };
}

const noAvail: Record<string, never> = {};
void noAvail;

// ═════════════════════════════════════════════════════════════════════════════
// 1. Pool global por referencia (obligatorios 1 y 2)
// ═════════════════════════════════════════════════════════════════════════════

describe("pool global por referencia", () => {
  it("OBLIGATORIO 1: una ref candidata en DOS estructuras → un solo pool, cero double-booking", () => {
    const needs = makeNeeds("centro", [
      { key: "E1", totalUnits: 6, availability: known(10) },   // necesita 4
      { key: "E2", totalUnits: 6, availability: known(10) },   // necesita 4
    ]);
    const plan = buildStoreReplenishmentPlan(makeInput({
      needsByStore: new Map([["centro", needs]]),
      referencePools: new Map([["R1", pool(5)]]),
      candidatesByStructure: new Map([
        ["E1", [candidate("R1", { centro: "REPOSICION_MISMA_REFERENCIA" })]],
        ["E2", [candidate("R1", { centro: "REPOSICION_MISMA_REFERENCIA" })]],
      ]),
    }));
    const totalR1 = plan.suggestions.filter(s => s.referenceCode === "R1").reduce((t, s) => t + s.units, 0);
    assert.equal(totalR1, 5);                                   // nunca 8 (4+4)
    assert.equal(plan.poolUsage.get("R1")!.allocated, 5);
    assert.equal(plan.poolUsage.get("R1")!.remaining, 0);
  });

  it("OBLIGATORIO 2: ref duplicada dentro de una estructura → rechazo tipado total", () => {
    const needs = makeNeeds("centro", [{ key: "E1", totalUnits: 6, availability: known(10) }]);
    assert.throws(
      () => buildStoreReplenishmentPlan(makeInput({
        needsByStore: new Map([["centro", needs]]),
        referencePools: new Map([["R1", pool(5)]]),
        candidatesByStructure: new Map([
          ["E1", [
            candidate("R1", { centro: "REPOSICION_MISMA_REFERENCIA" }),
            candidate("R1", { centro: "COMPLEMENTO_REFERENCIA_COMPATIBLE" }),
          ]],
        ]),
      })),
      (e: unknown) => e instanceof InvalidCandidateConfigurationError,
    );
  });

  it("OBLIGATORIO 9: candidata sin entrada en referencePools → error tipado", () => {
    const needs = makeNeeds("centro", [{ key: "E1", totalUnits: 6, availability: known(10) }]);
    assert.throws(
      () => buildStoreReplenishmentPlan(makeInput({
        needsByStore: new Map([["centro", needs]]),
        referencePools: new Map(),
        candidatesByStructure: new Map([["E1", [candidate("HUERFANA", { centro: "REPOSICION_MISMA_REFERENCIA" })]]]),
      })),
      (e: unknown) => e instanceof UnknownReferencePoolError,
    );
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 2. Escasez vs abundancia (obligatorios 3, 4, 5, 12)
// ═════════════════════════════════════════════════════════════════════════════

describe("escasez y abundancia", () => {
  const twoStores = (poolUnits: number) => {
    const centro = makeNeeds("centro", [{ key: "E", totalUnits: 5, ideal: 10, min: 8, availability: known(5) }]);   // necesita 5, exec 5
    const sanDiego = makeNeeds("san_diego", [{ key: "E", totalUnits: 5, ideal: 10, min: 8, availability: known(5) }]);
    return buildStoreReplenishmentPlan(makeInput({
      storePriorityOrder: ["centro", "san_diego"],
      needsByStore: new Map([["centro", centro], ["san_diego", sanDiego]]),
      referencePools: new Map([["R1", pool(poolUnits)]]),
      candidatesByStructure: new Map([
        ["E", [candidate("R1", { centro: "REPOSICION_MISMA_REFERENCIA", san_diego: "REPOSICION_MISMA_REFERENCIA" })]],
      ]),
    }));
  };

  it("OBLIGATORIO 3: exec 5 + exec 5 con pool 5 → asignación total EXACTAMENTE 5", () => {
    const plan = twoStores(5);
    const total = plan.suggestions.reduce((t, s) => t + s.units, 0);
    assert.equal(total, 5);
  });

  it("OBLIGATORIO 5: bajo escasez, allowedStoreIds (centro) recibe primero", () => {
    const plan = twoStores(5);
    const centro = plan.summaryByStore.find(s => s.storeId === "centro")!;
    const sd = plan.summaryByStore.find(s => s.storeId === "san_diego")!;
    assert.equal(centro.allocatedUnits, 5);
    assert.equal(sd.allocatedUnits, 0);
    assert.equal(plan.scarcityMaterialized, true);
    // STORE_PRIORITY presente en la sugerencia de centro (ref disputada):
    const sugg = plan.suggestions.find(s => s.storeId === "centro")!;
    assert.ok(sugg.reasons.some(r => r.code === "STORE_PRIORITY"));
    // y San Diego queda POOL_AGOTADO con unidades exactas:
    const un = plan.unallocated.find(u => u.storeId === "san_diego")!;
    assert.equal(un.reason, "POOL_AGOTADO");
    assert.equal(un.unallocatedExecutableUnits, 5);
  });

  it("OBLIGATORIO 4 y 12: pool abundante → ambas tiendas completas y SIN razón STORE_PRIORITY", () => {
    const plan = twoStores(20);
    for (const st of plan.summaryByStore) {
      assert.equal(st.allocatedUnits, 5);
      assert.equal(st.allocationPendingUnits, 0);
    }
    assert.equal(plan.scarcityMaterialized, false);
    assert.ok(plan.suggestions.every(s => s.reasons.every(r => r.code !== "STORE_PRIORITY")));
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 3. Ejecutable vs requerido (obligatorios 6 y 7)
// ═════════════════════════════════════════════════════════════════════════════

describe("necesidad requerida vs demanda asignable", () => {
  it("OBLIGATORIO 6: required 10, exec 4, asignadas 4 → allocationPending 0, businessPending 6, SIN POOL_AGOTADO", () => {
    // total 0 con regla 8/10/12 → required 10; disponibilidad conocida 4 → exec 4
    const needs = makeNeeds("centro", [{ key: "E", totalUnits: 0, covered: false, availability: known(4) }]);
    const plan = buildStoreReplenishmentPlan(makeInput({
      needsByStore: new Map([["centro", needs]]),
      referencePools: new Map([["R1", pool(10)]]),
      candidatesByStructure: new Map([["E", [candidate("R1", { centro: "REFERENCIA_NUEVA_COMPATIBLE" })]]]),
    }));
    const st = plan.summaryByStore[0];
    assert.equal(st.requiredUnits, 10);
    assert.equal(st.executableUnits, 4);
    assert.equal(st.allocatedUnits, 4);
    assert.equal(st.allocationPendingUnits, 0);
    assert.equal(st.totalBusinessPendingUnits, 6);
    assert.equal(plan.unallocated.length, 0);           // la brecha 10−4 es del Sprint 5
    assert.equal(plan.scarcityMaterialized, false);
  });

  it("OBLIGATORIO 7: required 10, exec 4, pool 2 → asignadas 2, POOL_AGOTADO con difs exactas", () => {
    const needs = makeNeeds("centro", [{ key: "E", totalUnits: 0, covered: false, availability: known(4) }]);
    const plan = buildStoreReplenishmentPlan(makeInput({
      needsByStore: new Map([["centro", needs]]),
      referencePools: new Map([["R1", pool(2)]]),
      candidatesByStructure: new Map([["E", [candidate("R1", { centro: "REFERENCIA_NUEVA_COMPATIBLE" })]]]),
    }));
    const un = plan.unallocated[0];
    assert.equal(un.reason, "POOL_AGOTADO");
    assert.equal(un.allocatedUnits, 2);
    assert.equal(un.unallocatedExecutableUnits, 2);     // 4 − 2
    assert.equal(un.totalPendingUnits, 8);              // 10 − 2
    const st = plan.summaryByStore[0];
    assert.equal(st.allocationPendingUnits, 2);
    assert.equal(st.totalBusinessPendingUnits, 8);
  });

  it("SIN_DATOS jamás se asigna; SIN_DISPONIBILIDAD conserva su causa", () => {
    const needs = makeNeeds("centro", [
      { key: "SD", totalUnits: 6 },                                  // sin availability → SIN_DATOS
      { key: "ZERO", totalUnits: 6, availability: known(0) },        // cero conocido
    ]);
    const plan = buildStoreReplenishmentPlan(makeInput({
      needsByStore: new Map([["centro", needs]]),
      referencePools: new Map([["R1", pool(50)]]),
      candidatesByStructure: new Map([
        ["SD", [candidate("R1", { centro: "REPOSICION_MISMA_REFERENCIA" })]],
        ["ZERO", [candidate("R1", { centro: "REPOSICION_MISMA_REFERENCIA" })]],
      ]),
    }));
    assert.equal(plan.suggestions.length, 0);
    assert.deepEqual(
      plan.unallocated.map(u => u.reason).sort(),
      ["SIN_DATOS_DISPONIBILIDAD", "SIN_DISPONIBILIDAD"],
    );
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 4. Candidatos: tipos, orden y encadenamiento (obligatorios 10, 13, 14)
// ═════════════════════════════════════════════════════════════════════════════

describe("candidatos", () => {
  it("reposición misma referencia antes que complemento y que nueva", () => {
    const needs = makeNeeds("centro", [{ key: "E", totalUnits: 6, availability: known(4) }]);   // necesita 4, exec 4
    const plan = buildStoreReplenishmentPlan(makeInput({
      needsByStore: new Map([["centro", needs]]),
      referencePools: new Map([["NUEVA", pool(50)], ["COMP", pool(50)], ["REPO", pool(50)]]),
      candidatesByStructure: new Map([["E", [
        candidate("NUEVA", { centro: "REFERENCIA_NUEVA_COMPATIBLE" }),
        candidate("COMP", { centro: "COMPLEMENTO_REFERENCIA_COMPATIBLE" }),
        candidate("REPO", { centro: "REPOSICION_MISMA_REFERENCIA" }),
      ]]]),
    }));
    assert.equal(plan.suggestions.length, 1);
    assert.equal(plan.suggestions[0].referenceCode, "REPO");
    assert.equal(CANDIDATE_TYPE_PRIORITY.REPOSICION_MISMA_REFERENCIA, 300);
  });

  it("OBLIGATORIO 13 y 14: necesidad cubierta con DOS referencias — Σ nunca supera executable", () => {
    const needs = makeNeeds("centro", [{ key: "E", totalUnits: 2, availability: known(8) }]);   // necesita 8, exec 8
    const plan = buildStoreReplenishmentPlan(makeInput({
      needsByStore: new Map([["centro", needs]]),
      referencePools: new Map([["R1", pool(3)], ["R2", pool(50)]]),
      candidatesByStructure: new Map([["E", [
        candidate("R1", { centro: "REPOSICION_MISMA_REFERENCIA" }),
        candidate("R2", { centro: "COMPLEMENTO_REFERENCIA_COMPATIBLE" }),
      ]]]),
    }));
    assert.equal(plan.suggestions.length, 2);
    assert.equal(plan.suggestions[0].referenceCode, "R1");       // se agota (3)
    assert.equal(plan.suggestions[0].units, 3);
    assert.equal(plan.suggestions[1].referenceCode, "R2");       // continúa (5)
    assert.equal(plan.suggestions[1].units, 5);
    const total = plan.suggestions.reduce((t, s) => t + s.units, 0);
    assert.equal(total, 8);                                       // = executable exacto
  });

  it("OBLIGATORIO 10: la misma ref conserva el tipo de CADA tienda", () => {
    const centro = makeNeeds("centro", [{ key: "E", totalUnits: 6, availability: known(4) }]);
    const sd = makeNeeds("san_diego", [{ key: "E", totalUnits: 0, covered: false, availability: known(4) }]);
    const plan = buildStoreReplenishmentPlan(makeInput({
      storePriorityOrder: ["centro", "san_diego"],
      needsByStore: new Map([["centro", centro], ["san_diego", sd]]),
      referencePools: new Map([["R1", pool(50)]]),
      candidatesByStructure: new Map([["E", [
        candidate("R1", { centro: "REPOSICION_MISMA_REFERENCIA", san_diego: "REFERENCIA_NUEVA_COMPATIBLE" }),
      ]]]),
    }));
    const sc = plan.suggestions.find(s => s.storeId === "centro")!;
    const ss = plan.suggestions.find(s => s.storeId === "san_diego")!;
    assert.equal(sc.candidateType, "REPOSICION_MISMA_REFERENCIA");
    assert.equal(ss.candidateType, "REFERENCIA_NUEVA_COMPATIBLE");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 5. Validaciones, retiros y razones (obligatorios 8, 11, 15)
// ═════════════════════════════════════════════════════════════════════════════

describe("validaciones y retiros", () => {
  it("OBLIGATORIO 8: orden de tiendas duplicado, incompleto o desconocido → error tipado", () => {
    const needs = makeNeeds("centro", [{ key: "E", totalUnits: 6, availability: known(4) }]);
    const base = { needsByStore: new Map([["centro", needs]]) };
    for (const order of [["centro", "centro"], ["centro", "fantasma"], [] as string[], [""]]) {
      assert.throws(
        () => buildStoreReplenishmentPlan(makeInput({ ...base, storePriorityOrder: order })),
        (e: unknown) => e instanceof InvalidStorePriorityOrderError,
      );
    }
  });

  it("los RETIRO pasan al plan sin consumir pool y fuera de las sumas de reposición", () => {
    const special: SpecialRuleEvaluation = {
      pattern: "CORRAL", label: "CORRAL", storeId: "centro",
      idealUnits: 0, totalUnits: 2, matchedReferenceCount: 1,
      status: "NO_AUTORIZADA", gapUnits: 2, severity: "high",
    };
    const needs = makeNeeds("centro", [{ key: "E", totalUnits: 6, availability: known(4) }], [special]);
    const plan = buildStoreReplenishmentPlan(makeInput({
      needsByStore: new Map([["centro", needs]]),
      referencePools: new Map([["R1", pool(4)]]),
      candidatesByStructure: new Map([["E", [candidate("R1", { centro: "REPOSICION_MISMA_REFERENCIA" })]]]),
    }));
    assert.equal(plan.withdrawals.length, 1);
    assert.equal(plan.withdrawals[0].action, "RETIRO");
    assert.equal(plan.poolUsage.get("R1")!.allocated, 4);        // el retiro no tocó el pool
    const st = plan.summaryByStore[0];
    assert.equal(st.requiredUnits, 4);                            // reposición solamente
    assert.equal(st.withdrawalUnits, 2);                          // retiro aparte
  });

  it("OBLIGATORIO 11: RULE_36_SCARCITY solo cuando la ref está bajo el umbral", () => {
    const needs = makeNeeds("centro", [
      { key: "A", totalUnits: 6, availability: known(4) },
      { key: "B", totalUnits: 6, availability: known(4) },
    ]);
    const plan = buildStoreReplenishmentPlan(makeInput({
      needsByStore: new Map([["centro", needs]]),
      referencePools: new Map([["ESCASA", pool(4, true)], ["NORMAL", pool(50, false)]]),
      candidatesByStructure: new Map([
        ["A", [candidate("ESCASA", { centro: "REPOSICION_MISMA_REFERENCIA" })]],
        ["B", [candidate("NORMAL", { centro: "REPOSICION_MISMA_REFERENCIA" })]],
      ]),
    }));
    const sa = plan.suggestions.find(s => s.referenceCode === "ESCASA")!;
    const sb = plan.suggestions.find(s => s.referenceCode === "NORMAL")!;
    assert.ok(sa.reasons.some(r => r.code === "RULE_36_SCARCITY"));
    assert.ok(sb.reasons.every(r => r.code !== "RULE_36_SCARCITY"));
  });

  it("toda sugerencia trae las razones mínimas estructuradas", () => {
    const needs = makeNeeds("centro", [{ key: "E", totalUnits: 6, availability: known(4) }]);
    const plan = buildStoreReplenishmentPlan(makeInput({
      needsByStore: new Map([["centro", needs]]),
      referencePools: new Map([["R1", pool(50)]]),
      candidatesByStructure: new Map([["E", [candidate("R1", { centro: "REPOSICION_MISMA_REFERENCIA" })]]]),
    }));
    const codes = plan.suggestions[0].reasons.map(r => r.code);
    assert.ok(codes.includes("NEED_PRIORITY"));
    assert.ok(codes.includes("SAME_REFERENCE_FIRST"));
    assert.ok(codes.includes("EXECUTABLE_CAP") || codes.includes("STOCK_CAP"));
    assert.ok(plan.suggestions[0].reasons.every(r => r.detail.length > 0));
  });

  it("OBLIGATORIO 15: la entrada y sus ReadonlyMap permanecen sin mutación", () => {
    const needs = makeNeeds("centro", [{ key: "E", totalUnits: 6, availability: known(4) }]);
    const pools = new Map([["R1", Object.freeze(pool(5)) as ReferencePool]]);
    const cands = new Map([["E", Object.freeze([
      Object.freeze(candidate("R1", { centro: "REPOSICION_MISMA_REFERENCIA" })) as StructureCandidateRef,
    ]) as readonly StructureCandidateRef[]]]);
    const frozenOrder = Object.freeze(["centro"]) as readonly string[];

    const plan = buildStoreReplenishmentPlan({
      storePriorityOrder: frozenOrder,
      materialPriorityStoreIds: Object.freeze(["centro", "caldas"]) as readonly string[],
      needsByStore: new Map([["centro", needs]]),
      referencePools: pools,
      candidatesByStructure: cands,
    });

    assert.equal(plan.suggestions[0].units, 4);
    assert.equal(pools.get("R1")!.eligibleUnits, 5);   // pool de entrada intacto
    assert.equal(plan.poolUsage.get("R1")!.remaining, 1);
  });

  it("orden determinista de candidatas ante empate total: referenceCode ascendente", () => {
    const needs = makeNeeds("centro", [{ key: "E", totalUnits: 8, availability: known(2) }]);  // necesita 2, exec 2
    const plan = buildStoreReplenishmentPlan(makeInput({
      needsByStore: new Map([["centro", needs]]),
      referencePools: new Map([["ZR", pool(10)], ["AR", pool(10)]]),
      candidatesByStructure: new Map([["E", [
        candidate("ZR", { centro: "COMPLEMENTO_REFERENCIA_COMPATIBLE" }),
        candidate("AR", { centro: "COMPLEMENTO_REFERENCIA_COMPATIBLE" }),
      ]]]),
    }));
    assert.equal(plan.suggestions[0].referenceCode, "AR");
  });
});
