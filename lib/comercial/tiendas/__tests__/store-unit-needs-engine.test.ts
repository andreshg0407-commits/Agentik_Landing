/**
 * lib/comercial/tiendas/__tests__/store-unit-needs-engine.test.ts
 *
 * AGENTIK-STORES-UNIT-BASED-NEEDS-ENGINE-01 — certification tests.
 * Incluye los 12 casos obligatorios de la revisión arquitectónica.
 *
 * Run: npx tsx --test lib/comercial/tiendas/__tests__/store-unit-needs-engine.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  buildStoreUnitNeeds,
  compareUnitNeeds,
  UNIT_NEED_PRIORITY,
  InvalidStoreMeasurementUnitError,
  AvailabilityInvariantError,
  type UnitNeedsInput,
  type StructureAvailability,
} from "../store-unit-needs-engine";
import type { UnitsRuleEvaluation, SpecialRuleEvaluation } from "../store-unit-coverage-engine";
import { evaluateUnitsRule } from "../../derrotero-semantics";

// ── Helpers ──────────────────────────────────────────────────────────────────

/** REAL certified evaluation via the Sprint-1 law (never hand-rolled). */
function rule(units: number | number[], min = 8, ideal = 10, max = 12): UnitsRuleEvaluation {
  return evaluateUnitsRule(units, { minUnits: min, idealUnits: ideal, maxUnits: max });
}

function structure(structureKey: string, unitRule: UnitsRuleEvaluation, covered = true) {
  return {
    structureKey,
    label: structureKey,
    line: "CASTILLITOS",
    structuralCoverageStatus: (covered ? "CUBIERTA" : "SIN_COBERTURA") as "CUBIERTA" | "SIN_COBERTURA",
    unitRule,
  };
}

function known(eligibleUnits: number, blockedUnits = 0): StructureAvailability {
  return { status: "CONOCIDA", eligibleUnits, blockedUnits, totalUnits: eligibleUnits + blockedUnits };
}

function special(
  pattern: string,
  status: SpecialRuleEvaluation["status"],
  gapUnits: number,
  idealUnits = 3,
  totalUnits = 0,
): SpecialRuleEvaluation {
  return {
    pattern,
    label: pattern.replace(/_/g, " "),
    storeId: "san_diego",
    idealUnits,
    totalUnits,
    matchedReferenceCount: 1,
    status,
    gapUnits,
    severity: status === "NO_AUTORIZADA" ? "high" : status === "FALTANTE" ? "medium" : "none",
  };
}

function input(
  structures: ReturnType<typeof structure>[],
  availability: Record<string, StructureAvailability> = {},
  specialRules: SpecialRuleEvaluation[] = [],
): UnitNeedsInput {
  return {
    storeId: "san_diego",
    structures,
    specialRules,
    availability: new Map(Object.entries(availability)),
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// 1. Déficits verbatim — STORE=UNITS (casos obligatorios 1 y 10)
// ═════════════════════════════════════════════════════════════════════════════

describe("déficits verbatim y ley STORE=UNITS", () => {
  it("necesidad = deficitToIdeal exacto, con trazabilidad de cobertura", () => {
    const r = buildStoreUnitNeeds(input([structure("X", rule(6))], { X: known(100) }));
    assert.equal(r.needs[0].requiredUnits, 4);
    assert.equal(r.needs[0].deficitToIdeal, 4);
    assert.equal(r.needs[0].deficitToMin, 2);
    assert.equal(r.needs[0].action, "REPOSICION");
    assert.equal(r.needs[0].source, "ESTRUCTURA");
  });

  it("OBLIGATORIO 1: mismo déficit con distinta cantidad de referencias → necesidad idéntica", () => {
    const a = buildStoreUnitNeeds(input([structure("X", rule([6]))]));            // 1 ref
    const b = buildStoreUnitNeeds(input([structure("X", rule([1, 1, 1, 1, 1, 1]))])); // 6 refs
    assert.equal(a.needs[0].requiredUnits, b.needs[0].requiredUnits);
    assert.equal(a.needs[0].deficitToMin, b.needs[0].deficitToMin);
    assert.equal(a.needs[0].priorityClass, b.needs[0].priorityClass);
  });

  it("estructura saludable o con exceso no genera necesidad", () => {
    const r = buildStoreUnitNeeds(input([structure("A", rule(10)), structure("B", rule(15))]));
    assert.equal(r.needs.length, 0);
  });

  it("OBLIGATORIO 10: REFERENCES → error tipado y CERO resultado parcial", () => {
    const bad = { ...rule(6), measurementUnit: "REFERENCES" as "UNITS" };
    // La estructura inválida va DE ÚLTIMA y aun así nada se emite:
    try {
      buildStoreUnitNeeds(input([structure("VALIDA", rule(2)), structure("INVALIDA", bad)]));
      assert.fail("debió lanzar");
    } catch (e) {
      assert.ok(e instanceof InvalidStoreMeasurementUnitError);
      assert.equal((e as InvalidStoreMeasurementUnitError).code, "INVALID_STORE_MEASUREMENT_UNIT");
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 2. Disponibilidad (casos obligatorios 2, 3, 4 y 5)
// ═════════════════════════════════════════════════════════════════════════════

describe("disponibilidad", () => {
  it("COMPLETA: ejecutable = necesidad, nunca más", () => {
    const r = buildStoreUnitNeeds(input([structure("X", rule(6))], { X: known(10, 2) }));
    assert.equal(r.needs[0].executionStatus, "COMPLETA");
    assert.equal(r.needs[0].executableUnits, 4);
    assert.equal(r.needs[0].pendingUnits, 0);
  });

  it("PARCIAL: ejecutable 2 de 4, pendiente 2 — la necesidad NO se reescribe", () => {
    const r = buildStoreUnitNeeds(input([structure("X", rule(6))], { X: known(2) }));
    assert.equal(r.needs[0].executionStatus, "PARCIAL");
    assert.equal(r.needs[0].requiredUnits, 4);
    assert.equal(r.needs[0].executableUnits, 2);
    assert.equal(r.needs[0].pendingUnits, 2);
  });

  it("OBLIGATORIO 3: CONOCIDA con cero → SIN_DISPONIBILIDAD (cero certificado)", () => {
    const r = buildStoreUnitNeeds(input([structure("X", rule(6))], { X: known(0, 0) }));
    assert.equal(r.needs[0].executionStatus, "SIN_DISPONIBILIDAD");
    assert.equal(r.needs[0].executableUnits, 0);
  });

  it("OBLIGATORIO 2: clave AUSENTE → SIN_DATOS_DISPONIBILIDAD, necesidad intacta", () => {
    const r = buildStoreUnitNeeds(input([structure("X", rule(6))], {}));
    assert.equal(r.needs[0].executionStatus, "SIN_DATOS_DISPONIBILIDAD");
    assert.equal(r.needs[0].requiredUnits, 4);
    assert.equal(r.needs[0].executableUnits, null);
    assert.equal(r.needs[0].pendingUnits, null);
  });

  it("OBLIGATORIO 4: eligible 2 + blocked 8 = total 10 → ejecutable 2, nunca 10", () => {
    const r = buildStoreUnitNeeds(input([structure("X", rule(0))], { X: known(2, 8) }));
    assert.equal(r.needs[0].requiredUnits, 10);
    assert.equal(r.needs[0].executableUnits, 2);
    assert.equal(r.needs[0].pendingUnits, 8);
    assert.equal(r.needs[0].executionStatus, "PARCIAL");
  });

  it("OBLIGATORIO 5: eligible + blocked ≠ total → RECHAZO tipado", () => {
    const broken = { status: "CONOCIDA", eligibleUnits: 2, blockedUnits: 3, totalUnits: 10 } as StructureAvailability;
    try {
      buildStoreUnitNeeds(input([structure("X", rule(6))], { X: broken }));
      assert.fail("debió lanzar");
    } catch (e) {
      assert.ok(e instanceof AvailabilityInvariantError);
      assert.equal((e as AvailabilityInvariantError).code, "AVAILABILITY_INVARIANT_VIOLATION");
    }
  });

  it("SIN_DATOS explícito equivale a clave ausente", () => {
    const r = buildStoreUnitNeeds(input([structure("X", rule(6))], { X: { status: "SIN_DATOS" } }));
    assert.equal(r.needs[0].executionStatus, "SIN_DATOS_DISPONIBILIDAD");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 3. Reglas especiales y dirección operativa (obligatorios 6, 7, 8 y 9)
// ═════════════════════════════════════════════════════════════════════════════

describe("reglas especiales y dirección operativa", () => {
  it("OBLIGATORIO 9: FALTANTE conserva gapUnits exacto, con cap de disponibilidad", () => {
    const r = buildStoreUnitNeeds(input(
      [],
      { "ESPECIAL|BANERA": known(1) },
      [special("BANERA", "FALTANTE", 2)],
    ));
    assert.equal(r.needs[0].requiredUnits, 2);
    assert.equal(r.needs[0].executableUnits, 1);
    assert.equal(r.needs[0].action, "REPOSICION");
    assert.equal(r.needs[0].priorityClass, "SPECIAL_RULE_MISSING");
    assert.equal(r.needs[0].deficitToMin, null);   // trazabilidad solo estructural
  });

  it("OBLIGATORIO 6: NO_AUTORIZADA no consulta ni se limita por disponibilidad", () => {
    // Disponibilidad de reposición en cero absoluto — el retiro no la mira:
    const r = buildStoreUnitNeeds(input(
      [],
      { "ESPECIAL|CORRAL": known(0, 0) },
      [special("CORRAL", "NO_AUTORIZADA", 2, 0, 2)],
    ));
    const n = r.needs[0];
    assert.equal(n.action, "RETIRO");
    assert.equal(n.executionStatus, "COMPLETA");   // el retiro siempre es ejecutable
    assert.equal(n.requiredUnits, 2);
    assert.equal(n.executableUnits, 2);
    assert.equal(n.pendingUnits, 0);
    assert.equal(n.availability, null);            // no aplica a retiros
    assert.equal(n.severity, "high");              // vocabulario canónico Sprint 4
    assert.equal(n.priorityClass, "UNAUTHORIZED_REMOVAL");
  });

  it("OBLIGATORIO 7: el RETIRO no se suma a replenishment.requiredUnits", () => {
    const r = buildStoreUnitNeeds(input(
      [structure("X", rule(6))],
      { X: known(10) },
      [special("CORRAL", "NO_AUTORIZADA", 5, 0, 5)],
    ));
    assert.equal(r.summary.replenishment.requiredUnits, 4);   // solo la estructura
    assert.equal(r.summary.replenishment.needCount, 1);
    assert.equal(r.summary.removals.requiredUnits, 5);        // el retiro, aparte
    assert.equal(r.summary.removals.needCount, 1);
  });

  it("OBLIGATORIO 8: EXCEDENTE no genera UnitNeed (ni CUMPLIDA)", () => {
    const r = buildStoreUnitNeeds(input([], {}, [
      special("BANERA", "EXCEDENTE", 2, 3, 5),
      special("CORRAL", "CUMPLIDA", 0, 3, 3),
    ]));
    assert.equal(r.needs.length, 0);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 4. Prioridad determinista (obligatorio 11) y summary
// ═════════════════════════════════════════════════════════════════════════════

describe("prioridad determinista", () => {
  it("orden por clase certificada: RETIRO > SIN_COBERTURA > BAJO_MIN > ESPECIAL > A_IDEAL", () => {
    const r = buildStoreUnitNeeds(input(
      [
        structure("A_IDEAL", rule(9)),
        structure("SIN_COB", rule(0), false),
        structure("BAJO_MIN", rule(6)),
      ],
      {},
      [special("BANERA", "FALTANTE", 2), special("CORRAL", "NO_AUTORIZADA", 1, 0, 1)],
    ));
    assert.deepEqual(r.needs.map(n => n.priorityClass), [
      "UNAUTHORIZED_REMOVAL", "NO_COVERAGE", "BELOW_MINIMUM", "SPECIAL_RULE_MISSING", "TO_IDEAL",
    ]);
    assert.equal(UNIT_NEED_PRIORITY[r.needs[0].priorityClass], 500);
  });

  it("OBLIGATORIO 11: empate total → desempate determinista por structureKey ascendente", () => {
    const r = buildStoreUnitNeeds(input([
      structure("ZETA", rule(6)),
      structure("ALFA", rule(6)),
      structure("MEDIO", rule(6)),
    ]));
    // misma clase, mismo score → orden alfabético estable
    assert.deepEqual(r.needs.map(n => n.structureKey), ["ALFA", "MEDIO", "ZETA"]);
    // y compareUnitNeeds es antisimétrica en el empate
    assert.equal(compareUnitNeeds(r.needs[0], r.needs[0]), 0);
  });

  it("summary de cobertura cuenta por capacidad de ejecución", () => {
    const r = buildStoreUnitNeeds(input(
      [
        structure("FULL", rule(6)),      // disp 10 → COMPLETA
        structure("PART", rule(6)),      // disp 2  → PARCIAL
        structure("ZERO", rule(6)),      // disp 0  → SIN_DISPONIBILIDAD
        structure("UNKW", rule(6)),      // ausente → SIN_DATOS
      ],
      { FULL: known(10), PART: known(2), ZERO: known(0) },
    ));
    assert.deepEqual(r.summary.coverage, {
      fullyCoverableCount: 1,
      partiallyCoverableCount: 1,
      unavailableCount: 1,
      unknownAvailabilityCount: 1,
    });
    assert.equal(r.summary.replenishment.unknownAvailabilityUnits, 4);
    assert.equal(r.summary.replenishment.executableUnits, 6);  // 4 + 2 + 0
    assert.equal(r.summary.replenishment.pendingUnits, 6);     // 0 + 2 + 4
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 5. Inmutabilidad de entrada (obligatorio 12)
// ═════════════════════════════════════════════════════════════════════════════

describe("inmutabilidad", () => {
  it("OBLIGATORIO 12: el engine no muta structures, specialRules, availability ni unitRule", () => {
    const frozenRule = Object.freeze(rule(6));
    const frozenStructure = Object.freeze({
      structureKey: "X",
      label: "X",
      line: "CASTILLITOS",
      structuralCoverageStatus: "CUBIERTA" as const,
      unitRule: frozenRule,
    });
    const frozenSpecial = Object.freeze(special("BANERA", "FALTANTE", 2));
    const frozenAvail = Object.freeze(known(3)) as StructureAvailability;
    const availabilityMap = new Map([["X", frozenAvail]]);
    const structures = Object.freeze([frozenStructure]);
    const specialRules = Object.freeze([frozenSpecial]);

    // Con todo congelado, cualquier mutación lanzaría TypeError en modo estricto.
    const r = buildStoreUnitNeeds({
      storeId: "san_diego",
      structures,
      specialRules,
      availability: availabilityMap,
    });

    assert.equal(r.needs.length, 2);
    assert.equal(frozenRule.deficitToIdeal, 4);          // intacto
    assert.equal(availabilityMap.get("X"), frozenAvail); // misma referencia, sin reemplazo
    assert.equal(frozenSpecial.gapUnits, 2);             // intacto
  });
});
