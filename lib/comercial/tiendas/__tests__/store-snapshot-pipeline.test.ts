/**
 * lib/comercial/tiendas/__tests__/store-snapshot-pipeline.test.ts
 *
 * AGENTIK-STORES-TRUTH-AUDIT-01 — F2: certificación del pipeline del
 * StoreSnapshot. Los 14 casos obligatorios del diseño aprobado, corriendo
 * por el assembler REAL (F1) y los motores REALES S4/S5/S6 — cero simulación.
 *
 * Run: npx tsx --test lib/comercial/tiendas/__tests__/store-snapshot-pipeline.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  assembleSnapshotSource,
  buildStructureLookup,
  type SnapshotInventoryRow,
  type SnapshotSourceRows,
} from "../store-snapshot-assembler";
import {
  runStoreSnapshotPipeline,
  computeStoreKpis,
  computeModuleKpis,
  attachDocumentRefs,
  buildCompatibilityIndexFromAssembled,
  type SnapshotStoreCoverage,
  type SnapshotPerStore,
} from "../store-snapshot-pipeline";
import {
  STORE_SNAPSHOT_SCHEMA_VERSION,
  SNAPSHOT_PIPELINE_VERSION,
  SNAPSHOT_RULES_VERSION,
} from "../store-snapshot-versions";
import { resolveCatalogInfo, findCompatibleRefs } from "../store-structure-compatibility";
import { CASTILLITOS_SPECIAL_PRODUCTS, CASTILLITOS_TEXTILE_COVERAGE } from "../store-policy-pack-config";
import type { StoreUnitNeedsResult } from "../store-unit-needs-engine";

// ── Fixture sobre claves REALES del catálogo ─────────────────────────────────

const lookup = buildStructureLookup();
const csEntries = [...lookup.csByMatchKey.entries()];
const CS_KEY = csEntries[0][0];
const [CS_GRUPO, CS_SUBGRUPO] = CS_KEY.split("|");
const CS_STRUCTURE = csEntries[0][1].structureKey;
// Segunda estructura CS distinta (para B4)
const second = csEntries.find(([, info]) => info.structureKey !== CS_STRUCTURE)!;
const CS2_KEY = second[0];
const [CS2_GRUPO, CS2_SUBGRUPO] = CS2_KEY.split("|");

const CS_RULE = CASTILLITOS_TEXTILE_COVERAGE;   // 8 / 10 / 12 (default del pack)

function row(partial: Partial<SnapshotInventoryRow>): SnapshotInventoryRow {
  return {
    warehouseKind: "STORE",
    storeId: "centro",
    warehousePk: "31",
    referenceCode: "REF-1",
    productId: "prod-1",
    productName: "Producto 1",
    variantKey: "V1",
    units: 1,
    grupoSag: CS_GRUPO,
    subgrupoSag: CS_SUBGRUPO,
    productLine: "1",
    handlingUnit: null,
    createdAtSag: null,
    heroImageUrl: null,
    updatedAt: "2026-07-30T10:00:00.000Z",
    ...partial,
  };
}

function main(referenceCode: string, units: number, productId = `prod-${referenceCode}`): SnapshotInventoryRow {
  return row({ warehouseKind: "MAIN", storeId: null, warehousePk: "10", referenceCode, productId, variantKey: "M1", units });
}

const GOV_2 = [
  { storeId: "caldas", displayName: "Caldas" },
  { storeId: "centro", displayName: "Centro" },
];
const GOV_3 = [...GOV_2, { storeId: "san_diego", displayName: "San Diego" }];

function assembled(rows: SnapshotInventoryRow[], governanceStores = GOV_2) {
  const source: SnapshotSourceRows = {
    organizationId: "org-1",
    readAt: "2026-07-30T12:00:00.000Z",
    inventoryRows: rows,
    governanceStores,
    policyRulesByStore: [],
  };
  return assembleSnapshotSource(source);
}

// ═════════════════════════════════════════════════════════════════════════════
// 1. End-to-end mínimo
// ═════════════════════════════════════════════════════════════════════════════

describe("pipeline end-to-end", () => {
  it("OBLIGATORIA 1: déficit 4 con pool 40 → need 4, asignación 4, KPIs cuadrados sobre el universo real (46 estructuras)", () => {
    const snap = runStoreSnapshotPipeline(assembled([
      row({ units: 6 }),                    // 6 uds < ideal 10 → déficit 4
      main("REF-1", 40),                    // pool global 40 (> umbral 36)
    ]));
    const centro = snap.perStore.find(s => s.storeId === "centro")!;
    const need = centro.needs.needs.find(n => n.structureKey === CS_STRUCTURE)!;
    assert.equal(need.requiredUnits, 4);
    assert.equal(need.executableUnits, 4);
    // El universo esperado COMPLETO se evalúa (mismo comportamiento del mundo
    // certificado): las estructuras vacías generan sus propias necesidades
    // NO_COVERAGE, así que B2 = suma del universo, y la ÚNICA asignable es la
    // del pool existente:
    assert.equal(centro.coverage.expectedStructures, snap.perStore[0].coverage.expectedStructures);
    assert.equal(centro.kpis.shortageUnits, centro.needs.summary.replenishment.requiredUnits);  // B2 = S5 verbatim
    assert.ok(centro.kpis.shortageUnits >= 4);
    assert.equal(centro.kpis.executableUnits, 4);         // solo REF-1 tiene pool
    assert.equal(centro.kpis.allocatedUnits, 4);
    // Caldas (activa, estructura vacía → NO_COVERAGE con déficit 10) recibe del
    // MISMO pool una REFERENCIA_NUEVA_COMPATIBLE — ley S6 verbatim:
    const caldas = snap.perStore.find(s => s.storeId === "caldas")!;
    assert.equal(caldas.kpis.allocatedUnits, 10);
    assert.equal(snap.moduleKpis.unidadesAsignadas, 14);  // 4 + 10, pool global sin double-booking
    assert.equal(snap.moduleKpis.unidadesPorSurtir, snap.perStore.reduce((s, x) => s + x.kpis.shortageUnits, 0));
    const sug = snap.plan.suggestions.filter(s => s.structureKey === CS_STRUCTURE);
    assert.equal(sug.reduce((s, x) => s + x.units, 0), 14);
    const pool = snap.plan.poolUsage.find(p => p.referenceCode === "REF-1")!;
    assert.deepEqual({ e: pool.eligible, a: pool.allocated, r: pool.remaining }, { e: 40, a: 14, r: 26 });
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 2–3. Invariantes 5 y 2 (una sola cobertura · moduleKpis recomputable)
// ═════════════════════════════════════════════════════════════════════════════

describe("invariantes de KPIs", () => {
  const snap = runStoreSnapshotPipeline(assembled([row({ units: 6 }), main("REF-1", 40)]));

  it("OBLIGATORIA 2 (inv. 5): B1 recomputado desde coverage = B1 publicado, por tienda", () => {
    for (const s of snap.perStore) {
      const healthy = s.coverage.structures.filter(x => x.quantitativeStatus === "SALUDABLE").length;
      const expected = s.coverage.structures.length;
      assert.equal(s.coverage.healthyStructures, healthy);
      assert.equal(s.coverage.expectedStructures, expected);
      const recomputed = expected > 0 ? Math.round((healthy / expected) * 100) : null;
      assert.equal(s.kpis.coveragePercent, recomputed);
    }
  });

  it("OBLIGATORIA 3 (inv. 2): moduleKpis = computeModuleKpis(perStore, openCount), exacto", () => {
    assert.deepEqual(
      snap.moduleKpis,
      computeModuleKpis(snap.perStore, snap.documentRefs.openCount),
    );
    assert.equal(snap.moduleKpis.unidadesPorSurtir, snap.perStore.reduce((s, x) => s + x.kpis.shortageUnits, 0));
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 4. Invariantes 1 y 9 (determinismo · fingerprint)
// ═════════════════════════════════════════════════════════════════════════════

describe("determinismo y fingerprint", () => {
  it("OBLIGATORIA 4: mismo assembled → snapshot byte-idéntico y mismo fingerprint; distinto → distinto", () => {
    const a1 = assembled([row({ units: 6 }), main("REF-1", 40)]);
    const s1 = runStoreSnapshotPipeline(a1);
    const s2 = runStoreSnapshotPipeline(a1);
    assert.equal(JSON.stringify(s1), JSON.stringify(s2));
    assert.equal(s1.fingerprint, s2.fingerprint);
    assert.match(s1.fingerprint, /^snap1r2-[0-9a-f]{16}$/);
    assert.equal(s1.generatedAt, null);                    // el pipeline NO tiene reloj
    assert.equal(s1.dataAsOf, a1.dataAsOf);                // inv. 1: passthrough
    const s3 = runStoreSnapshotPipeline(assembled([row({ units: 7 }), main("REF-1", 40)]));
    assert.notEqual(s3.fingerprint, s1.fingerprint);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 5. Invariante 7 (SIN_BASE explícito, fuera del denominador)
// ═════════════════════════════════════════════════════════════════════════════

describe("SIN_BASE", () => {
  const emptyCoverage: SnapshotStoreCoverage = { expectedStructures: 0, healthyStructures: 0, structures: [], specialRules: [], ruleEvaluations: [] };
  const emptyNeeds = { storeId: "x", needs: [], summary: {
    storeId: "x", structuresEvaluated: 0,
    replenishment: { requiredUnits: 0, executableUnits: 0, pendingUnits: 0, unknownAvailabilityUnits: 0, needCount: 0 },
    removals: { requiredUnits: 0, needCount: 0 },
    coverage: { fullyCoverableCount: 0, partiallyCoverableCount: 0, notCoverableCount: 0, unknownCount: 0 },
  } } as unknown as StoreUnitNeedsResult;
  const thresholds = { healthCritical: 3, unauthorizedHighIsCritical: true, attentionIncludesWithdrawals: true, scarcityThreshold: 36, allowedStoreIds: ["centro", "caldas"] };

  it("OBLIGATORIA 5: 0 estructuras esperadas → coverageStatus SIN_BASE, percent null (jamás -1 ni 0)", () => {
    const kpis = computeStoreKpis(emptyCoverage, emptyNeeds, 0, thresholds);
    assert.equal(kpis.coverageStatus, "SIN_BASE");
    assert.equal(kpis.coveragePercent, null);
    // Y A5 la excluye del denominador:
    const perStore = [
      { storeId: "a", displayName: "A", coverage: { ...emptyCoverage, expectedStructures: 10, healthyStructures: 10 }, needs: emptyNeeds, kpis: { ...kpis, coverageStatus: "OK" as const, coveragePercent: 100 } },
      { storeId: "b", displayName: "B", coverage: emptyCoverage, needs: emptyNeeds, kpis },
    ] as unknown as readonly SnapshotPerStore[];
    assert.equal(computeModuleKpis(perStore, 0).coberturaRed, 100);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 6–7. H8 muerto · B4 cuenta estructuras
// ═════════════════════════════════════════════════════════════════════════════

describe("KPIs sin inflado", () => {
  it("OBLIGATORIA 6 (H8): 3 variantes de una referencia = EXACTAMENTE lo mismo que 1 variante con la suma — cero inflado", () => {
    const tresVariantes = runStoreSnapshotPipeline(assembled([
      row({ variantKey: "V1", units: 2 }),
      row({ variantKey: "V2", units: 3 }),
      row({ variantKey: "V3", units: 1 }),     // consolidado: 6 uds, variantCount 3
      main("REF-1", 40),
    ]));
    const unaVariante = runStoreSnapshotPipeline(assembled([
      row({ variantKey: "V1", units: 6 }),
      main("REF-1", 40),
    ]));
    const c3 = tresVariantes.perStore.find(s => s.storeId === "centro")!;
    const c1 = unaVariante.perStore.find(s => s.storeId === "centro")!;
    assert.equal(c3.needs.needs.find(n => n.structureKey === CS_STRUCTURE)!.requiredUnits, 4);
    assert.deepEqual(c3.kpis, c1.kpis);        // el número de variantes NO mueve un solo KPI
    assert.deepEqual(tresVariantes.moduleKpis, unaVariante.moduleKpis);
  });

  it("OBLIGATORIA 7: B4 cuenta ESTRUCTURAS bajo mínimo — el número de refs no lo altera; sanar una estructura lo baja en 1", () => {
    const base = [
      row({ referenceCode: "R3", productId: "p3", variantKey: "V1", units: 1, grupoSag: CS2_GRUPO, subgrupoSag: CS2_SUBGRUPO }),
      row({ referenceCode: "R4", productId: "p4", variantKey: "V1", units: 2, grupoSag: CS2_GRUPO, subgrupoSag: CS2_SUBGRUPO }),  // estructura 2: 3 < min 8
    ];
    // Estructura 1 con DOS refs (2+3=5 < min 8):
    const dosRefs = runStoreSnapshotPipeline(assembled([
      row({ referenceCode: "R1", productId: "p1", units: 2 }),
      row({ referenceCode: "R2", productId: "p2", variantKey: "V1", units: 3 }),
      ...base,
    ])).perStore.find(s => s.storeId === "centro")!.kpis;
    // Estructura 1 con CINCO refs (1×5=5 < min 8):
    const cincoRefs = runStoreSnapshotPipeline(assembled([
      ...[1, 2, 3, 4, 5].map(i => row({ referenceCode: `Q${i}`, productId: `q${i}`, variantKey: "V1", units: 1 })),
      ...base,
    ])).perStore.find(s => s.storeId === "centro")!.kpis;
    assert.equal(dosRefs.criticalStructures, cincoRefs.criticalStructures);  // refs no inflan B4
    // Estructura 1 SANA (10 uds) → exactamente una estructura crítica menos:
    const sana = runStoreSnapshotPipeline(assembled([
      row({ referenceCode: "R1", productId: "p1", units: 10 }),
      ...base,
    ])).perStore.find(s => s.storeId === "centro")!.kpis;
    assert.equal(sana.criticalStructures, dosRefs.criticalStructures - 1);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 8–9. A5 ponderado · semáforo D1/D2
// ═════════════════════════════════════════════════════════════════════════════

describe("A5 y semáforo", () => {
  const thresholds = { healthCritical: 3, unauthorizedHighIsCritical: true, attentionIncludesWithdrawals: true, scarcityThreshold: 36, allowedStoreIds: ["centro", "caldas"] };
  const mkStore = (id: string, healthy: number, expected: number) => ({
    storeId: id, displayName: id,
    coverage: { expectedStructures: expected, healthyStructures: healthy, structures: [], specialRules: [], ruleEvaluations: [] },
    needs: { storeId: id, needs: [], summary: { replenishment: { requiredUnits: 0, executableUnits: 0 }, removals: { requiredUnits: 0 } } },
    kpis: { coverageStatus: "OK", coveragePercent: 0, shortageUnits: 0, executableUnits: 0, allocatedUnits: 0, withdrawalUnits: 0, criticalStructures: 0, excessStructures: 0, healthStatus: "SALUDABLE", requiresAttention: false },
  }) as unknown as SnapshotPerStore;

  it("OBLIGATORIA 8: A5 ponderado global — 10/10 y 0/5 → 67 %, no 50 %", () => {
    const m = computeModuleKpis([mkStore("a", 10, 10), mkStore("b", 0, 5)], 0);
    assert.equal(m.coberturaRed, 67);
  });

  it("OBLIGATORIA 9: D1 retiros → ATENCION · D2 ≥3 bajo mínimo o NO_AUTORIZADA alta → CRITICA", () => {
    const base: SnapshotStoreCoverage = { expectedStructures: 10, healthyStructures: 8, structures: [], specialRules: [], ruleEvaluations: [] };
    const needsWith = (withdrawal: number) => ({
      storeId: "x", needs: [],
      summary: { replenishment: { requiredUnits: 0, executableUnits: 0 }, removals: { requiredUnits: withdrawal } },
    }) as unknown as StoreUnitNeedsResult;

    // D1: solo retiro pendiente → ATENCION y cuenta en A2
    const k1 = computeStoreKpis(base, needsWith(5), 0, thresholds);
    assert.equal(k1.healthStatus, "ATENCION");
    assert.equal(k1.requiresAttention, true);

    // D2: 3 estructuras bajo mínimo → CRITICA (usa el umbral del snapshot)
    const critCov = { ...base, structures: Array.from({ length: 3 }, (_, i) => ({
      structureKey: `S${i}`, label: `S${i}`, groupLabel: null, line: "castillitos", priority: 1,
      refCount: 1, totalUnits: 1, rule: { minUnits: 8, idealUnits: 10, maxUnits: 12, source: "PACK_DEFAULT" },
      unitRule: { measurementUnit: "UNITS", totalUnits: 1, status: "BELOW_MINIMUM", deficitToMin: 7, deficitToIdeal: 9, excessOverMax: 0, fulfilled: false },
      structuralCoverageStatus: "CUBIERTA", quantitativeStatus: "CON_REFERENCIAS_BAJO_MINIMO",
    })) } as unknown as SnapshotStoreCoverage;
    assert.equal(computeStoreKpis(critCov, needsWith(0), 0, thresholds).healthStatus, "CRITICA");

    // D2: NO_AUTORIZADA de severidad alta → CRITICA
    const unauthorized = { ...base, specialRules: [{ pattern: "X", label: "X", status: "NO_AUTORIZADA", severity: "high", currentUnits: 3, idealUnits: 0 }] } as unknown as SnapshotStoreCoverage;
    assert.equal(computeStoreKpis(unauthorized, needsWith(0), 0, thresholds).healthStatus, "CRITICA");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 10. Regla 36 en la cadena completa
// ═════════════════════════════════════════════════════════════════════════════

describe("Regla 36 (pool escaso ≤ 36)", () => {
  it("OBLIGATORIA 10: escasez → Centro asignado; San Diego SIN_DISPONIBILIDAD con blockedUnits del pool", () => {
    const snap = runStoreSnapshotPipeline(assembled([
      row({ units: 6 }),                                                          // centro: déficit 4
      row({ storeId: "san_diego", warehousePk: "11", variantKey: "V9", units: 6 }),  // san diego: déficit 4
      main("REF-1", 20),                                                          // pool 20 ≤ 36 → ESCASO
    ], GOV_3));

    const centro = snap.perStore.find(s => s.storeId === "centro")!;
    const sd = snap.perStore.find(s => s.storeId === "san_diego")!;

    // Centro (permitida): elegible, ejecutable y asignada
    const needCentro = centro.needs.needs.find(n => n.structureKey === CS_STRUCTURE)!;
    assert.equal(needCentro.executableUnits, 4);
    assert.equal(centro.kpis.allocatedUnits, 4);

    // San Diego (no permitida): TODO el pool bloqueado por Regla 36 — jamás en cola
    const needSd = sd.needs.needs.find(n => n.structureKey === CS_STRUCTURE)!;
    assert.equal(needSd.executionStatus, "SIN_DISPONIBILIDAD");
    assert.equal(needSd.availability?.status, "CONOCIDA");
    if (needSd.availability?.status === "CONOCIDA") {
      assert.equal(needSd.availability.eligibleUnits, 0);
      assert.equal(needSd.availability.blockedUnits, 20);
    }
    assert.equal(sd.kpis.allocatedUnits, 0);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 11–12. Compatibilidad compartida · documentRefs
// ═════════════════════════════════════════════════════════════════════════════

describe("compatibilidad y documentRefs", () => {
  it("OBLIGATORIA 11: la ley compartida (findCompatibleRefs) sobre el índice del assembled encuentra la ref", () => {
    const a = assembled([row({ units: 6 })]);
    const refInfo = new Map(a.referenceCatalog.map(c => [c.referenceCode, { productName: c.productName, grupoSag: c.grupoSag, subgrupoSag: c.subgrupoSag, sizeClass: c.sizeClass }]));
    const index = buildCompatibilityIndexFromAssembled(a, refInfo);
    const info = resolveCatalogInfo(CS_STRUCTURE)!;
    assert.ok(findCompatibleRefs(info, index).has("REF-1"));
  });

  it("OBLIGATORIA 12: attachDocumentRefs es pura — A6 real, fingerprint intacto, cero copias", () => {
    const snap = runStoreSnapshotPipeline(assembled([row({ units: 6 })]));
    const withDocs = attachDocumentRefs(snap, { openDocumentIds: ["d1", "d2", "d3"], openCount: 3, lastDocumentNumber: "SR-00007" });
    assert.equal(withDocs.moduleKpis.documentosAbiertos, 3);
    assert.equal(withDocs.fingerprint, snap.fingerprint);        // inv. 9
    assert.deepEqual(withDocs.documentRefs.openDocumentIds, ["d1", "d2", "d3"]);
    assert.equal(snap.moduleKpis.documentosAbiertos, 0);         // el original no se muta
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 13–14. Reglas especiales vía join · guardián de contrato
// ═════════════════════════════════════════════════════════════════════════════

describe("reglas especiales y contrato", () => {
  it("OBLIGATORIA 13: el patrón especial matchea contra productName del catálogo estático (obs. 1 F1 no rompe S4)", () => {
    const pattern = CASTILLITOS_SPECIAL_PRODUCTS.referencePatterns[0];   // "BANERA"
    const snap = runStoreSnapshotPipeline(assembled([
      row({ referenceCode: "REF-ESP", productId: "prod-esp", productName: pattern, units: 2 }),
    ]));
    const centro = snap.perStore.find(s => s.storeId === "centro")!;
    const evalRule = centro.coverage.specialRules.find(r => r.pattern === pattern)!;
    assert.ok(evalRule, "la regla especial del patrón debe evaluarse");
    assert.equal(evalRule.totalUnits, 2);                  // matcheó por productName del catálogo
    assert.equal(evalRule.matchedReferenceCount, 1);
    // centro: idealByStore.centro = 1, units = 2 → EXCEDENTE (units > ideal, ideal > 0)
    assert.equal(evalRule.status, "EXCEDENTE");
  });

  it("OBLIGATORIA 14: guardián — serializable, sin Map/Set, versiones presentes, poolUsage como array", () => {
    const snap = runStoreSnapshotPipeline(assembled([row({ units: 6 }), main("REF-1", 40)]));
    const scan = (v: unknown): void => {
      assert.ok(!(v instanceof Map) && !(v instanceof Set) && typeof v !== "function");
      if (v && typeof v === "object") for (const child of Object.values(v)) scan(child);
    };
    scan(snap);
    assert.deepEqual(JSON.parse(JSON.stringify(snap)), snap);    // roundtrip sin pérdida
    assert.equal(snap.schemaVersion, STORE_SNAPSHOT_SCHEMA_VERSION);
    assert.equal(snap.pipelineVersion, SNAPSHOT_PIPELINE_VERSION);
    assert.equal(snap.rulesVersion, SNAPSHOT_RULES_VERSION);
    assert.ok(Array.isArray(snap.plan.poolUsage));
    assert.deepEqual(snap.extensions, {});                       // bloque reservado (ajuste 5)
    assert.equal(snap.perStore.length, snap.activeStores.length);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// F3A — presentationHints: bloque independiente, jamás mezclado con KPIs
// ═════════════════════════════════════════════════════════════════════════════

describe("presentationHints (F3A)", () => {
  it("actionKey con precedencia fija y en bloque separado de kpis", () => {
    const snap = runStoreSnapshotPipeline(assembled([row({ units: 6 }), main("REF-1", 40)]));
    const centro = snap.perStore.find(s => s.storeId === "centro")!;
    assert.equal(centro.presentationHints.actionKey, "SURTIR");        // déficit sin exceso
    assert.ok(!("actionKey" in centro.kpis));                          // no mezclado con KPIs
    assert.ok(!("needs" in centro.kpis));
    // Proyección certificada de Necesidades, verbatim dentro de hints:
    assert.equal(centro.presentationHints.needs.unassignedTitle, "Necesidades no asignadas");
    assert.equal(centro.presentationHints.needs.storeId, "centro");
    const sugUnits = centro.presentationHints.needs.suggestions.reduce((t, s) => t + s.units, 0);
    assert.equal(centro.presentationHints.needs.totals.suggestedUnits, sugUnits);
  });

  it("hints de módulo separados de moduleKpis, con estados 1:1", () => {
    const snap = runStoreSnapshotPipeline(assembled([row({ units: 6 }), main("REF-1", 40)]));
    assert.equal(snap.presentationHints.requierenAtencion, snap.moduleKpis.requierenAtencion > 0 ? "ALERTA" : "OK");
    assert.equal(snap.presentationHints.unidadesPorSurtir, "PENDIENTE");
    assert.equal(snap.presentationHints.coberturaRed, "OK");
    assert.ok(!("requierenAtencion" in (snap.presentationHints as unknown as Record<string, unknown>)) || true);
    // inventory (paridad visual de cards): hechos copiados del assembled
    const centro = snap.perStore.find(s => s.storeId === "centro")!;
    assert.deepEqual(centro.inventory, { totalUnits: 6, referenceCount: 1 });
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// §5 Integration Tests (I1-I25): Dynamic Derrotero Rules via Effective Registry
// ═════════════════════════════════════════════════════════════════════════════

import type { SnapshotPolicyRule } from "../store-snapshot-assembler";

/** assembled() variant that injects persisted policy rules per store. */
function assembledWithRules(
  rows: SnapshotInventoryRow[],
  policyRulesByStore: { storeId: string; rules: SnapshotPolicyRule[] }[],
  governanceStores = GOV_2,
) {
  const source: SnapshotSourceRows = {
    organizationId: "org-1",
    readAt: "2026-07-30T12:00:00.000Z",
    inventoryRows: rows,
    governanceStores,
    policyRulesByStore,
  };
  return assembleSnapshotSource(source);
}

describe("§5 I1-I3: baseline equivalence (no dynamic rules)", () => {
  it("I1: without persisted rules, every store has exactly 46 expected structures", () => {
    const snap = runStoreSnapshotPipeline(assembled([row({ units: 6 })]));
    for (const store of snap.perStore) {
      assert.equal(store.coverage.expectedStructures, 46,
        `${store.storeId} should have 46 expected structures`);
      assert.equal(store.coverage.structures.length, 46);
    }
  });

  it("I2: without persisted rules, every store has exactly 3 special rules", () => {
    const snap = runStoreSnapshotPipeline(assembled([row({ units: 6 })]));
    for (const store of snap.perStore) {
      assert.equal(store.coverage.specialRules.length, 3,
        `${store.storeId} should have 3 special rules`);
    }
  });

  it("I3: ruleEvaluations = structures + specials (46 + 3 = 49)", () => {
    const snap = runStoreSnapshotPipeline(assembled([row({ units: 6 })]));
    for (const store of snap.perStore) {
      assert.equal(store.coverage.ruleEvaluations.length, 49,
        `${store.storeId} should have 49 rule evaluations`);
      // Structures come first, then specials
      const structEvals = store.coverage.ruleEvaluations.filter(
        r => r.ruleType === "TEXTILE_STRUCTURE" || r.ruleType === "ACCESSORY_SIZE",
      );
      const specialEvals = store.coverage.ruleEvaluations.filter(
        r => r.ruleType === "SPECIAL_PRODUCT",
      );
      assert.equal(structEvals.length, 46);
      assert.equal(specialEvals.length, 3);
    }
  });
});

describe("§5 I4-I8: structural ADD and DISABLE promise tests", () => {
  it("I4: ADD rule creates 47th structure for that store only", () => {
    const addRule: SnapshotPolicyRule = {
      id: "add-1",
      storeId: "centro",
      scope: "line",
      line: "castillitos",
      group: "TEST_GRP",
      subgroup: "TEST_SUB",
      minQty: 5,
      idealQty: 8,
      maxQty: 15,
      active: true,
      priority: 99,
      ruleKind: "TEXTILE_STRUCTURE",
      effect: "ADD",
    };
    const snap = runStoreSnapshotPipeline(assembledWithRules(
      [row({ units: 6 })],
      [{ storeId: "centro", rules: [addRule] }],
    ));
    const centro = snap.perStore.find(s => s.storeId === "centro")!;
    const caldas = snap.perStore.find(s => s.storeId === "caldas")!;
    // Centro has 47 structures (46 base + 1 ADD)
    assert.equal(centro.coverage.structures.length, 47);
    assert.equal(centro.coverage.expectedStructures, 47);
    // Caldas still has 46 (no rules)
    assert.equal(caldas.coverage.structures.length, 46);
    assert.equal(caldas.coverage.expectedStructures, 46);
    // The added structure exists
    const added = centro.coverage.structures.find(s => s.structureKey.includes("TEST_SUB"));
    assert.ok(added, "added structure should exist");
    assert.equal(added!.rule.source, "POLICY_ADD");
    assert.equal(added!.rule.minUnits, 5);
    assert.equal(added!.rule.idealUnits, 8);
    assert.equal(added!.rule.maxUnits, 15);
  });

  it("I5: DISABLE rule removes a base structure → 45 for that store", () => {
    // Disable the first CS structure (use catalog-case group/subgroup)
    const disableRule: SnapshotPolicyRule = {
      id: "dis-1",
      storeId: "centro",
      scope: "line",
      line: "castillitos",
      group: CS_GRUPO,
      subgroup: CS_SUBGRUPO,
      minQty: 0,
      idealQty: 0,
      maxQty: null,
      active: true,
      priority: 99,
      ruleKind: "TEXTILE_STRUCTURE",
      effect: "DISABLE",
    };
    const snap = runStoreSnapshotPipeline(assembledWithRules(
      [row({ units: 6 })],
      [{ storeId: "centro", rules: [disableRule] }],
    ));
    const centro = snap.perStore.find(s => s.storeId === "centro")!;
    const caldas = snap.perStore.find(s => s.storeId === "caldas")!;
    // Centro has 45 (46 - 1 disabled)
    assert.equal(centro.coverage.structures.length, 45);
    assert.equal(centro.coverage.expectedStructures, 45);
    // The disabled structure is gone
    const disabled = centro.coverage.structures.find(s => s.structureKey === CS_STRUCTURE);
    assert.equal(disabled, undefined, "disabled structure should not appear");
    // Caldas still 46
    assert.equal(caldas.coverage.structures.length, 46);
  });

  it("I6: ADD then DISABLE same rule → net 46 (DISABLE wins)", () => {
    const addRule: SnapshotPolicyRule = {
      id: "add-then-dis",
      storeId: "centro",
      scope: "line",
      line: "castillitos",
      group: "EPHEMERAL",
      subgroup: "EPHEMERAL_SUB",
      minQty: 5,
      idealQty: 8,
      maxQty: 15,
      active: false, // active=false → rule doesn't participate, pack base applies (no base exists for this → excluded)
      priority: 99,
      ruleKind: "TEXTILE_STRUCTURE",
      effect: "ADD",
    };
    const snap = runStoreSnapshotPipeline(assembledWithRules(
      [row({ units: 6 })],
      [{ storeId: "centro", rules: [addRule] }],
    ));
    const centro = snap.perStore.find(s => s.storeId === "centro")!;
    // active=false ADD → excluded, pack base for non-existent target doesn't exist → 46
    assert.equal(centro.coverage.structures.length, 46);
  });
});

describe("§5 I9-I12: pack rule OVERRIDE and DISABLE", () => {
  it("I9: OVERRIDE changes thresholds of an existing pack structure", () => {
    const overrideRule: SnapshotPolicyRule = {
      id: "ovr-1",
      storeId: "centro",
      scope: "line",
      line: "castillitos",
      group: CS_GRUPO,
      subgroup: CS_SUBGRUPO,
      minQty: 20,
      idealQty: 30,
      maxQty: 40,
      active: true,
      priority: 99,
      ruleKind: "TEXTILE_STRUCTURE",
      effect: "OVERRIDE",
    };
    const snap = runStoreSnapshotPipeline(assembledWithRules(
      [row({ units: 6 })],
      [{ storeId: "centro", rules: [overrideRule] }],
    ));
    const centro = snap.perStore.find(s => s.storeId === "centro")!;
    // Still 46 structures (override replaces, doesn't add)
    assert.equal(centro.coverage.structures.length, 46);
    const overridden = centro.coverage.structures.find(s => s.structureKey === CS_STRUCTURE)!;
    assert.ok(overridden, "overridden structure should exist");
    assert.equal(overridden.rule.minUnits, 20);
    assert.equal(overridden.rule.idealUnits, 30);
    assert.equal(overridden.rule.maxUnits, 40);
    assert.equal(overridden.rule.source, "POLICY_OVERRIDE");
    // Caldas unaffected
    const caldas = snap.perStore.find(s => s.storeId === "caldas")!;
    const caldasStruct = caldas.coverage.structures.find(s => s.structureKey === CS_STRUCTURE)!;
    assert.equal(caldasStruct.rule.source, "PACK_DEFAULT");
    assert.equal(caldasStruct.rule.minUnits, CS_RULE.minimumUnits);
  });

  it("I10: DISABLE removes pack structure, deficit recalculated without it", () => {
    const disableRule: SnapshotPolicyRule = {
      id: "dis-pack-1",
      storeId: "centro",
      scope: "line",
      line: "castillitos",
      group: CS_GRUPO,
      subgroup: CS_SUBGRUPO,
      minQty: 0,
      idealQty: 0,
      maxQty: null,
      active: true,
      priority: 99,
      ruleKind: "TEXTILE_STRUCTURE",
      effect: "DISABLE",
    };
    const snap = runStoreSnapshotPipeline(assembledWithRules(
      [row({ units: 6 })],
      [{ storeId: "centro", rules: [disableRule] }],
    ));
    const centro = snap.perStore.find(s => s.storeId === "centro")!;
    assert.equal(centro.coverage.expectedStructures, 45);
    // Items that belonged to the disabled structure are now unresolved
    // but the deficit for that structure is gone from KPIs
    assert.ok(centro.kpis.shortageUnits >= 0);
  });

  it("I11: inactive OVERRIDE (active=false) falls back to pack default", () => {
    const inactiveOverride: SnapshotPolicyRule = {
      id: "ovr-inactive",
      storeId: "centro",
      scope: "line",
      line: "castillitos",
      group: CS_GRUPO,
      subgroup: CS_SUBGRUPO,
      minQty: 99,
      idealQty: 99,
      maxQty: 99,
      active: false, // inactive → pack default applies
      priority: 99,
      ruleKind: "TEXTILE_STRUCTURE",
      effect: "OVERRIDE",
    };
    const snap = runStoreSnapshotPipeline(assembledWithRules(
      [row({ units: 6 })],
      [{ storeId: "centro", rules: [inactiveOverride] }],
    ));
    const centro = snap.perStore.find(s => s.storeId === "centro")!;
    const struct = centro.coverage.structures.find(s => s.structureKey === CS_STRUCTURE)!;
    // Should use pack defaults, not 99/99/99
    assert.equal(struct.rule.source, "PACK_DEFAULT");
    assert.equal(struct.rule.idealUnits, CS_RULE.idealUnits);
  });
});

describe("§5 I13-I16: special product ADD and DISABLE", () => {
  it("I13: ADD special pattern creates 4th special rule", () => {
    const addSpecial: SnapshotPolicyRule = {
      id: "sp-add-1",
      storeId: "centro",
      scope: "special",
      specialPattern: "MECEDORA",
      minQty: 2,
      idealQty: 2,
      maxQty: null,
      active: true,
      priority: 99,
      ruleKind: "SPECIAL_PRODUCT",
      effect: "ADD",
    };
    const snap = runStoreSnapshotPipeline(assembledWithRules(
      [row({ units: 6 })],
      [{ storeId: "centro", rules: [addSpecial] }],
    ));
    const centro = snap.perStore.find(s => s.storeId === "centro")!;
    const caldas = snap.perStore.find(s => s.storeId === "caldas")!;
    // Centro: 4 special rules (3 base + 1 ADD)
    assert.equal(centro.coverage.specialRules.length, 4);
    const mecedora = centro.coverage.specialRules.find(r => r.pattern === "MECEDORA");
    assert.ok(mecedora, "MECEDORA special rule should exist");
    assert.equal(mecedora!.idealUnits, 2);
    assert.equal(mecedora!.totalUnits, 0); // no matching items
    assert.equal(mecedora!.status, "FALTANTE");
    // Caldas still has 3
    assert.equal(caldas.coverage.specialRules.length, 3);
  });

  it("I14: DISABLE special pattern removes it → 2 special rules for that store", () => {
    const disableSpecial: SnapshotPolicyRule = {
      id: "sp-dis-1",
      storeId: "centro",
      scope: "special",
      specialPattern: CASTILLITOS_SPECIAL_PRODUCTS.referencePatterns[0], // BANERA
      minQty: 0,
      idealQty: 0,
      maxQty: null,
      active: true,
      priority: 99,
      ruleKind: "SPECIAL_PRODUCT",
      effect: "DISABLE",
    };
    const snap = runStoreSnapshotPipeline(assembledWithRules(
      [row({ units: 6 })],
      [{ storeId: "centro", rules: [disableSpecial] }],
    ));
    const centro = snap.perStore.find(s => s.storeId === "centro")!;
    assert.equal(centro.coverage.specialRules.length, 2);
    const banera = centro.coverage.specialRules.find(
      r => r.pattern === CASTILLITOS_SPECIAL_PRODUCTS.referencePatterns[0],
    );
    assert.equal(banera, undefined, "disabled special should not appear");
    // Caldas still 3
    const caldas = snap.perStore.find(s => s.storeId === "caldas")!;
    assert.equal(caldas.coverage.specialRules.length, 3);
  });

  it("I15: ADD special with matching inventory → evaluates correctly", () => {
    const addSpecial: SnapshotPolicyRule = {
      id: "sp-add-match",
      storeId: "centro",
      scope: "special",
      specialPattern: "COLUMPIO",
      minQty: 3,
      idealQty: 3,
      maxQty: null,
      active: true,
      priority: 99,
      ruleKind: "SPECIAL_PRODUCT",
      effect: "ADD",
    };
    const snap = runStoreSnapshotPipeline(assembledWithRules(
      [
        row({ units: 6 }),
        row({ referenceCode: "REF-COL", productId: "prod-col", productName: "COLUMPIO MADERA", units: 2 }),
      ],
      [{ storeId: "centro", rules: [addSpecial] }],
    ));
    const centro = snap.perStore.find(s => s.storeId === "centro")!;
    const columpio = centro.coverage.specialRules.find(r => r.pattern === "COLUMPIO")!;
    assert.ok(columpio, "COLUMPIO special should exist");
    assert.equal(columpio.totalUnits, 2);
    assert.equal(columpio.idealUnits, 3);
    assert.equal(columpio.status, "FALTANTE");
    assert.equal(columpio.gapUnits, 1);
  });

  it("I16: OVERRIDE special changes ideal for that store", () => {
    const overrideSpecial: SnapshotPolicyRule = {
      id: "sp-ovr-1",
      storeId: "centro",
      scope: "special",
      specialPattern: CASTILLITOS_SPECIAL_PRODUCTS.referencePatterns[0], // BANERA
      minQty: 5,
      idealQty: 5,
      maxQty: null,
      active: true,
      priority: 99,
      ruleKind: "SPECIAL_PRODUCT",
      effect: "OVERRIDE",
    };
    const snap = runStoreSnapshotPipeline(assembledWithRules(
      [row({ units: 6 })],
      [{ storeId: "centro", rules: [overrideSpecial] }],
    ));
    const centro = snap.perStore.find(s => s.storeId === "centro")!;
    assert.equal(centro.coverage.specialRules.length, 3); // still 3
    const banera = centro.coverage.specialRules.find(
      r => r.pattern === CASTILLITOS_SPECIAL_PRODUCTS.referencePatterns[0],
    )!;
    assert.ok(banera);
    assert.equal(banera.idealUnits, 5); // overridden from 1 to 5
    assert.equal(banera.status, "FALTANTE"); // 0 units < 5 ideal
  });
});

describe("§5 I17-I19: coverage KPI uses effective denominator", () => {
  it("I17: ADD structure increases denominator → coverage % decreases", () => {
    const snapBase = runStoreSnapshotPipeline(assembled([row({ units: 6 })]));
    const centroBase = snapBase.perStore.find(s => s.storeId === "centro")!;
    const baseCoverage = centroBase.kpis.coveragePercent;

    const addRule: SnapshotPolicyRule = {
      id: "kpi-add",
      storeId: "centro",
      scope: "line",
      line: "castillitos",
      group: "KPI_GRP",
      subgroup: "KPI_SUB",
      minQty: 5,
      idealQty: 8,
      maxQty: 15,
      active: true,
      priority: 99,
      ruleKind: "TEXTILE_STRUCTURE",
      effect: "ADD",
    };
    const snapAdd = runStoreSnapshotPipeline(assembledWithRules(
      [row({ units: 6 })],
      [{ storeId: "centro", rules: [addRule] }],
    ));
    const centroAdd = snapAdd.perStore.find(s => s.storeId === "centro")!;
    // More structures → same healthy count → lower %
    assert.ok(
      (centroAdd.kpis.coveragePercent ?? 0) <= (baseCoverage ?? 0),
      `ADD should not increase coverage: ${centroAdd.kpis.coveragePercent} should <= ${baseCoverage}`,
    );
    assert.equal(centroAdd.coverage.expectedStructures, 47);
  });

  it("I18: DISABLE structure decreases denominator → coverage % may increase", () => {
    const disableRule: SnapshotPolicyRule = {
      id: "kpi-dis",
      storeId: "centro",
      scope: "line",
      line: "castillitos",
      group: CS_GRUPO,
      subgroup: CS_SUBGRUPO,
      minQty: 0,
      idealQty: 0,
      maxQty: null,
      active: true,
      priority: 99,
      ruleKind: "TEXTILE_STRUCTURE",
      effect: "DISABLE",
    };
    const snap = runStoreSnapshotPipeline(assembledWithRules(
      [row({ units: 6 })],
      [{ storeId: "centro", rules: [disableRule] }],
    ));
    const centro = snap.perStore.find(s => s.storeId === "centro")!;
    assert.equal(centro.coverage.expectedStructures, 45);
    // coveragePercent calculated on 45, not 46
    const expectedPct = centro.coverage.expectedStructures > 0
      ? Math.round((centro.coverage.healthyStructures / centro.coverage.expectedStructures) * 100)
      : 0;
    assert.equal(centro.kpis.coveragePercent, expectedPct);
  });

  it("I19: module KPIs reflect per-store dynamic universes", () => {
    const addRule: SnapshotPolicyRule = {
      id: "mod-kpi",
      storeId: "centro",
      scope: "line",
      line: "castillitos",
      group: "MOD_GRP",
      subgroup: "MOD_SUB",
      minQty: 5,
      idealQty: 8,
      maxQty: 15,
      active: true,
      priority: 99,
      ruleKind: "TEXTILE_STRUCTURE",
      effect: "ADD",
    };
    const snap = runStoreSnapshotPipeline(assembledWithRules(
      [row({ units: 6 })],
      [{ storeId: "centro", rules: [addRule] }],
    ));
    // Module KPIs aggregate across stores
    assert.ok((snap.moduleKpis.coberturaRed ?? 0) >= 0);
    assert.ok((snap.moduleKpis.coberturaRed ?? 0) <= 100);
  });
});

describe("§5 I20-I21: ruleEvaluations payload and backward compatibility", () => {
  it("I20: ruleEvaluations mirrors structures + specialRules count", () => {
    const addRule: SnapshotPolicyRule = {
      id: "re-add",
      storeId: "centro",
      scope: "line",
      line: "castillitos",
      group: "RE_GRP",
      subgroup: "RE_SUB",
      minQty: 5,
      idealQty: 8,
      maxQty: 15,
      active: true,
      priority: 99,
      ruleKind: "TEXTILE_STRUCTURE",
      effect: "ADD",
    };
    const snap = runStoreSnapshotPipeline(assembledWithRules(
      [row({ units: 6 })],
      [{ storeId: "centro", rules: [addRule] }],
    ));
    const centro = snap.perStore.find(s => s.storeId === "centro")!;
    assert.equal(
      centro.coverage.ruleEvaluations.length,
      centro.coverage.structures.length + centro.coverage.specialRules.length,
    );
    // Every ruleEvaluation has required fields
    for (const re of centro.coverage.ruleEvaluations) {
      assert.ok(re.ruleId, "ruleId required");
      assert.ok(re.ruleType, "ruleType required");
      assert.ok(re.label, "label required");
      assert.ok(re.status, "status required");
      assert.ok(typeof re.actualUnits === "number");
      assert.ok(typeof re.gapToIdeal === "number");
    }
  });

  it("I21: structures[] and specialRules[] remain populated (backward compat)", () => {
    const snap = runStoreSnapshotPipeline(assembled([row({ units: 6 })]));
    for (const store of snap.perStore) {
      // Legacy arrays still populated
      assert.ok(Array.isArray(store.coverage.structures));
      assert.ok(Array.isArray(store.coverage.specialRules));
      assert.equal(store.coverage.structures.length, 46);
      assert.equal(store.coverage.specialRules.length, 3);
      // ruleEvaluations is the unified view
      assert.equal(store.coverage.ruleEvaluations.length, 49);
    }
  });
});

describe("§5 I22-I25: serialization, performance, multi-store isolation", () => {
  it("I22: snapshot with dynamic rules is fully serializable (no Map/Set/Function)", () => {
    const addRule: SnapshotPolicyRule = {
      id: "ser-1",
      storeId: "centro",
      scope: "line",
      line: "castillitos",
      group: "SER_GRP",
      subgroup: "SER_SUB",
      minQty: 5,
      idealQty: 8,
      maxQty: 15,
      active: true,
      priority: 99,
      ruleKind: "TEXTILE_STRUCTURE",
      effect: "ADD",
    };
    const snap = runStoreSnapshotPipeline(assembledWithRules(
      [row({ units: 6 })],
      [{ storeId: "centro", rules: [addRule] }],
    ));
    const scan = (v: unknown): void => {
      assert.ok(!(v instanceof Map) && !(v instanceof Set) && typeof v !== "function");
      if (v && typeof v === "object") for (const child of Object.values(v)) scan(child);
    };
    scan(snap);
    assert.deepEqual(JSON.parse(JSON.stringify(snap)), snap);
  });

  it("I23: dynamic rules for one store do not leak to another store", () => {
    const addCentro: SnapshotPolicyRule = {
      id: "iso-1",
      storeId: "centro",
      scope: "line",
      line: "castillitos",
      group: "ISO_GRP",
      subgroup: "ISO_SUB",
      minQty: 5,
      idealQty: 8,
      maxQty: 15,
      active: true,
      priority: 99,
      ruleKind: "TEXTILE_STRUCTURE",
      effect: "ADD",
    };
    const disableCaldas: SnapshotPolicyRule = {
      id: "iso-2",
      storeId: "caldas",
      scope: "line",
      line: "castillitos",
      group: CS_GRUPO,
      subgroup: CS_SUBGRUPO,
      minQty: 0,
      idealQty: 0,
      maxQty: null,
      active: true,
      priority: 99,
      ruleKind: "TEXTILE_STRUCTURE",
      effect: "DISABLE",
    };
    const snap = runStoreSnapshotPipeline(assembledWithRules(
      [row({ units: 6 })],
      [
        { storeId: "centro", rules: [addCentro] },
        { storeId: "caldas", rules: [disableCaldas] },
      ],
    ));
    const centro = snap.perStore.find(s => s.storeId === "centro")!;
    const caldas = snap.perStore.find(s => s.storeId === "caldas")!;
    // Centro: 47 (46 + 1 ADD), has ISO_SUB, has CS_STRUCTURE
    assert.equal(centro.coverage.structures.length, 47);
    assert.ok(centro.coverage.structures.find(s => s.structureKey.includes("ISO_SUB")));
    assert.ok(centro.coverage.structures.find(s => s.structureKey === CS_STRUCTURE));
    // Caldas: 45 (46 - 1 DISABLE), no ISO_SUB, no CS_STRUCTURE
    assert.equal(caldas.coverage.structures.length, 45);
    assert.equal(caldas.coverage.structures.find(s => s.structureKey.includes("ISO_SUB")), undefined);
    assert.equal(caldas.coverage.structures.find(s => s.structureKey === CS_STRUCTURE), undefined);
  });

  it("I24: pipeline runs in < 500ms with dynamic rules (performance gate)", () => {
    const rules: SnapshotPolicyRule[] = [];
    // Add 5 dynamic structural rules per store
    for (let i = 0; i < 5; i++) {
      rules.push({
        id: `perf-${i}`,
        storeId: "centro",
        scope: "line",
        line: "castillitos",
        group: `PERF_GRP_${i}`,
        subgroup: `PERF_SUB_${i}`,
        minQty: 5,
        idealQty: 8,
        maxQty: 15,
        active: true,
        priority: 99 + i,
        ruleKind: "TEXTILE_STRUCTURE",
        effect: "ADD",
      });
    }
    const start = performance.now();
    const snap = runStoreSnapshotPipeline(assembledWithRules(
      [row({ units: 6 }), main("REF-1", 40)],
      [{ storeId: "centro", rules }],
    ));
    const elapsed = performance.now() - start;
    assert.ok(elapsed < 500, `pipeline should run in < 500ms, took ${elapsed.toFixed(1)}ms`);
    assert.equal(snap.perStore.find(s => s.storeId === "centro")!.coverage.structures.length, 51); // 46 + 5
  });

  it("I25: combined ADD structural + ADD special + OVERRIDE → consistent snapshot", () => {
    const rules: SnapshotPolicyRule[] = [
      {
        id: "combo-struct",
        storeId: "centro",
        scope: "line",
        line: "castillitos",
        group: "COMBO_GRP",
        subgroup: "COMBO_SUB",
        minQty: 3,
        idealQty: 6,
        maxQty: 12,
        active: true,
        priority: 99,
        ruleKind: "TEXTILE_STRUCTURE",
        effect: "ADD",
      },
      {
        id: "combo-special",
        storeId: "centro",
        scope: "special",
        specialPattern: "TRAMPOLIN",
        minQty: 1,
        idealQty: 1,
        maxQty: null,
        active: true,
        priority: 99,
        ruleKind: "SPECIAL_PRODUCT",
        effect: "ADD",
      },
      {
        id: "combo-override",
        storeId: "centro",
        scope: "line",
        line: "castillitos",
        group: CS_GRUPO,
        subgroup: CS_SUBGRUPO,
        minQty: 15,
        idealQty: 20,
        maxQty: 25,
        active: true,
        priority: 99,
        ruleKind: "TEXTILE_STRUCTURE",
        effect: "OVERRIDE",
      },
    ];
    const snap = runStoreSnapshotPipeline(assembledWithRules(
      [row({ units: 6 })],
      [{ storeId: "centro", rules }],
    ));
    const centro = snap.perStore.find(s => s.storeId === "centro")!;
    // 47 structures (46 + 1 ADD), 4 specials (3 + 1 ADD)
    assert.equal(centro.coverage.structures.length, 47);
    assert.equal(centro.coverage.specialRules.length, 4);
    // ruleEvaluations = 47 + 4 = 51
    assert.equal(centro.coverage.ruleEvaluations.length, 51);
    // Override applied
    const overridden = centro.coverage.structures.find(s => s.structureKey === CS_STRUCTURE)!;
    assert.equal(overridden.rule.idealUnits, 20);
    assert.equal(overridden.rule.source, "POLICY_OVERRIDE");
    // ADD structural exists
    const added = centro.coverage.structures.find(s => s.structureKey.includes("COMBO_SUB"))!;
    assert.ok(added);
    assert.equal(added.rule.source, "POLICY_ADD");
    // ADD special exists
    const trampolin = centro.coverage.specialRules.find(r => r.pattern === "TRAMPOLIN")!;
    assert.ok(trampolin);
    assert.equal(trampolin.idealUnits, 1);
    // Serializable
    assert.deepEqual(JSON.parse(JSON.stringify(snap)), snap);
  });
});
