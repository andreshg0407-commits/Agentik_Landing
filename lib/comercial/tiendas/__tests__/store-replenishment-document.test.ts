/**
 * lib/comercial/tiendas/__tests__/store-replenishment-document.test.ts
 *
 * AGENTIK-STORES-REPLENISHMENT-DOCUMENT-01 — certification tests.
 *
 * Certifica la condición del sprint: el documento es representación
 * PERSISTIDA del plan certificado — partición verbatim sin pérdida, snapshot
 * inmutable, consecutivo íntegro, y renderers que solo formatean.
 *
 * El plan de entrada se construye con el motor REAL del Sprint 6 (y este a
 * su vez con necesidades del motor REAL del Sprint 5) — integración
 * certificada, no simulada.
 *
 * Run: npx tsx --test lib/comercial/tiendas/__tests__/store-replenishment-document.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  formatDocumentNumber,
  partitionPlanForStore,
  verifyLosslessPartition,
  buildSnapshot,
  canonicalJson,
  computePartitionFingerprint,
  SNAPSHOT_SCHEMA_VERSION,
  REPLENISHMENT_DOCUMENT_STATUSES,
} from "../store-replenishment-document-types";
import { renderReplenishmentDocumentHtml, escapeHtml } from "../store-replenishment-document-renderer";
import { buildReplenishmentDocumentSheets, sanitizeCell } from "../store-replenishment-document-excel";
import { buildStoreReplenishmentPlan } from "../store-replenishment-allocation-engine";
import { buildStoreUnitNeeds, type StructureAvailability, type StoreUnitNeedsResult } from "../store-unit-needs-engine";
import type { SpecialRuleEvaluation } from "../store-unit-coverage-engine";
import { evaluateUnitsRule } from "../../derrotero-semantics";

// ── Build a REAL plan through the certified Sprint 5 + 6 engines ─────────────

function known(eligibleUnits: number): StructureAvailability {
  return { status: "CONOCIDA", eligibleUnits, blockedUnits: 0, totalUnits: eligibleUnits };
}

function needsFor(storeId: string, withRetiro = false): StoreUnitNeedsResult {
  const specials: SpecialRuleEvaluation[] = withRetiro ? [{
    pattern: "CORRAL", label: "CORRAL", storeId,
    idealUnits: 0, totalUnits: 2, matchedReferenceCount: 1,
    status: "NO_AUTORIZADA", gapUnits: 2, severity: "high",
  }] : [];
  return buildStoreUnitNeeds({
    storeId,
    structures: [
      {
        structureKey: "CS|G|PIJAMA", label: "PIJAMA", line: "CASTILLITOS",
        structuralCoverageStatus: "CUBIERTA",
        unitRule: evaluateUnitsRule(6, { minUnits: 8, idealUnits: 10, maxUnits: 12 }),  // necesita 4
      },
      {
        structureKey: "CS|G|VESTIDO", label: "VESTIDO", line: "CASTILLITOS",
        structuralCoverageStatus: "CUBIERTA",
        unitRule: evaluateUnitsRule(4, { minUnits: 8, idealUnits: 10, maxUnits: 12 }),  // necesita 6, sin datos
      },
    ],
    specialRules: specials,
    availability: new Map([["CS|G|PIJAMA", known(4)]]),   // VESTIDO ausente → SIN_DATOS
  });
}

function realPlan() {
  const centro = needsFor("centro", true);
  const sanDiego = needsFor("san_diego");
  return {
    plan: buildStoreReplenishmentPlan({
      storePriorityOrder: ["centro", "san_diego"],
      materialPriorityStoreIds: ["centro", "caldas"],
      needsByStore: new Map([["centro", centro], ["san_diego", sanDiego]]),
      referencePools: new Map([["R1", { eligibleUnits: 20, productName: "Pijama Niña <CL>", underScarcityThreshold: false }]]),
      candidatesByStructure: new Map([["CS|G|PIJAMA", [{
        referenceCode: "R1",
        candidateTypeByStore: new Map([
          ["centro", "REPOSICION_MISMA_REFERENCIA" as const],
          ["san_diego", "COMPLEMENTO_REFERENCIA_COMPATIBLE" as const],
        ]),
      }]]]),
    }),
    centro,
    sanDiego,
  };
}

function snapshotFor(storeId: string) {
  const { plan, centro, sanDiego } = realPlan();
  const needs = storeId === "centro" ? centro : sanDiego;
  const partition = partitionPlanForStore(plan, storeId, needs.needs.filter(n => n.action === "RETIRO"));
  return buildSnapshot({
    documentNumber: "SR-00042",
    batchId: "batch-1",
    storeName: storeId === "centro" ? "Centro" : "San Diego",
    planGeneratedAt: "2026-07-29T22:55:00.000Z",
    documentGeneratedAt: "2026-07-29T23:00:00.000Z",
    generatedBy: "andres",
    partition,
    scarcityMaterializedGlobal: plan.scarcityMaterialized,
  });
}

// ═════════════════════════════════════════════════════════════════════════════
// 1. Consecutivo y estados
// ═════════════════════════════════════════════════════════════════════════════

describe("consecutivo y estados", () => {
  it("formato SR-NNNNN con ceros a la izquierda", () => {
    assert.equal(formatDocumentNumber(1), "SR-00001");
    assert.equal(formatDocumentNumber(42), "SR-00042");
    assert.equal(formatDocumentNumber(123456), "SR-123456");   // crece sin truncar
  });

  it("consecutivo inválido se rechaza", () => {
    assert.throws(() => formatDocumentNumber(0));
    assert.throws(() => formatDocumentNumber(-3));
    assert.throws(() => formatDocumentNumber(2.5));
  });

  it("el enum de estados del Sprint 8 queda declarado completo", () => {
    assert.deepEqual([...REPLENISHMENT_DOCUMENT_STATUSES], [
      "BORRADOR", "RESERVADO", "APROBADO", "PREPARACION", "DESPACHADO", "RECIBIDO", "CERRADO", "CANCELADO",
    ]);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 2. Partición verbatim sin pérdida
// ═════════════════════════════════════════════════════════════════════════════

describe("partición por tienda", () => {
  it("cada documento contiene SOLO lo de su tienda y la unión reconstruye el plan", () => {
    const { plan, centro, sanDiego } = realPlan();
    const pCentro = partitionPlanForStore(plan, "centro", centro.needs.filter(n => n.action === "RETIRO"));
    const pSd = partitionPlanForStore(plan, "san_diego", sanDiego.needs.filter(n => n.action === "RETIRO"));

    assert.ok(pCentro.suggestions.every(s => s.storeId === "centro"));
    assert.ok(pSd.suggestions.every(s => s.storeId === "san_diego"));
    assert.ok(pCentro.unallocated.every(u => u.storeId === "centro"));
    assert.equal(pCentro.withdrawals.length, 1);       // el RETIRO de centro
    assert.equal(pSd.withdrawals.length, 0);
    assert.equal(verifyLosslessPartition(plan, [pCentro, pSd]), true);
  });

  it("las unidades del documento son las del plan, verbatim (cero recalculo)", () => {
    const { plan, centro } = realPlan();
    const p = partitionPlanForStore(plan, "centro", centro.needs.filter(n => n.action === "RETIRO"));
    const planCentroUnits = plan.suggestions.filter(s => s.storeId === "centro").reduce((t, s) => t + s.units, 0);
    const partUnits = p.suggestions.reduce((t, s) => t + s.units, 0);
    assert.equal(partUnits, planCentroUnits);
    assert.equal(p.summary.allocatedUnits, planCentroUnits);
  });

  it("retiros que no cuadran con el summary → snapshot abortado", () => {
    const { plan } = realPlan();
    assert.throws(
      () => partitionPlanForStore(plan, "centro", []),   // centro tiene retiro de 2 unds
      /no cuadran/,
    );
  });

  it("tienda sin resumen en el plan → rechazo", () => {
    const { plan } = realPlan();
    assert.throws(() => partitionPlanForStore(plan, "fantasma", []));
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 3. Snapshot inmutable
// ═════════════════════════════════════════════════════════════════════════════

describe("snapshot inmutable", () => {
  it("mutar el plan después de crear el snapshot NO altera el documento", () => {
    const { plan, centro } = realPlan();
    const partition = partitionPlanForStore(plan, "centro", centro.needs.filter(n => n.action === "RETIRO"));
    const snapshot = buildSnapshot({
      documentNumber: "SR-00001", batchId: "b", storeName: "Centro",
      planGeneratedAt: "2026-07-29T22:55:00.000Z",
      documentGeneratedAt: "2026-07-29T23:00:00.000Z", generatedBy: "andres",
      partition, scarcityMaterializedGlobal: false,
    });

    const before = snapshot.suggestions[0].units;
    (plan.suggestions[0] as any).units = 999;             // mutación hostil del plan vivo
    (partition.suggestions[0] as any).units = 999;
    assert.equal(snapshot.suggestions[0].units, before);  // el snapshot no comparte referencias
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 4. Renderer HTML
// ═════════════════════════════════════════════════════════════════════════════

describe("renderer HTML", () => {
  it("incluye consecutivo, tienda y las tres secciones con totales verbatim", () => {
    const s = snapshotFor("centro");
    const html = renderReplenishmentDocumentHtml(s);
    assert.ok(html.includes("SR-00042"));
    assert.ok(html.includes("Centro"));
    assert.ok(html.includes("1. Reposiciones"));
    assert.ok(html.includes("2. Retiros"));
    assert.ok(html.includes("3. Necesidades no asignadas"));
    assert.ok(html.includes(`Asignado: <b>${s.summary.allocatedUnits}</b>`));
    assert.ok(html.includes(`Retiros: <b>${s.summary.withdrawalUnits}</b>`));
  });

  it("imprime las justificaciones desde las razones ESTRUCTURADAS del Sprint 6", () => {
    const s = snapshotFor("centro");
    const html = renderReplenishmentDocumentHtml(s);
    for (const r of s.suggestions[0].reasons) {
      assert.ok(html.includes(escapeHtml(r.detail)));
    }
  });

  it("escapa contenido hostil (nombres con HTML)", () => {
    const s = snapshotFor("centro");
    const html = renderReplenishmentDocumentHtml(s);
    assert.ok(!html.includes("Pijama Niña <CL>"));           // crudo NO
    assert.ok(html.includes("Pijama Niña &lt;CL&gt;"));      // escapado SÍ
  });

  it("documento sin reposiciones sigue siendo válido (secciones vacías explícitas)", () => {
    const s = snapshotFor("san_diego");
    // san_diego: 4 unds asignadas — construir uno vacío real: filtrar
    const empty = { ...s, suggestions: [], withdrawals: [], unallocated: [], summary: { ...s.summary, allocatedUnits: 0, withdrawalUnits: 0, suggestionCount: 0 } };
    const html = renderReplenishmentDocumentHtml(empty);
    assert.ok(html.includes("Sin reposiciones para esta tienda"));
    assert.ok(html.includes("Sin retiros pendientes"));
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 5. Excel
// ═════════════════════════════════════════════════════════════════════════════

describe("hojas de Excel", () => {
  it("cuatro hojas con filas tipadas y unidades numéricas", () => {
    const s = snapshotFor("centro");
    const sheets = buildReplenishmentDocumentSheets(s);
    assert.deepEqual(sheets.map(x => x.name), ["Resumen", "Reposiciones", "Retiros", "No asignadas"]);

    const repo = sheets[1];
    assert.equal(repo.rows.length, 1 + s.suggestions.length);   // header + filas
    for (const row of repo.rows.slice(1)) {
      assert.equal(typeof row[5], "number");                    // unidades como número
    }
    const retiros = sheets[2];
    assert.equal(retiros.rows.length, 1 + s.withdrawals.length);
  });

  it("el resumen cuadra con el summary verbatim", () => {
    const s = snapshotFor("centro");
    const resumen = buildReplenishmentDocumentSheets(s)[0];
    const find = (label: string) => resumen.rows.find(r => r[0] === label)?.[1];
    assert.equal(find("Unidades asignadas"), s.summary.allocatedUnits);
    assert.equal(find("Unidades a retirar"), s.summary.withdrawalUnits);
    assert.equal(find("Pendiente de negocio"), s.summary.totalBusinessPendingUnits);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 6. Ajustes certificados v2
// ═════════════════════════════════════════════════════════════════════════════

describe("JSON canónico y fingerprint de idempotencia", () => {
  it("canonicalJson es estable ante orden de claves distinto", () => {
    const a = { z: 1, a: { c: [1, 2], b: "x" } };
    const b = { a: { b: "x", c: [1, 2] }, z: 1 };
    assert.equal(canonicalJson(a), canonicalJson(b));
  });

  it("mismo contenido → mismo fingerprint; contenido distinto → distinto", () => {
    const { plan, centro } = realPlan();
    const p1 = partitionPlanForStore(plan, "centro", centro.needs.filter(n => n.action === "RETIRO"));
    const p2 = partitionPlanForStore(plan, "centro", centro.needs.filter(n => n.action === "RETIRO"));
    assert.equal(computePartitionFingerprint(p1), computePartitionFingerprint(p2));

    const mutated = { ...p1, suggestions: p1.suggestions.map(s => ({ ...s, units: s.units + 1 })) };
    assert.notEqual(computePartitionFingerprint(p1), computePartitionFingerprint(mutated));
  });

  it("el fingerprint NO depende de timestamps ni de consecutivo (idempotencia real)", () => {
    const { plan, centro } = realPlan();
    const p = partitionPlanForStore(plan, "centro", centro.needs.filter(n => n.action === "RETIRO"));
    const f1 = computePartitionFingerprint(p);
    // el fingerprint se calcula sobre la partición, que no contiene ni fecha ni número
    const f2 = computePartitionFingerprint(JSON.parse(JSON.stringify(p)));
    assert.equal(f1, f2);
    assert.ok(f1.startsWith(`v${SNAPSHOT_SCHEMA_VERSION}-`));
  });
});

describe("escasez global vs escasez de tienda", () => {
  it("la tienda con POOL_AGOTADO marca scarcityAffectedThisStore", () => {
    const { plan, centro, sanDiego } = realPlan();
    void sanDiego;
    // Forzar un plan con escasez: pool 2 para necesidad ejecutable 4 de centro
    const scarcePlan = (() => {
      const c = needsFor("centro");
      return buildStoreReplenishmentPlan({
        storePriorityOrder: ["centro"],
        materialPriorityStoreIds: ["centro", "caldas"],
        needsByStore: new Map([["centro", c]]),
        referencePools: new Map([["R1", { eligibleUnits: 2, productName: "P", underScarcityThreshold: false }]]),
        candidatesByStructure: new Map([["CS|G|PIJAMA", [{
          referenceCode: "R1",
          candidateTypeByStore: new Map([["centro", "REPOSICION_MISMA_REFERENCIA" as const]]),
        }]]]),
      });
    })();
    const cNeeds = needsFor("centro");
    const partition = partitionPlanForStore(scarcePlan, "centro", cNeeds.needs.filter(n => n.action === "RETIRO"));
    const snap = buildSnapshot({
      documentNumber: "SR-00002", batchId: "b", storeName: "Centro",
      planGeneratedAt: "2026-07-29T22:55:00.000Z",
      documentGeneratedAt: "2026-07-29T23:00:00.000Z", generatedBy: "x",
      partition, scarcityMaterializedGlobal: scarcePlan.scarcityMaterialized,
    });
    assert.equal(snap.scarcityAffectedThisStore, true);
    void plan; void centro;
  });

  it("tienda sin POOL_AGOTADO no se marca afectada aunque haya escasez global", () => {
    const s = snapshotFor("centro");   // pool abundante en realPlan
    assert.equal(s.scarcityAffectedThisStore, false);
  });

  it("el snapshot separa planGeneratedAt de documentGeneratedAt y declara schemaVersion", () => {
    const s = snapshotFor("centro");
    assert.equal(s.schemaVersion, SNAPSHOT_SCHEMA_VERSION);
    assert.notEqual(s.planGeneratedAt, s.documentGeneratedAt);
  });
});

describe("protección contra formula injection en Excel", () => {
  it("celdas que empiezan con = + - @ se neutralizan con apóstrofo", () => {
    assert.equal(sanitizeCell("=SUM(A1:A9)"), "'=SUM(A1:A9)");
    assert.equal(sanitizeCell("+1234"), "'+1234");
    assert.equal(sanitizeCell("-cmd"), "'-cmd");
    assert.equal(sanitizeCell("@import"), "'@import");
  });

  it("números, booleanos y texto normal pasan intactos", () => {
    assert.equal(sanitizeCell(42), 42);
    assert.equal(sanitizeCell(true), true);
    assert.equal(sanitizeCell("PIJAMA CL"), "PIJAMA CL");
  });

  it("un nombre de producto hostil llega neutralizado a la hoja", () => {
    const s = snapshotFor("centro");
    const hostile = {
      ...s,
      suggestions: s.suggestions.map(sg => ({ ...sg, productName: "=HYPERLINK(\"http://mal\")" })),
    };
    const sheets = buildReplenishmentDocumentSheets(hostile);
    const repoRows = sheets[1].rows.slice(1);
    for (const rw of repoRows) {
      assert.ok(String(rw[2]).startsWith("'="));
    }
  });
});
