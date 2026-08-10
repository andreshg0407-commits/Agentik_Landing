/**
 * lib/connectors/adapters/sag-pya-soap/orders/__tests__/current-order-ingestion.test.ts
 *
 * AGENTIK-CURRENT-SAG-ORDER-INGESTION-01 — gates A–J.
 *
 * Ley pura (piso de cutover) + guardianes fs sobre el contrato:
 * CURRENT-only, sin fallback histórico, idempotencia por identidades SAG
 * estables, reutilización de storage/mapper/router existentes.
 *
 * Las pruebas con datos reales (backfill, gap/overlap/duplicados) las emite
 * scripts/backfill-current-orders.ts contra la base.
 *
 * Run: npx tsx --test lib/connectors/adapters/sag-pya-soap/orders/__tests__/current-order-ingestion.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";

import {
  resolveIngestionFloor,
  isCurrentEligible,
  CURRENT_CUTOVER,
  CURRENT_CUTOVER_ISO,
} from "../current-order-cutover-law";

const SRC = fs.readFileSync(path.resolve(__dirname, "../current-order-ingestion.ts"), "utf8");
const LINES_SRC = fs.readFileSync(path.resolve(__dirname, "../sag-order-lines-sync.ts"), "utf8");
const STORAGE_SRC = fs.readFileSync(path.resolve(__dirname, "../../storage.ts"), "utf8");
const CRON_SRC = fs.readFileSync(path.resolve(__dirname, "../../../../../../app/api/cron/current-orders-sync/route.ts"), "utf8");
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, "");

describe("Ley de cutover (gates A/C/D)", () => {
  it("cutover exacto = 2026-07-21 (constante única)", () => {
    assert.equal(CURRENT_CUTOVER_ISO, "2026-07-21");
    assert.equal(CURRENT_CUTOVER.toISOString(), "2026-07-21T00:00:00.000Z");
  });

  it("A/D: el piso JAMÁS baja del cutover — sin fecha, fecha inválida o anterior → cutover", () => {
    assert.equal(resolveIngestionFloor(null).toISOString(), CURRENT_CUTOVER.toISOString());
    assert.equal(resolveIngestionFloor(undefined).toISOString(), CURRENT_CUTOVER.toISOString());
    assert.equal(resolveIngestionFloor(new Date("invalid")).toISOString(), CURRENT_CUTOVER.toISOString());
    assert.equal(resolveIngestionFloor(new Date("2026-07-01")).toISOString(), CURRENT_CUTOVER.toISOString());
    assert.equal(resolveIngestionFloor(new Date("2020-01-01")).toISOString(), CURRENT_CUTOVER.toISOString());
  });

  it("resumable: piso posterior al cutover se respeta (reanudación determinista)", () => {
    const d = new Date("2026-08-01T00:00:00.000Z");
    assert.equal(resolveIngestionFloor(d).toISOString(), d.toISOString());
  });

  it("C: elegibilidad CURRENT — 2026-07-20 NO, 2026-07-21 SÍ (sin overlap por construcción)", () => {
    assert.equal(isCurrentEligible(new Date("2026-07-20T23:59:59.999Z")), false);
    assert.equal(isCurrentEligible(new Date("2026-07-21T00:00:00.000Z")), true);
    assert.equal(isCurrentEligible(new Date("2026-09-01")), true);
    assert.equal(isCurrentEligible(null), false);
    assert.equal(isCurrentEligible(new Date("invalid")), false);
  });
});

describe("Guardianes de contrato (gates A/B/E/F)", () => {
  it("A: la ingestión usa EXCLUSIVAMENTE getSagConnection(\"CURRENT\") para leer", () => {
    assert.ok(SRC.includes('getSagConnection("CURRENT")'), "conexión CURRENT requerida");
    // HISTORICAL solo aparece como guardia anti-contaminación (comparación de bases), jamás como fuente
    const historicalUses = [...strip(SRC).matchAll(/getSagConnection\("HISTORICAL"\)/g)];
    assert.equal(historicalUses.length, 1, "HISTORICAL solo en la guardia anti-contaminación");
    assert.ok(strip(SRC).includes("hist.database === cfg.database"), "guardia de misma-base presente");
    assert.ok(!strip(SRC).includes("fallback"), "cero fallback histórico");
  });

  it("B/E: query PD-only con semántica certificada (clase 4 + anulado='N' + piso >= cutover)", () => {
    assert.ok(SRC.includes("f.k_n_clase_fuente = 4"));
    assert.ok(SRC.includes("m.sc_anulado = 'N'"));
    assert.ok(SRC.includes("m.d_fecha_documento >= '"));
    // mapper certificado, no uno nuevo
    assert.ok(SRC.includes("mapSagOrder("), "reutiliza el mapper PD certificado");
    // guardia por fila
    assert.ok(SRC.includes("isCurrentEligible(ord.orderDate)"), "cada header pasa la guardia de cutover");
  });

  it("E/H: headers via customerOrderStorage (upsert por organizationId+erpMovId — cero duplicados)", () => {
    assert.ok(SRC.includes("customerOrderStorage.upsertMany("), "storage canónico reutilizado");
    assert.ok(STORAGE_SRC.includes("organizationId_erpMovId"), "unique compuesto de headers");
    assert.ok(!strip(SRC).includes("customerOrderRecord.create"), "cero create directo fuera del storage");
  });

  it("F/I: líneas via syncOrderLines (upsert por organizationId+erpItemId — cero duplicados)", () => {
    assert.ok(SRC.includes("syncOrderLines({"), "sync de líneas canónico reutilizado");
    assert.ok(SRC.includes("sinceDate: floor"), "líneas acotadas al piso CURRENT");
    assert.ok(LINES_SRC.includes("erpItemId"), "identidad estable de línea");
    assert.ok(!strip(SRC).includes("customerOrderLine.create"), "cero create directo de líneas");
  });

  it("G: reanudable e idempotente — el cron deriva el piso del último pedido local >= cutover", () => {
    assert.ok(CRON_SRC.includes("orderDate: { gte: CURRENT_CUTOVER }"), "resume desde lo local CURRENT");
    assert.ok(CRON_SRC.includes("runCurrentOrderIngestion({ organizationId: orgId, sinceDate })"));
    assert.ok(CRON_SRC.includes("INTERNAL_CRON_SECRET"), "protegido como data-sync");
  });

  it("router dual INTOCADO — la ingestión no redefine bases ni toca el resolver", () => {
    assert.ok(!strip(SRC).includes("process.env.PYA_"), "cero lectura directa de envs SAG");
    assert.ok(!strip(SRC).includes("INDDIANAA"), "cero nombres de base hardcodeados");
  });
});

describe("J: top products lee SOLO el modelo local canónico (sin mezclar fuentes por período)", () => {
  it("customer-purchase-intelligence consulta CustomerOrderRecord/Line locales, jamás SAG directo", () => {
    const cpi = fs.readFileSync(
      path.resolve(__dirname, "../../../../../../lib/comercial/frontline/customer-purchase-intelligence.ts"), "utf8");
    assert.ok(cpi.includes("customerOrderRecord.findMany"), "lee el read model local");
    assert.ok(!cpi.includes("consultaSagJson"), "cero SOAP en la lectura");
    assert.ok(!cpi.includes("getSagConnection"), "cero selección de fuente en la lectura");
    // Con eso: histórico <= 07-20 y current >= 07-21 conviven en el MISMO modelo
    // local sin mezcla de fuentes para el mismo período (cada fila proviene de
    // una única ingesta gobernada por el cutover).
  });
});
