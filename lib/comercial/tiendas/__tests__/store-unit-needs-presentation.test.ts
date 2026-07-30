/**
 * lib/comercial/tiendas/__tests__/store-unit-needs-presentation.test.ts
 *
 * AGENTIK-STORES-NEEDS-TAB-PLAN-ALIGNMENT-01 — certification tests.
 *
 * Certifica que la pestaña Necesidades consume el resultado FINAL del
 * StoreReplenishmentPlan: los casos se construyen con los motores REALES de
 * los Sprints 5 y 6 (nunca objetos a mano) y la presentación solo PROYECTA.
 *
 * Run: npx tsx --test lib/comercial/tiendas/__tests__/store-unit-needs-presentation.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  buildStoreNeedsTabPresentation,
  deriveUnassignedDisplayCode,
  UNASSIGNED_DISPLAY_DETAIL,
} from "../store-unit-needs-presentation";
import { buildStoreReplenishmentPlan } from "../store-replenishment-allocation-engine";
import type { StructureCandidateRef, ReferencePool } from "../store-replenishment-allocation-engine";
import { buildStoreUnitNeeds, type StoreUnitNeedsResult, type StructureAvailability } from "../store-unit-needs-engine";
import { evaluateUnitsRule } from "../../derrotero-semantics";

// ── Real Sprint 5 needs + Sprint 6 plan ──────────────────────────────────────

function known(eligibleUnits: number, blockedUnits = 0): StructureAvailability {
  return { status: "CONOCIDA", eligibleUnits, blockedUnits, totalUnits: eligibleUnits + blockedUnits };
}

function needsWith(availability: Record<string, StructureAvailability>): StoreUnitNeedsResult {
  const keys = Object.keys(availability.__keys__ ? {} : availability);
  return buildStoreUnitNeeds({
    storeId: "centro",
    structures: keys.map(key => ({
      structureKey: key,
      label: `Estructura ${key}`,
      line: "CASTILLITOS",
      structuralCoverageStatus: "CUBIERTA" as const,
      unitRule: evaluateUnitsRule(6, { minUnits: 8, idealUnits: 10, maxUnits: 12 }),   // necesita 4
    })),
    specialRules: [],
    availability: new Map(Object.entries(availability)),
  });
}

function planFor(
  needs: StoreUnitNeedsResult,
  pools: Record<string, ReferencePool>,
  candidates: Record<string, StructureCandidateRef[]>,
) {
  return buildStoreReplenishmentPlan({
    storePriorityOrder: ["centro"],
    materialPriorityStoreIds: ["centro", "caldas"],
    needsByStore: new Map([["centro", needs]]),
    referencePools: new Map(Object.entries(pools)),
    candidatesByStructure: new Map(Object.entries(candidates)),
  });
}

function substitute(ref: string): StructureCandidateRef {
  // Sustituto del subgrupo: la tienda NO tiene la referencia (no es misma-ref)
  return { referenceCode: ref, candidateTypeByStore: new Map([["centro", "COMPLEMENTO_REFERENCIA_COMPATIBLE" as const]]) };
}

// ═════════════════════════════════════════════════════════════════════════════
// REQUERIDO 1: sin referencia exacta, con sustituto válido → SUGERENCIA
// ═════════════════════════════════════════════════════════════════════════════

describe("sustituto válido del subgrupo", () => {
  it("sin misma referencia pero con sustituto con stock → aparece como sugerencia, NO como no asignada", () => {
    const needs = needsWith({ E: known(10) });
    const plan = planFor(needs,
      { SUSTITUTO: { eligibleUnits: 10, productName: "Sustituto", underScarcityThreshold: false } },
      { E: [substitute("SUSTITUTO")] },   // cero candidatos de misma referencia
    );
    const p = buildStoreNeedsTabPresentation(plan, needs);

    assert.equal(p.suggestions.length, 1);
    assert.equal(p.suggestions[0].referenceCode, "SUSTITUTO");
    assert.equal(p.suggestions[0].candidateType, "COMPLEMENTO_REFERENCIA_COMPATIBLE");
    assert.equal(p.suggestions[0].units, 4);
    assert.equal(p.unassigned.length, 0);   // JAMÁS "sin solución" habiendo sustituto
    assert.equal(p.totals.suggestedUnits, 4);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// REQUERIDO 2 y 3: sin sustituto válido / sustituto excluido por reglas
// ═════════════════════════════════════════════════════════════════════════════

describe("necesidades no asignadas con razón diferenciada", () => {
  it("REQUERIDO 2: sin sustituto válido en el subgrupo → SIN_COMPATIBLES_CON_STOCK", () => {
    // Sprint 5: disponibilidad CONOCIDA en cero absoluto (0 elegible, 0 bloqueada)
    const needs = needsWith({ E: known(0, 0) });
    const plan = planFor(needs, {}, {});
    const p = buildStoreNeedsTabPresentation(plan, needs);

    assert.equal(p.suggestions.length, 0);
    assert.equal(p.unassigned.length, 1);
    const u = p.unassigned[0];
    assert.equal(u.engineReason, "SIN_DISPONIBILIDAD");      // motor, verbatim
    assert.equal(u.code, "SIN_COMPATIBLES_CON_STOCK");
    assert.equal(u.detail, UNASSIGNED_DISPLAY_DETAIL.SIN_COMPATIBLES_CON_STOCK);
  });

  it("REQUERIDO 3: sustitutos existentes pero excluidos por reglas comerciales → razón correcta", () => {
    // Sprint 5: 0 elegibles pero 8 BLOQUEADAS por Regla 36 — los compatibles existen
    const needs = needsWith({ E: known(0, 8) });
    const plan = planFor(needs, {}, {});
    const p = buildStoreNeedsTabPresentation(plan, needs);

    const u = p.unassigned[0];
    assert.equal(u.engineReason, "SIN_DISPONIBILIDAD");
    assert.equal(u.code, "COMPATIBLES_EXCLUIDAS_POR_REGLAS");
    assert.ok(u.detail.includes("reglas comerciales"));
    assert.equal(u.metadata.blockedUnits, 8);                // números certificados en metadata
    assert.equal(u.metadata.eligibleUnits, 0);
  });

  it("escasez global: pool consumido → ESCASEZ_GLOBAL_POOL_AGOTADO con 0 asignadas", () => {
    const needs = needsWith({ A: known(4), B: known(4) });   // ambas necesitan 4, exec 4
    const plan = planFor(needs,
      { R1: { eligibleUnits: 4, productName: "R1", underScarcityThreshold: false } },
      { A: [substitute("R1")], B: [substitute("R1")] },      // compiten por el mismo pool
    );
    const p = buildStoreNeedsTabPresentation(plan, needs);

    assert.equal(p.unassigned.length, 1);                    // B quedó sin nada
    const u = p.unassigned[0];
    assert.equal(u.engineReason, "POOL_AGOTADO");
    assert.equal(u.allocatedUnits, 0);
    assert.equal(u.code, "ESCASEZ_GLOBAL_POOL_AGOTADO");
  });

  it("SIN_DATOS del Sprint 5 fluye como SIN_DATOS_DISPONIBILIDAD", () => {
    const needs = needsWith({});   // sin clave → SIN_DATOS
    const needsSD = buildStoreUnitNeeds({
      storeId: "centro",
      structures: [{
        structureKey: "E", label: "E", line: "CASTILLITOS",
        structuralCoverageStatus: "CUBIERTA",
        unitRule: evaluateUnitsRule(6, { minUnits: 8, idealUnits: 10, maxUnits: 12 }),
      }],
      specialRules: [],
      availability: new Map(),
    });
    void needs;
    const plan = planFor(needsSD, {}, {});
    const p = buildStoreNeedsTabPresentation(plan, needsSD);
    assert.equal(p.unassigned[0].code, "SIN_DATOS_DISPONIBILIDAD");
    assert.equal(p.unassigned[0].metadata.availability, "SIN_DATOS");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// REQUERIDO 4: asignación parcial — unidades asignadas y faltantes separadas
// ═════════════════════════════════════════════════════════════════════════════

describe("asignación parcial", () => {
  it("pool 2 para necesidad ejecutable 4 → sugerencia de 2 Y no-asignada parcial con difs exactas", () => {
    const needs = needsWith({ E: known(4) });
    const plan = planFor(needs,
      { SUSTITUTO: { eligibleUnits: 2, productName: "S", underScarcityThreshold: false } },
      { E: [substitute("SUSTITUTO")] },
    );
    const p = buildStoreNeedsTabPresentation(plan, needs);

    assert.equal(p.suggestions.length, 1);
    assert.equal(p.suggestions[0].units, 2);                 // lo asignado, como sugerencia
    const u = p.unassigned[0];
    assert.equal(u.code, "ASIGNACION_PARCIAL");
    assert.equal(u.allocatedUnits, 2);                       // asignadas
    assert.equal(u.pendingUnits, 2);                         // faltantes (4 − 2), separadas
    assert.equal(u.executableUnits, 4);
  });

  it("necesidad totalmente asignada NO aparece en no-asignadas", () => {
    const needs = needsWith({ E: known(4) });
    const plan = planFor(needs,
      { S: { eligibleUnits: 50, productName: "S", underScarcityThreshold: false } },
      { E: [substitute("S")] },
    );
    const p = buildStoreNeedsTabPresentation(plan, needs);
    assert.equal(p.suggestions[0].units, 4);
    assert.equal(p.unassigned.length, 0);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// REQUERIDO 5: la UI no recalcula razones
// ═════════════════════════════════════════════════════════════════════════════

describe("la presentación no recalcula razones", () => {
  it("engineReason viaja verbatim y todo detail sale del diccionario derivado", () => {
    const needs = needsWith({ A: known(0, 8), B: known(0, 0) });
    const plan = planFor(needs, {}, {});
    const p = buildStoreNeedsTabPresentation(plan, needs);

    for (const u of p.unassigned) {
      // el motivo del motor es uno de los tres certificados, sin reescritura
      assert.ok(["SIN_DATOS_DISPONIBILIDAD", "SIN_DISPONIBILIDAD", "POOL_AGOTADO"].includes(u.engineReason));
      // el texto visible es EXACTAMENTE el del diccionario para su código derivado
      assert.equal(u.detail, UNASSIGNED_DISPLAY_DETAIL[u.code]);
      // y jamás el texto genérico prohibido
      assert.ok(!u.detail.toLowerCase().includes("sin solución"));
      assert.ok(!u.detail.includes("Sin stock de la misma referencia en bodega principal"));
    }
  });

  it("el código derivado es función determinista de (motor × disponibilidad certificada)", () => {
    const needs = needsWith({ E: known(0, 8) });
    const plan = planFor(needs, {}, {});
    const u = plan.unallocated[0];
    const need = needs.needs.find(n => n.structureKey === "E")!;
    assert.equal(deriveUnassignedDisplayCode(u, need), "COMPATIBLES_EXCLUIDAS_POR_REGLAS");
    assert.equal(deriveUnassignedDisplayCode(u, undefined), "SIN_COMPATIBLES_CON_STOCK");   // sin join: no inventa exclusión
  });

  it("el título certificado es 'Necesidades no asignadas'", () => {
    const needs = needsWith({ E: known(0) });
    const p = buildStoreNeedsTabPresentation(planFor(needs, {}, {}), needs);
    assert.equal(p.unassignedTitle, "Necesidades no asignadas");
  });
});
