/**
 * lib/comercial/__tests__/commercial-exclusions.test.ts
 *
 * AGENTIK-COMMERCIAL-CD-LINE-GLOBAL-EXCLUSION-01 — certification tests.
 *
 * Certifies the business law:
 *   CD-* es colección / línea especial con reglas de precio propias.
 *   NUNCA entra a descuentos automáticos, markdowns, baja rotación,
 *   dead stock de maletas ni bóveda de dormidas. Outlet hereda la regla.
 *
 * Run: npx tsx --test lib/comercial/__tests__/commercial-exclusions.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  isSpecialCollectionReference,
  isExcludedFromAutomaticPricing,
  partitionPricingEligible,
  specialCollectionExclusionReason,
  GOVERNED_SURFACES,
} from "../commercial-exclusions";

import { evaluateSlowRotation, evaluateAutomaticMarkdowns } from "../tiendas/store-decision-engine";
import { CASTILLITOS_STORE_POLICY_PACK_CONFIG } from "../tiendas/store-policy-pack-config";
import type { StoreInventorySnapshot } from "../tiendas/store-decision-types";

import { detectDeadStock } from "../maletas/maletas-deadstock";
import type { CaseItem } from "../maletas/maletas-types";

// ═════════════════════════════════════════════════════════════════════════════
// 1. The rule itself
// ═════════════════════════════════════════════════════════════════════════════

describe("regla CD-*", () => {
  it("CD- con guion es colección especial", () => {
    assert.equal(isSpecialCollectionReference("CD-2071343B"), true);
  });

  it("CD con espacio es colección especial", () => {
    assert.equal(isSpecialCollectionReference("CD 2071343B"), true);
  });

  it("es insensible a mayúsculas y espacios laterales", () => {
    assert.equal(isSpecialCollectionReference("  cd-104512  "), true);
  });

  it("C- (Castillitos) NO es colección especial", () => {
    assert.equal(isSpecialCollectionReference("C-1922141"), false);
  });

  it("CA- (Castillitos accesorio) NO es colección especial", () => {
    assert.equal(isSpecialCollectionReference("CA-2621215B"), false);
  });

  it("CDX sin separador NO matchea (evita falsos positivos)", () => {
    assert.equal(isSpecialCollectionReference("CDX-999"), false);
  });

  it("vacío y null no son especiales", () => {
    assert.equal(isSpecialCollectionReference(""), false);
    assert.equal(isSpecialCollectionReference(null), false);
    assert.equal(isSpecialCollectionReference(undefined), false);
  });

  it("isExcludedFromAutomaticPricing es hoy exactamente la regla CD-*", () => {
    assert.equal(isExcludedFromAutomaticPricing("CD-1"), true);
    assert.equal(isExcludedFromAutomaticPricing("L-1"), false);
  });

  it("partitionPricingEligible separa sin perder items", () => {
    const items = [{ ref: "CD-1" }, { ref: "C-2" }, { ref: "CD 3" }, { ref: "L-4" }];
    const { eligible, excluded } = partitionPricingEligible(items, i => i.ref);
    assert.deepEqual(eligible.map(i => i.ref), ["C-2", "L-4"]);
    assert.deepEqual(excluded.map(i => i.ref), ["CD-1", "CD 3"]);
  });

  it("la ley gobierna las 6 superficies declaradas", () => {
    assert.equal(GOVERNED_SURFACES.length, 6);
    assert.ok(GOVERNED_SURFACES.includes("DESCUENTOS_TIENDA"));
    assert.ok(GOVERNED_SURFACES.includes("OUTLET"));
    assert.ok(GOVERNED_SURFACES.includes("DEADSTOCK_MALETAS"));
    assert.ok(GOVERNED_SURFACES.includes("VAULT_DORMIDAS"));
  });

  it("la razón estándar menciona la regla global", () => {
    const reason = specialCollectionExclusionReason("CD-104512");
    assert.ok(reason.includes("CD-104512"));
    assert.ok(reason.toLowerCase().includes("regla global"));
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 2. Baja rotación de tiendas (STORE_SLOW_ROTATION)
// ═════════════════════════════════════════════════════════════════════════════

function snapshot(referenceCode: string, daysInStore: number, storeId = "centro"): StoreInventorySnapshot {
  return {
    storeId,
    storeName: storeId === "centro" ? "Centro" : storeId,
    referenceCode,
    productName: `Producto ${referenceCode}`,
    productClass: "textile",
    line: "CS",
    subgroup: "CONJUNTO CL",
    currentUnits: 5,
    daysInStore,
  };
}

describe("baja rotación en tienda excluye CD-*", () => {
  const config = CASTILLITOS_STORE_POLICY_PACK_CONFIG;

  it("una CD-* vieja con stock NO genera señal de baja rotación", () => {
    const results = evaluateSlowRotation([snapshot("CD-2071343B", 200)], config);
    assert.equal(results.length, 0);
  });

  it("una referencia normal vieja SÍ genera señal (control positivo)", () => {
    const results = evaluateSlowRotation([snapshot("C-1922141", 200)], config);
    assert.equal(results.length, 1);
    assert.equal(results[0].referenceCode, "C-1922141");
  });

  it("mezcla: solo las no-CD generan señales", () => {
    const results = evaluateSlowRotation(
      [snapshot("CD-1", 300), snapshot("C-2", 300), snapshot("CD 3", 300)],
      config,
    );
    assert.deepEqual(results.map(r => r.referenceCode), ["C-2"]);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 3. Markdowns automáticos del policy pack
// ═════════════════════════════════════════════════════════════════════════════

describe("markdown automático excluye CD-*", () => {
  const config = CASTILLITOS_STORE_POLICY_PACK_CONFIG;

  it("una CD-* vieja en tienda aplicable NO recibe markdown", () => {
    const results = evaluateAutomaticMarkdowns([snapshot("CD-2071343B", 200, "centro")], config);
    assert.equal(results.length, 0);
  });

  it("una referencia normal vieja SÍ recibe markdown (control positivo)", () => {
    const results = evaluateAutomaticMarkdowns([snapshot("C-1922141", 200, "centro")], config);
    assert.equal(results.length, 1);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 4. Dead stock de maletas
// ═════════════════════════════════════════════════════════════════════════════

function caseItem(reference: string): CaseItem {
  return {
    reference,
    description: `Producto ${reference}`,
    line: "CS",
    assignedToSalesReps: [],
    currentUnits: 20,
    minimumRequired: 1,
    missingUnits: 0,
    availableToReplenish: 0,
    productionInProcess: false,
    productionBatchLabel: null,
    status: "ok",
    recommendedAction: "OK",
  };
}

describe("dead stock de maletas excluye CD-*", () => {
  it("una CD-* sin ventas 30d con stock NO genera señal de dead stock", () => {
    const velocity = new Map([["CD-2071343B", { refCode: "CD-2071343B", dailyVelocity: 0, units30d: 0 } as any]]);
    const signals = detectDeadStock([caseItem("CD-2071343B")], velocity, []);
    assert.equal(signals.length, 0);
  });

  it("una referencia normal sin ventas 30d SÍ genera señal (control positivo)", () => {
    const velocity = new Map([["C-1922141", { refCode: "C-1922141", dailyVelocity: 0, units30d: 0 } as any]]);
    const signals = detectDeadStock([caseItem("C-1922141")], velocity, []);
    assert.equal(signals.length, 1);
    assert.equal(signals[0].refCode, "C-1922141");
    assert.equal(signals[0].reason, "sin_ventas_30d");
  });
});
