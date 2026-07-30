/**
 * lib/comercial/tiendas/__tests__/store-rule36-eligibility.test.ts
 *
 * AGENTIK-NEEDS-RULE36-DIAGNOSIS-FIX-01 — certification tests.
 *
 * Certifica la ley de la Regla 36 y las pruebas obligatorias de la orden:
 *   global ≤ 36 → Centro ELEGIBLE · Caldas ELEGIBLE · San Diego BLOQUEADA ·
 *   Gran Plaza BLOQUEADA. Centro elegible con pool agotado → razón "pool
 *   agotado", nunca "Regla 36". blockedUnits ajenos no contaminan a Centro.
 *
 * Run: npx tsx --test lib/comercial/tiendas/__tests__/store-rule36-eligibility.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { isRule36Eligible } from "../store-rule36-eligibility";
import {
  buildStoreNeedsTabPresentation,
  deriveUnassignedDisplayCode,
} from "../store-unit-needs-presentation";
import { buildStoreReplenishmentPlan } from "../store-replenishment-allocation-engine";
import { buildStoreUnitNeeds, type StructureAvailability } from "../store-unit-needs-engine";
import { evaluateUnitsRule } from "../../derrotero-semantics";

const RULE36 = { scarcityThreshold: 36, allowedStoreIds: ["centro", "caldas"] as const };

function eligible(mainStockUnits: number, destinationStoreId: string): boolean {
  return isRule36Eligible({ mainStockUnits, destinationStoreId, ...RULE36, allowedStoreIds: [...RULE36.allowedStoreIds] });
}

// ═════════════════════════════════════════════════════════════════════════════
// 1. Pruebas obligatorias del predicado (destino × escasez)
// ═════════════════════════════════════════════════════════════════════════════

describe("predicado canónico de la Regla 36", () => {
  it("OBLIGATORIA: global ≤ 36, destino Centro → ELEGIBLE", () => {
    assert.equal(eligible(36, "centro"), true);
    assert.equal(eligible(1, "centro"), true);
  });

  it("OBLIGATORIA: global ≤ 36, destino Caldas → ELEGIBLE", () => {
    assert.equal(eligible(36, "caldas"), true);
    assert.equal(eligible(5, "caldas"), true);
  });

  it("OBLIGATORIA: global ≤ 36, destino San Diego → BLOQUEADA", () => {
    assert.equal(eligible(36, "san_diego"), false);
    assert.equal(eligible(10, "san_diego"), false);
  });

  it("OBLIGATORIA: global ≤ 36, destino Gran Plaza → BLOQUEADA", () => {
    assert.equal(eligible(36, "gran_plaza"), false);
  });

  it("global > 36 → elegible para TODAS las tiendas", () => {
    for (const store of ["centro", "caldas", "san_diego", "gran_plaza"]) {
      assert.equal(eligible(37, store), true);
      assert.equal(eligible(500, store), true);
    }
  });

  it("la elegibilidad NO depende de si la tienda ya tiene la referencia (bug corregido)", () => {
    // El predicado no recibe presencia — es imposible reintroducir el bug
    // `isReposicion && allowed` sin cambiar el contrato certificado.
    assert.equal(eligible(20, "centro"), true);   // complemento o nueva: igual de elegible
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 2. Pruebas obligatorias de diagnóstico (motores reales + presentación)
// ═════════════════════════════════════════════════════════════════════════════

function known(eligibleUnits: number, blockedUnits = 0): StructureAvailability {
  return { status: "CONOCIDA", eligibleUnits, blockedUnits, totalUnits: eligibleUnits + blockedUnits };
}

function needsFor(storeId: string, availability: StructureAvailability) {
  return buildStoreUnitNeeds({
    storeId,
    structures: [{
      structureKey: "E", label: "Estructura E", line: "CASTILLITOS",
      structuralCoverageStatus: "CUBIERTA",
      unitRule: evaluateUnitsRule(6, { minUnits: 8, idealUnits: 10, maxUnits: 12 }),   // necesita 4
    }],
    specialRules: [],
    availability: new Map([["E", availability]]),
  });
}

describe("diagnóstico contextualizado por tienda destino", () => {
  it("OBLIGATORIA: Centro elegible pero pool agotado → razón POOL AGOTADO, nunca Regla 36", () => {
    // Centro: disponibilidad elegible CONOCIDA (post-fix: blocked=0 para permitidas),
    // pero el pool global ya fue consumido en la corrida.
    const centro = needsFor("centro", known(4, 0));
    const caldas = needsFor("caldas", known(4, 0));
    const plan = buildStoreReplenishmentPlan({
      storePriorityOrder: ["caldas", "centro"],        // caldas consume primero el pool
      materialPriorityStoreIds: ["centro", "caldas"],
      needsByStore: new Map([["caldas", caldas], ["centro", centro]]),
      referencePools: new Map([["R1", { eligibleUnits: 4, productName: "R1", underScarcityThreshold: true }]]),
      candidatesByStructure: new Map([["E", [{
        referenceCode: "R1",
        candidateTypeByStore: new Map([
          ["caldas", "COMPLEMENTO_REFERENCIA_COMPATIBLE" as const],
          ["centro", "COMPLEMENTO_REFERENCIA_COMPATIBLE" as const],
        ]),
      }]]]),
    });
    const p = buildStoreNeedsTabPresentation(plan, centro);

    assert.equal(p.unassigned.length, 1);
    const u = p.unassigned[0];
    assert.equal(u.engineReason, "POOL_AGOTADO");
    assert.equal(u.code, "ESCASEZ_GLOBAL_POOL_AGOTADO");
    assert.ok(!u.detail.includes("Regla 36"));        // jamás diagnóstico de exclusión
    assert.ok(!u.detail.includes("reglas comerciales"));
  });

  it("OBLIGATORIA: blockedUnits de otra tienda no contaminan el mensaje de Centro", () => {
    // San Diego SÍ tiene bloqueo por Regla 36; Centro no (post-fix).
    const centro = needsFor("centro", known(0, 0));       // sin compatibles con stock
    const sanDiego = needsFor("san_diego", known(0, 8));  // bloqueada por Regla 36
    const plan = buildStoreReplenishmentPlan({
      storePriorityOrder: ["centro", "san_diego"],
      materialPriorityStoreIds: ["centro", "caldas"],
      needsByStore: new Map([["centro", centro], ["san_diego", sanDiego]]),
      referencePools: new Map(),
      candidatesByStructure: new Map(),
    });

    const pCentro = buildStoreNeedsTabPresentation(plan, centro);
    const pSd = buildStoreNeedsTabPresentation(plan, sanDiego);

    // Centro: su propia disponibilidad (blocked=0) → sin compatibles, NUNCA reglas
    assert.equal(pCentro.unassigned[0].code, "SIN_COMPATIBLES_CON_STOCK");
    assert.equal(pCentro.unassigned[0].metadata.blockedUnits, 0);
    // San Diego: su propio bloqueo → reglas comerciales, correcto para ELLA
    assert.equal(pSd.unassigned[0].code, "COMPATIBLES_EXCLUIDAS_POR_REGLAS");
    assert.equal(pSd.unassigned[0].metadata.blockedUnits, 8);
  });

  it("la derivación usa SOLO la disponibilidad de la necesidad de la propia tienda", () => {
    const centro = needsFor("centro", known(0, 0));
    const plan = buildStoreReplenishmentPlan({
      storePriorityOrder: ["centro"],
      materialPriorityStoreIds: ["centro", "caldas"],
      needsByStore: new Map([["centro", centro]]),
      referencePools: new Map(),
      candidatesByStructure: new Map(),
    });
    const u = plan.unallocated[0];
    const needCentro = centro.needs.find(n => n.structureKey === "E")!;
    assert.equal(deriveUnassignedDisplayCode(u, needCentro), "SIN_COMPATIBLES_CON_STOCK");
  });
});
