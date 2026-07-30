/**
 * lib/comercial/tiendas/__tests__/store-derrotero-subgroup-semantics.test.ts
 *
 * AGENTIK-DERROTERO-SUBGROUP-SEMANTICS-FIX-01 — certification tests.
 *
 * Certifica la regla: coverageUnits(subgrupo) = SUM(unidades de todas las
 * referencias elegibles del subgrupo). Ninguna referencia individual define
 * por sí sola el cumplimiento del derrotero. Los casos van por los motores
 * REALES de los Sprints 1, 4, 5 y 6 — cero simulación.
 *
 * Incluye el guardián de etiquetas: ninguna pantalla del derrotero describe
 * la meta como "por referencia".
 *
 * Run: npx tsx --test lib/comercial/tiendas/__tests__/store-derrotero-subgroup-semantics.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";

import { evaluateUnitsRule } from "../../derrotero-semantics";
import { evaluateUnitStructureCoverage } from "../store-unit-coverage-engine";
import { buildStoreUnitNeeds, type StructureAvailability } from "../store-unit-needs-engine";
import { buildStoreReplenishmentPlan } from "../store-replenishment-allocation-engine";

const RULE = { minUnits: 8, idealUnits: 10, maxUnits: 12 };

function known(eligibleUnits: number): StructureAvailability {
  return { status: "CONOCIDA", eligibleUnits, blockedUnits: 0, totalUnits: eligibleUnits };
}

function needsForRefs(refUnits: number[], availability?: StructureAvailability) {
  return buildStoreUnitNeeds({
    storeId: "centro",
    structures: [{
      structureKey: "CS|G|SUB", label: "SUB", line: "CASTILLITOS",
      structuralCoverageStatus: "CUBIERTA",
      unitRule: evaluateUnitsRule(refUnits, RULE),
    }],
    specialRules: [],
    availability: new Map(availability ? [["CS|G|SUB", availability]] : []),
  });
}

// ═════════════════════════════════════════════════════════════════════════════
// 1. Cobertura agregada del subgrupo (obligatorias 1 y 8 de la orden)
// ═════════════════════════════════════════════════════════════════════════════

describe("cobertura por total agregado del subgrupo", () => {
  it("OBLIGATORIA: 3 referencias que SUMAN el ideal (4+3+3=10) → subgrupo CUBIERTO", () => {
    const cov = evaluateUnitStructureCoverage([4, 3, 3], RULE);
    assert.equal(cov.quantitativeStatus, "SALUDABLE");
    assert.equal(cov.unitRule.totalUnits, 10);
    assert.equal(cov.unitRule.deficitToIdeal, 0);
    // Y el motor de necesidades NO genera fila alguna:
    const needs = needsForRefs([4, 3, 3]);
    assert.equal(needs.needs.length, 0);
  });

  it("OBLIGATORIA: 3 referencias que suman MENOS del ideal (2+2+2=6) → UNA sola necesidad de 4 agregada", () => {
    const needs = needsForRefs([2, 2, 2], known(50));
    assert.equal(needs.needs.length, 1);                       // una necesidad, no tres
    assert.equal(needs.needs[0].requiredUnits, 4);             // 10 − 6, agregado
    assert.equal(needs.needs[0].structureKey, "CS|G|SUB");     // del subgrupo, no de una ref
    // Jamás 4 unidades POR CADA referencia (12):
    assert.notEqual(needs.summary.replenishment.requiredUnits, 12);
    assert.equal(needs.summary.replenishment.requiredUnits, 4);
  });

  it("OBLIGATORIA: una referencia supera el ideal (11) pero el total ≤ máximo → NO retirar", () => {
    const cov = evaluateUnitStructureCoverage([11], RULE);     // 11 > ideal 10, pero ≤ max 12
    assert.equal(cov.quantitativeStatus, "SALUDABLE");
    assert.equal(cov.unitRule.excessOverMax, 0);               // cero exceso, cero retiro
    assert.equal(needsForRefs([11]).needs.length, 0);
    // Mezcla: una ref de 11 + otra de 1 = 12 = máximo exacto → tampoco
    const mix = evaluateUnitStructureCoverage([11, 1], RULE);
    assert.equal(mix.unitRule.excessOverMax, 0);
  });

  it("OBLIGATORIA: varias referencias superan el máximo EN CONJUNTO (7+7=14) → exceso AGREGADO de 2", () => {
    const cov = evaluateUnitStructureCoverage([7, 7], RULE);
    assert.equal(cov.unitRule.status, "OVER_MAXIMUM");
    assert.equal(cov.unitRule.excessOverMax, 2);               // 14 − 12, del subgrupo
    // El exceso NO genera necesidad de reposición (ley del Sprint 5):
    assert.equal(needsForRefs([7, 7]).needs.length, 0);
    // Y ninguna referencia individual dispara el veredicto: 7 y 7 están bajo el máximo.
  });

  it("no existe lógica eachReference < ideal → necesidad: 5 refs de 2 (=10) sanas aunque cada una < ideal", () => {
    const needs = needsForRefs([2, 2, 2, 2, 2]);
    assert.equal(needs.needs.length, 0);                       // cada ref < 10 y NO pasa nada
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 2. Reposición completa el déficit agregado con varias referencias (obligatoria)
// ═════════════════════════════════════════════════════════════════════════════

describe("reposición del déficit agregado", () => {
  it("OBLIGATORIA: el motor completa el déficit del subgrupo con VARIAS referencias compatibles", () => {
    // Subgrupo con 6 unidades (2+2+2), ideal 10 → necesidad agregada de 4.
    const needs = needsForRefs([2, 2, 2], known(4));
    const plan = buildStoreReplenishmentPlan({
      storePriorityOrder: ["centro"],
      materialPriorityStoreIds: ["centro", "caldas"],
      needsByStore: new Map([["centro", needs]]),
      referencePools: new Map([
        ["REF_X", { eligibleUnits: 3, productName: "X", underScarcityThreshold: false }],
        ["REF_Y", { eligibleUnits: 50, productName: "Y", underScarcityThreshold: false }],
      ]),
      candidatesByStructure: new Map([["CS|G|SUB", [
        { referenceCode: "REF_X", candidateTypeByStore: new Map([["centro", "REPOSICION_MISMA_REFERENCIA" as const]]) },
        { referenceCode: "REF_Y", candidateTypeByStore: new Map([["centro", "COMPLEMENTO_REFERENCIA_COMPATIBLE" as const]]) },
      ]]]),
    });

    // Dos sugerencias del MISMO subgrupo cuya suma = déficit agregado exacto:
    assert.equal(plan.suggestions.length, 2);
    assert.ok(plan.suggestions.every(s => s.structureKey === "CS|G|SUB"));
    assert.equal(plan.suggestions[0].units + plan.suggestions[1].units, 4);
    assert.equal(plan.unallocated.length, 0);
    assert.equal(plan.summaryByStore[0].allocatedUnits, 4);    // 4 para el subgrupo, no por ref
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 3. Guardián de etiquetas: ninguna pantalla describe la meta "por referencia"
// ═════════════════════════════════════════════════════════════════════════════

describe("guardián de semántica visible", () => {
  const UI_FILES = [
    "components/comercial/store-supply-rules-tab.tsx",
    "app/(app)/[orgSlug]/comercial/tiendas/tiendas-client.tsx",
  ];

  it("OBLIGATORIA: las pantallas del derrotero no usan 'por referencia' para la meta", () => {
    const repoRoot = path.resolve(__dirname, "../../../..");
    for (const rel of UI_FILES) {
      const src = fs.readFileSync(path.join(repoRoot, rel), "utf8");
      assert.ok(!/regla de unidades por referencia/i.test(src), `${rel} aún titula 'por referencia'`);
      assert.ok(!/meta.{0,20}por referencia/i.test(src), `${rel} describe la meta 'por referencia'`);
      // Los textos certificados presentes:
      if (rel.includes("store-supply-rules-tab")) {
        assert.ok(src.includes("Meta de cobertura por subgrupo"));
        assert.ok(src.includes("Total del subgrupo debajo: surtir"));
        assert.ok(src.includes("Meta agregada del subgrupo"));
        assert.ok(src.includes("Total del subgrupo encima: retirar excedente"));
      }
    }
  });
});
