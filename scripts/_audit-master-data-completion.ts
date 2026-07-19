/**
 * _audit-master-data-completion.ts
 *
 * COMERCIAL-INVENTARIO-MASTER-DATA-COMPLETION-01 — Fase 3 + Fase 4 + Fase 5
 *
 * Queries SAG directly for 30+ diverse references and compares against
 * ProductEntity and CommercialCoverageSnapshot to identify data loss points.
 *
 * Phase 3: Direct SAG audit — what does SAG actually deliver?
 * Phase 4: Confirm SAG tables and fields — build availability matrix
 * Phase 5: SAG vs Agentik comparison — field-by-field data loss report
 *
 * READ-ONLY. No writes to any table.
 *
 * Usage:
 *   npx dotenv-cli -e .env -- npx tsx scripts/_audit-master-data-completion.ts
 */

import { consultaSagJson } from "@/lib/connectors/pya/client";
import { normalizeArticles } from "@/lib/connectors/adapters/sag-pya-soap/catalog/sag-articles-normalizer";
import { LOOKUP_TABLE_CONFIGS } from "@/lib/connectors/adapters/sag-pya-soap/catalog/sag-master-lookups-normalizer";
import { normalizeLookupRows } from "@/lib/connectors/adapters/sag-pya-soap/catalog/sag-master-lookups-normalizer";
import type { PyaApiConfig } from "@/lib/connectors/pya/types";
import type { SagLookupNormalized } from "@/lib/connectors/adapters/sag-pya-soap/catalog/sag-master-lookups-types";
import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";

const B = (s: string) => `\x1b[1m${s}\x1b[0m`;
const G = (s: string) => `\x1b[32m${s}\x1b[0m`;
const R = (s: string) => `\x1b[31m${s}\x1b[0m`;
const Y = (s: string) => `\x1b[33m${s}\x1b[0m`;
const C = (s: string) => `\x1b[36m${s}\x1b[0m`;
const D = (s: string) => `\x1b[2m${s}\x1b[0m`;

const ORG = "cmmpwstuf000dp5y58kj1daaj";
const MANDATORY_REF = "CL-2541363";

function str(v: unknown): string {
  if (v == null) return "";
  return String(v).trim();
}
function num(v: unknown): number {
  if (v == null) return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

async function main() {
  const token = (process.env.PYA_SOAP_TOKEN ?? process.env.SAG_TEST_TOKEN ?? "").trim();
  const database = (process.env.PYA_SAG_BD ?? "").trim() || undefined;
  const endpoint = process.env.PYA_SOAP_ENDPOINT?.trim() ??
    "http://wssagpya.azurewebsites.net/ServiceSagWeb.svc/soap";

  if (!token) {
    console.error(R("ERROR: PYA_SOAP_TOKEN or SAG_TEST_TOKEN required."));
    process.exit(1);
  }

  const config: PyaApiConfig = { token, endpointUrl: endpoint, database };

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter } as any);
  const db = prisma as any;

  console.log("");
  console.log(B("═══════════════════════════════════════════════════════════════════"));
  console.log(B("  COMERCIAL-INVENTARIO-MASTER-DATA-COMPLETION-01"));
  console.log(B("  Fase 3 + Fase 4 + Fase 5: Auditoría SAG → Agentik"));
  console.log(B("═══════════════════════════════════════════════════════════════════"));
  console.log("");
  console.log(`  Endpoint: ${D(endpoint)}`);
  console.log(`  Database: ${D(database ?? "(env default)")}`);
  console.log(`  Token:    ${D("[SET]")}`);
  console.log("");

  // ═══════════════════════════════════════════════════════════════════════════
  // FASE 4: Fetch all master lookup tables
  // ═══════════════════════════════════════════════════════════════════════════

  console.log(B("─── FASE 4: MASTER LOOKUPS ─────────────────────────────────────"));
  console.log("");

  const lookupMaps: Record<string, Map<number, SagLookupNormalized>> = {};

  for (const cfg of LOOKUP_TABLE_CONFIGS) {
    try {
      const rows = await consultaSagJson(config, `SELECT * FROM ${cfg.tableName}`);
      const { normalized, errors } = normalizeLookupRows(rows, cfg);

      const map = new Map<number, SagLookupNormalized>();
      for (const entry of normalized) {
        map.set(entry.sagId, entry);
      }
      lookupMaps[cfg.kind] = map;

      console.log(`  ${cfg.tableName.padEnd(12)} ${G(String(normalized.length).padStart(4))} rows  ${errors > 0 ? R(`${errors} errors`) : ""}`);
    } catch (e) {
      console.log(`  ${cfg.tableName.padEnd(12)} ${R("FAILED")}: ${(e as Error).message.slice(0, 80)}`);
      lookupMaps[cfg.kind] = new Map();
    }
  }

  const groupMap = lookupMaps["product_group"] ?? new Map();
  const subgroupMap = lookupMaps["product_subgroup"] ?? new Map();
  const lineMap = lookupMaps["product_line"] ?? new Map();

  // Print grupo lookup sample
  console.log("");
  console.log(B("  GRUPOS sample:"));
  let gCount = 0;
  for (const [id, g] of groupMap) {
    if (gCount++ >= 10) break;
    console.log(`    ${String(id).padStart(4)} → ${g.name}`);
  }
  console.log("");
  console.log(B("  LINEAS:"));
  for (const [id, l] of lineMap) {
    console.log(`    ${String(id).padStart(4)} → ${l.name}`);
  }
  console.log("");

  // ═══════════════════════════════════════════════════════════════════════════
  // FASE 3: Fetch ARTICULOS from SAG directly
  // ═══════════════════════════════════════════════════════════════════════════

  console.log(B("─── FASE 3: SAG ARTICULOS (FULL FETCH) ─────────────────────────"));
  console.log("");

  const rawArticles = await consultaSagJson(config, "SELECT * FROM ARTICULOS");
  console.log(`  Total ARTICULOS from SAG: ${B(String(rawArticles.length))}`);

  // Show raw field names from first row
  if (rawArticles.length > 0) {
    const firstRow = rawArticles[0] as Record<string, unknown>;
    const fieldNames = Object.keys(firstRow);
    console.log(`  Fields (${fieldNames.length}): ${D(fieldNames.join(", "))}`);
  }
  console.log("");

  // Normalize
  const { normalized: allArticles, errors: normErrors } = normalizeArticles(
    rawArticles as any[],
  );
  console.log(`  Normalized: ${G(String(allArticles.length))}  Errors: ${normErrors.length > 0 ? R(String(normErrors.length)) : G("0")}`);
  console.log("");

  // ── Select 30+ diverse sample ──────────────────────────────────────────
  // Classification: use linea FK to determine CS vs LT vs Import

  const csRefs: typeof allArticles = [];
  const ltRefs: typeof allArticles = [];
  const importRefs: typeof allArticles = [];
  const otherRefs: typeof allArticles = [];
  let mandatoryRef: (typeof allArticles)[0] | null = null;

  for (const art of allArticles) {
    if (art.codigo === MANDATORY_REF) {
      mandatoryRef = art;
    }
    const lineEntry = lineMap.get(num(art.linea));
    const lineName = lineEntry?.name?.toUpperCase() ?? "";
    // Also check the codigo prefix as secondary signal
    const prefix = art.codigo.charAt(0);

    if (art.linea === "2" || lineName.includes("CASTILLITOS") || prefix === "C") {
      csRefs.push(art);
    } else if (art.linea === "1" || lineName.includes("LATIN") || lineName.includes("LENCERIA") || prefix === "L") {
      ltRefs.push(art);
    } else if (art.linea === "5" || art.linea === "3" || prefix === "I" || prefix === "B") {
      importRefs.push(art);
    } else {
      otherRefs.push(art);
    }
  }

  console.log(B("  DISTRIBUTION BY LINE:"));
  console.log(`    CS (Castillitos):  ${B(String(csRefs.length))}`);
  console.log(`    LT (Latin Kids):   ${B(String(ltRefs.length))}`);
  console.log(`    Import/Acc/Other:  ${B(String(importRefs.length + otherRefs.length))}`);
  console.log(`    ${MANDATORY_REF}:    ${mandatoryRef ? G("FOUND") : R("NOT FOUND")}`);
  console.log("");

  // Pick diverse sample: 10 CS, 10 LT, 10 Import/Other, + mandatory
  function pickDiverse(pool: typeof allArticles, count: number): typeof allArticles {
    if (pool.length <= count) return [...pool];
    // Pick evenly spaced items for diversity
    const step = Math.floor(pool.length / count);
    const result: typeof allArticles = [];
    for (let i = 0; i < count; i++) {
      result.push(pool[i * step]);
    }
    return result;
  }

  const sample = [
    ...pickDiverse(csRefs, 10),
    ...pickDiverse(ltRefs, 10),
    ...pickDiverse([...importRefs, ...otherRefs], 10),
  ];

  // Ensure mandatory ref is included
  if (mandatoryRef && !sample.find(a => a.codigo === MANDATORY_REF)) {
    sample.push(mandatoryRef);
  }

  // Deduplicate by codigo
  const sampleMap = new Map<string, (typeof allArticles)[0]>();
  for (const art of sample) {
    sampleMap.set(art.codigo, art);
  }
  const sampleRefs = [...sampleMap.values()];

  console.log(`  Sample size: ${B(String(sampleRefs.length))} references`);
  console.log("");

  // ═══════════════════════════════════════════════════════════════════════════
  // FASE 3 detail: For each sample ref, show what SAG delivers
  // ═══════════════════════════════════════════════════════════════════════════

  console.log(B("─── FASE 3: SAG RAW DATA PER REFERENCE ─────────────────────────"));
  console.log("");

  // Also fetch v_articulos for handling unit + PV3/PV4
  let vArticulosMap = new Map<string, Record<string, unknown>>();
  try {
    const vRows = await consultaSagJson(config, "SELECT k_sc_codigo_articulo, sc_unidad, n_valor_venta_promocion, nd_valor_venta4 FROM v_articulos");
    for (const vr of vRows) {
      const row = vr as Record<string, unknown>;
      const code = str(row.k_sc_codigo_articulo).toUpperCase();
      if (code) vArticulosMap.set(code, row);
    }
    console.log(`  v_articulos loaded: ${G(String(vArticulosMap.size))} rows`);
  } catch (e) {
    console.log(`  v_articulos: ${R("FAILED")} — ${(e as Error).message.slice(0, 80)}`);
  }
  console.log("");

  // Print SAG data for each sample ref
  for (const art of sampleRefs.slice(0, 5)) {
    const grupoEntry = groupMap.get(num(art.grupo));
    const subgrupoEntry = subgroupMap.get(num(art.subGrupo));
    const lineaEntry = lineMap.get(num(art.linea));
    const vRow = vArticulosMap.get(art.codigo);
    const isMandatory = art.codigo === MANDATORY_REF;

    console.log(`  ${isMandatory ? Y("★") : "·"} ${B(art.codigo)} — ${art.descripcion}`);
    console.log(`    grupo:       ${art.grupo.padEnd(5)} → ${grupoEntry ? G(grupoEntry.name) : R("NO LOOKUP")}`);
    console.log(`    subgrupo:    ${art.subGrupo.padEnd(5)} → ${subgrupoEntry ? G(subgrupoEntry.name) : Y("NO LOOKUP")}`);
    console.log(`    linea:       ${art.linea.padEnd(5)} → ${lineaEntry ? G(lineaEntry.name) : Y("NO LOOKUP")}`);
    console.log(`    precio:      ${String(art.precio).padEnd(10)} costo: ${art.costo}`);
    console.log(`    talla/color: ${art.manejaTallaColor ? G("SÍ") : D("NO")}   activo: ${art.activo ? G("SÍ") : R("NO")}   bloqueado: ${art.bloqueado ? R("SÍ") : G("NO")}`);
    console.log(`    fechaMod:    ${art.fechaModificacion ?? D("null")}`);
    console.log(`    handling:    ${vRow ? G(str(vRow.sc_unidad) || "—") : Y("no v_articulos row")}`);
    console.log(`    PV3:         ${vRow ? str(vRow.n_valor_venta_promocion) || "—" : "—"}  PV4: ${vRow ? str(vRow.nd_valor_venta4) || "—" : "—"}`);
    console.log("");
  }

  if (sampleRefs.length > 5) {
    console.log(D(`  ... (${sampleRefs.length - 5} more refs in comparison below)`));
    console.log("");
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // FASE 5: Compare SAG vs Agentik (ProductEntity + CCS)
  // ═══════════════════════════════════════════════════════════════════════════

  console.log(B("─── FASE 5: SAG vs AGENTIK COMPARISON ──────────────────────────"));
  console.log("");

  // Load ProductEntity for sample refs
  const sampleCodes = sampleRefs.map(a => a.codigo);
  const productEntities = await db.productEntity.findMany({
    where: {
      organizationId: ORG,
      sku: { in: sampleCodes },
    },
    select: {
      id: true, sku: true, name: true, category: true, productLine: true,
      price: true, subgrupoId: true, subgrupoSag: true, handlingUnit: true,
      description: true, externalSource: true, externalId: true,
      commercialStatus: true, status: true,
    },
  });

  const peMap = new Map<string, any>();
  for (const pe of productEntities) {
    peMap.set(pe.sku, pe);
  }

  // Load CCS for sample refs
  const ccsRows = await db.commercialCoverageSnapshot.findMany({
    where: {
      organizationId: ORG,
      refCode: { in: sampleCodes },
    },
    orderBy: { snapshotAt: "desc" as const },
    distinct: ["refCode"],
    select: {
      refCode: true, description: true, line: true, disponible: true,
      subgrupoId: true, subgrupoSag: true, pendingOrdersQty: true,
      physicalQty: true, snapshotAt: true,
    },
  });

  const ccsMap = new Map<string, any>();
  for (const row of ccsRows) {
    ccsMap.set(row.refCode, row);
  }

  console.log(`  ProductEntity matches: ${B(String(peMap.size))} / ${sampleCodes.length}`);
  console.log(`  CCS matches:          ${B(String(ccsMap.size))} / ${sampleCodes.length}`);
  console.log("");

  // ── Field-by-field comparison table ────────────────────────────────────

  interface ComparisonRow {
    ref: string;
    field: string;
    sagValue: string;
    agentikValue: string;
    match: boolean;
    dataLoss: boolean;
    notes: string;
  }

  const comparisons: ComparisonRow[] = [];
  let totalFields = 0;
  let matchCount = 0;
  let lossCount = 0;
  const missingInAgentik: string[] = [];

  for (const art of sampleRefs) {
    const pe = peMap.get(art.codigo);
    const ccs = ccsMap.get(art.codigo);
    const grupoEntry = groupMap.get(num(art.grupo));
    const subgrupoEntry = subgroupMap.get(num(art.subGrupo));
    const lineaEntry = lineMap.get(num(art.linea));
    const vRow = vArticulosMap.get(art.codigo);

    if (!pe) {
      missingInAgentik.push(art.codigo);
      continue;
    }

    // Compare each field
    function compare(field: string, sagVal: string, agentikVal: string, notes = "") {
      totalFields++;
      const match = sagVal === agentikVal || (sagVal && agentikVal && sagVal.toLowerCase() === agentikVal.toLowerCase());
      const dataLoss = !!sagVal && !agentikVal;
      if (match) matchCount++;
      if (dataLoss) lossCount++;
      comparisons.push({ ref: art.codigo, field, sagValue: sagVal, agentikValue: agentikVal, match: !!match, dataLoss, notes });
    }

    compare("name", art.descripcion, pe.name ?? "");
    compare("sku", art.codigo, pe.sku ?? "");
    compare("grupoId", art.grupo, "", "NOT IN SCHEMA — category stores FK as string");
    compare("grupoSag", grupoEntry?.name ?? "", "", "NEVER RESOLVED — grupo name not persisted");
    compare("category (stores grupo FK)", art.grupo, pe.category ?? "", "Stores numeric FK, not group name");
    compare("subgrupoId", art.subGrupo, pe.subgrupoId != null ? String(pe.subgrupoId) : "");
    compare("subgrupoSag", subgrupoEntry?.name ?? "", pe.subgrupoSag ?? "");
    compare("lineaId", art.linea, "", "NOT IN SCHEMA — productLine stores FK as string");
    compare("lineaSag", lineaEntry?.name ?? "", "", "NEVER RESOLVED — line name not persisted");
    compare("productLine (stores linea FK)", art.linea, pe.productLine ?? "", "Stores numeric FK, not line name");
    compare("price", String(art.precio), pe.price != null ? String(pe.price) : "");
    compare("costo", String(art.costo), "", "NOT PERSISTED to ProductEntity");
    compare("manejaTallaColor", art.manejaTallaColor ? "S" : "N", "", "NOT PERSISTED to ProductEntity");
    compare("fechaModificacion", art.fechaModificacion ?? "", "", "NOT PERSISTED to ProductEntity");
    compare("handlingUnit", vRow ? str(vRow.sc_unidad) : "", pe.handlingUnit ?? "");
  }

  // Print comparison summary
  console.log(B("  FIELD COMPARISON SUMMARY:"));
  console.log(`    Total fields compared: ${B(String(totalFields))}`);
  console.log(`    Matching:              ${G(String(matchCount))}`);
  console.log(`    Data loss:             ${lossCount > 0 ? R(String(lossCount)) : G("0")}`);
  console.log(`    Missing from Agentik:  ${missingInAgentik.length > 0 ? R(String(missingInAgentik.length)) : G("0")} refs`);
  console.log("");

  if (missingInAgentik.length > 0) {
    console.log(R("  MISSING FROM ProductEntity:"));
    for (const ref of missingInAgentik.slice(0, 10)) {
      console.log(`    ${ref}`);
    }
    console.log("");
  }

  // Print data loss detail
  const losses = comparisons.filter(c => c.dataLoss || c.notes.includes("NOT "));
  if (losses.length > 0) {
    console.log(B("  DATA LOSS DETAIL (SAG has value, Agentik does not):"));
    console.log(`  ${"REF".padEnd(16)} ${"FIELD".padEnd(35)} ${"SAG VALUE".padEnd(25)} NOTES`);
    console.log(`  ${"─".repeat(16)} ${"─".repeat(35)} ${"─".repeat(25)} ${"─".repeat(30)}`);

    // Group by field to show pattern, not noise
    const lossByField = new Map<string, { count: number; examples: ComparisonRow[] }>();
    for (const l of losses) {
      const existing = lossByField.get(l.field);
      if (existing) {
        existing.count++;
        if (existing.examples.length < 3) existing.examples.push(l);
      } else {
        lossByField.set(l.field, { count: 1, examples: [l] });
      }
    }

    for (const [field, data] of lossByField) {
      console.log("");
      console.log(`  ${Y(field)} — ${R(`${data.count} refs affected`)}`);
      for (const ex of data.examples) {
        console.log(`    ${ex.ref.padEnd(16)} SAG: ${(ex.sagValue || "—").padEnd(20)} Agentik: ${ex.agentikValue || R("EMPTY")}  ${D(ex.notes)}`);
      }
    }
    console.log("");
  }

  // ── Mandatory ref deep dive ────────────────────────────────────────────

  if (mandatoryRef) {
    console.log(B("─── MANDATORY REF DEEP DIVE: " + MANDATORY_REF + " ──────────────────"));
    console.log("");

    const pe = peMap.get(MANDATORY_REF);
    const ccs = ccsMap.get(MANDATORY_REF);
    const grupoEntry = groupMap.get(num(mandatoryRef.grupo));
    const subgrupoEntry = subgroupMap.get(num(mandatoryRef.subGrupo));
    const lineaEntry = lineMap.get(num(mandatoryRef.linea));
    const vRow = vArticulosMap.get(MANDATORY_REF);

    console.log(B("  SAG SOURCE:"));
    console.log(`    codigo:          ${G(mandatoryRef.codigo)}`);
    console.log(`    descripcion:     ${mandatoryRef.descripcion}`);
    console.log(`    grupo FK:        ${mandatoryRef.grupo} → ${grupoEntry ? G(grupoEntry.name) : R("UNRESOLVED")}`);
    console.log(`    subgrupo FK:     ${mandatoryRef.subGrupo} → ${subgrupoEntry ? G(subgrupoEntry.name) : Y("UNRESOLVED")}`);
    console.log(`    linea FK:        ${mandatoryRef.linea} → ${lineaEntry ? G(lineaEntry.name) : Y("UNRESOLVED")}`);
    console.log(`    precio:          ${mandatoryRef.precio}`);
    console.log(`    costo:           ${mandatoryRef.costo}`);
    console.log(`    talla/color:     ${mandatoryRef.manejaTallaColor ? G("SÍ") : "NO"}`);
    console.log(`    activo:          ${mandatoryRef.activo ? G("SÍ") : R("NO")}`);
    console.log(`    bloqueado:       ${mandatoryRef.bloqueado ? R("SÍ") : G("NO")}`);
    console.log(`    fechaMod:        ${mandatoryRef.fechaModificacion ?? "null"}`);
    console.log(`    handlingUnit:    ${vRow ? str(vRow.sc_unidad) || "—" : Y("no v_articulos row")}`);
    console.log("");

    if (pe) {
      console.log(B("  AGENTIK ProductEntity:"));
      console.log(`    sku:             ${pe.sku}`);
      console.log(`    name:            ${pe.name}`);
      console.log(`    category:        ${pe.category ?? R("null")}  ${pe.category ? Y("← This is the numeric FK, not the group name!") : ""}`);
      console.log(`    productLine:     ${pe.productLine ?? "null"}`);
      console.log(`    price:           ${pe.price}`);
      console.log(`    subgrupoId:      ${pe.subgrupoId ?? "null"}`);
      console.log(`    subgrupoSag:     ${pe.subgrupoSag ?? "null"}`);
      console.log(`    handlingUnit:    ${pe.handlingUnit ?? "null"}`);
      console.log(`    status:          ${pe.commercialStatus}`);
      console.log("");

      // Highlight the bug
      if (pe.category && grupoEntry) {
        console.log(Y("  ⚠ BUG CONFIRMED:"));
        console.log(Y(`    category = "${pe.category}" (numeric FK)`));
        console.log(Y(`    Should be = "${grupoEntry.name}" (resolved group name)`));
        console.log(Y(`    Or better: grupoId = ${mandatoryRef.grupo}, grupoSag = "${grupoEntry.name}"`));
      }
    } else {
      console.log(R("  NOT FOUND IN ProductEntity!"));
    }

    if (ccs) {
      console.log("");
      console.log(B("  AGENTIK CCS:"));
      console.log(`    line:            ${ccs.line}`);
      console.log(`    disponible:      ${ccs.disponible}`);
      console.log(`    subgrupoId:      ${ccs.subgrupoId ?? "null"}`);
      console.log(`    subgrupoSag:     ${ccs.subgrupoSag ?? "null"}`);
      console.log(`    snapshotAt:      ${ccs.snapshotAt?.toISOString() ?? "null"}`);
    } else {
      console.log(Y("  NOT FOUND IN CommercialCoverageSnapshot"));
    }
    console.log("");
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // FASE 4 continued: Field availability matrix
  // ═══════════════════════════════════════════════════════════════════════════

  console.log(B("─── FASE 4: FIELD AVAILABILITY MATRIX ──────────────────────────"));
  console.log("");

  // Analyze what percentage of articles have each critical field populated
  interface FieldStat { total: number; populated: number; nullCount: number; examples: string[] }
  const fieldStats: Record<string, FieldStat> = {};

  function trackField(name: string, value: unknown, codigo: string) {
    if (!fieldStats[name]) fieldStats[name] = { total: 0, populated: 0, nullCount: 0, examples: [] };
    const fs = fieldStats[name];
    fs.total++;
    if (value != null && String(value).trim() !== "" && String(value).trim() !== "0") {
      fs.populated++;
      if (fs.examples.length < 2) fs.examples.push(`${codigo}=${String(value).slice(0, 20)}`);
    } else {
      fs.nullCount++;
    }
  }

  for (const art of allArticles) {
    const vRow = vArticulosMap.get(art.codigo);
    trackField("codigo", art.codigo, art.codigo);
    trackField("descripcion", art.descripcion, art.codigo);
    trackField("grupo (FK)", art.grupo, art.codigo);
    trackField("subGrupo (FK)", art.subGrupo, art.codigo);
    trackField("linea (FK)", art.linea, art.codigo);
    trackField("precio", art.precio, art.codigo);
    trackField("costo", art.costo, art.codigo);
    trackField("manejaTallaColor", art.manejaTallaColor ? "S" : "", art.codigo);
    trackField("fechaModificacion", art.fechaModificacion, art.codigo);
    trackField("handlingUnit (v_articulos)", vRow ? str(vRow.sc_unidad) : "", art.codigo);
  }

  console.log(`  ${"FIELD".padEnd(30)} ${"TOTAL".padStart(6)} ${"WITH DATA".padStart(10)} ${"COVERAGE".padStart(10)} EXAMPLES`);
  console.log(`  ${"─".repeat(30)} ${"─".repeat(6)} ${"─".repeat(10)} ${"─".repeat(10)} ${"─".repeat(30)}`);

  for (const [field, stat] of Object.entries(fieldStats)) {
    const pct = stat.total > 0 ? Math.round((stat.populated / stat.total) * 100) : 0;
    const pctStr = pct === 100 ? G(`${pct}%`) : pct >= 80 ? Y(`${pct}%`) : R(`${pct}%`);
    console.log(`  ${field.padEnd(30)} ${String(stat.total).padStart(6)} ${String(stat.populated).padStart(10)} ${pctStr.padStart(18)} ${D(stat.examples.join(", "))}`);
  }
  console.log("");

  // ── talla/color distribution ───────────────────────────────────────────

  const tallaColorRefs = allArticles.filter(a => a.manejaTallaColor);
  console.log(B("  MANEJA_TALLA_COLOR distribution:"));
  console.log(`    Total refs with talla/color:  ${B(String(tallaColorRefs.length))} / ${allArticles.length} (${Math.round((tallaColorRefs.length / allArticles.length) * 100)}%)`);

  // By line
  const tallaByLine = new Map<string, number>();
  for (const art of tallaColorRefs) {
    const key = art.linea || "?";
    tallaByLine.set(key, (tallaByLine.get(key) ?? 0) + 1);
  }
  for (const [line, count] of tallaByLine) {
    const lineEntry = lineMap.get(num(line));
    console.log(`      Line ${line} (${lineEntry?.name ?? "?"}): ${count}`);
  }
  console.log("");

  // ═══════════════════════════════════════════════════════════════════════════
  // RESUMEN FINAL — Gaps to close
  // ═══════════════════════════════════════════════════════════════════════════

  console.log(B("═══════════════════════════════════════════════════════════════════"));
  console.log(B("  RESUMEN: GAPS TO CLOSE"));
  console.log(B("═══════════════════════════════════════════════════════════════════"));
  console.log("");

  const gaps = [
    { field: "grupoId / grupoSag", severity: "CRITICAL", status: "MISSING FROM SCHEMA", fix: "Add grupoId (Int?) + grupoSag (String?) to ProductEntity; resolve via GRUPOS lookup" },
    { field: "lineaId / lineaSag", severity: "MEDIUM", status: "MISSING FROM SCHEMA", fix: "Add lineaId (Int?) + lineaSag (String?) to ProductEntity; resolve via LINEAS lookup" },
    { field: "costo", severity: "MEDIUM", status: "NOT PERSISTED", fix: "Add costo (Float?) to ProductEntity; persist from normalizer" },
    { field: "manejaTallaColor", severity: "HIGH", status: "NOT PERSISTED", fix: "Add manejaTallaColor (Boolean) to ProductEntity; needed to know which refs SHOULD have variants" },
    { field: "fechaModificacion", severity: "HIGH", status: "NOT PERSISTED", fix: "Add lastModifiedSag (DateTime?) to ProductEntity" },
    { field: "variants (talla/color)", severity: "CRITICAL", status: "dryRun ONLY", fix: "Enable syncSagVariants() to write ProductVariant + ProductVariantAttribute" },
    { field: "description2", severity: "LOW", status: "NOT PERSISTED", fix: "Add description2 (String?) — ss_detalle_artic2" },
    { field: "article sync cron", severity: "HIGH", status: "NO CRON EXISTS", fix: "Add daily cron for catalog sync (currently manual-only)" },
  ];

  for (const gap of gaps) {
    const sev = gap.severity === "CRITICAL" ? R(gap.severity) : gap.severity === "HIGH" ? Y(gap.severity) : D(gap.severity);
    console.log(`  ${sev.padEnd(20)} ${gap.field.padEnd(25)} ${gap.status}`);
    console.log(`  ${"".padEnd(20)} ${D(gap.fix)}`);
    console.log("");
  }

  console.log(B("═══════════════════════════════════════════════════════════════════"));
  console.log(B("  AUDIT COMPLETE — Fase 3 + 4 + 5 done"));
  console.log(B("═══════════════════════════════════════════════════════════════════"));
  console.log("");

  await prisma.$disconnect();
  pool.end();
}

main().catch(e => {
  console.error(`FATAL: ${(e as Error).message}`);
  console.error((e as Error).stack);
  process.exit(1);
});
