/**
 * _backfill-master-data-dryrun.ts
 *
 * COMERCIAL-INVENTARIO-MASTER-DATA-COMPLETION-01 — Fase 7 Dry Run
 *
 * Fetches all ARTICULOS from SAG, normalizes, resolves lookups,
 * compares against existing ProductEntity rows, and reports
 * exactly what would change without writing anything.
 *
 * Usage:
 *   npx dotenv-cli -e .env -- npx tsx scripts/_backfill-master-data-dryrun.ts
 */

import { consultaSagJson } from "@/lib/connectors/pya/client";
import { normalizeArticles } from "@/lib/connectors/adapters/sag-pya-soap/catalog/sag-articles-normalizer";
import { LOOKUP_TABLE_CONFIGS, normalizeLookupRows } from "@/lib/connectors/adapters/sag-pya-soap/catalog/sag-master-lookups-normalizer";
import { isCommercialArticle } from "@/lib/comercial/catalog/is-commercial-article";
import type { PyaApiConfig } from "@/lib/connectors/pya/types";
import type { SagLookupNormalized } from "@/lib/connectors/adapters/sag-pya-soap/catalog/sag-master-lookups-types";
import type { SagArticleNormalized } from "@/lib/connectors/adapters/sag-pya-soap/catalog/sag-articles-types";
import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";

const B = (s: string) => `\x1b[1m${s}\x1b[0m`;
const G = (s: string) => `\x1b[32m${s}\x1b[0m`;
const R = (s: string) => `\x1b[31m${s}\x1b[0m`;
const Y = (s: string) => `\x1b[33m${s}\x1b[0m`;
const D = (s: string) => `\x1b[2m${s}\x1b[0m`;

const ORG = "cmmpwstuf000dp5y58kj1daaj";

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
    console.error(R("ERROR: PYA_SOAP_TOKEN required."));
    process.exit(1);
  }

  const config: PyaApiConfig = { token, endpointUrl: endpoint, database };

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter } as any);
  const db = prisma as any;

  console.log("");
  console.log(B("═══════════════════════════════════════════════════════════════════"));
  console.log(B("  FASE 7 — DRY RUN: Master Data Backfill"));
  console.log(B("═══════════════════════════════════════════════════════════════════"));
  console.log("");

  // ── 1. Fetch master lookups ────────────────────────────────────────────
  console.log(B("  Paso 1: Fetching master lookups..."));
  const lookupMaps: Record<string, Map<number, SagLookupNormalized>> = {};
  for (const cfg of LOOKUP_TABLE_CONFIGS) {
    try {
      const rows = await consultaSagJson(config, `SELECT * FROM ${cfg.tableName}`);
      const { normalized } = normalizeLookupRows(rows, cfg);
      const map = new Map<number, SagLookupNormalized>();
      for (const entry of normalized) map.set(entry.sagId, entry);
      lookupMaps[cfg.kind] = map;
      console.log(`    ${cfg.tableName.padEnd(12)} ${G(String(normalized.length))} rows`);
    } catch (e) {
      console.log(`    ${cfg.tableName.padEnd(12)} ${R("FAILED")}`);
      lookupMaps[cfg.kind] = new Map();
    }
  }
  const groupMap = lookupMaps["product_group"] ?? new Map();
  const lineMap = lookupMaps["product_line"] ?? new Map();
  const subgroupMap = lookupMaps["product_subgroup"] ?? new Map();
  console.log("");

  // ── 2. Fetch ARTICULOS from SAG ────────────────────────────────────────
  console.log(B("  Paso 2: Fetching ARTICULOS from SAG..."));
  const rawArticles = await consultaSagJson(config, "SELECT * FROM ARTICULOS");
  const { normalized: allArticles, errors: normErrors } = normalizeArticles(rawArticles as any[]);
  console.log(`    Total SAG: ${B(String(rawArticles.length))}  Normalized: ${G(String(allArticles.length))}  Errors: ${normErrors.length}`);

  // ── 3. Apply commercial filter ─────────────────────────────────────────
  const commercial = allArticles.filter(isCommercialArticle);
  const excluded = allArticles.length - commercial.length;
  console.log(`    Commercial: ${G(String(commercial.length))}  Excluded: ${D(String(excluded))}`);
  console.log("");

  // ── 4. Load existing ProductEntity rows ────────────────────────────────
  console.log(B("  Paso 3: Loading existing ProductEntity..."));
  const existingProducts = await db.productEntity.findMany({
    where: { organizationId: ORG, externalSource: "sag" },
    select: {
      id: true, sku: true, name: true, category: true, productLine: true,
      price: true, subgrupoId: true, subgrupoSag: true, handlingUnit: true,
      grupoId: true, grupoSag: true, lineaId: true, lineaSag: true,
      costo: true, manejaTallaColor: true, lastModifiedSag: true,
      createdAtSag: true, lastPurchaseSag: true, lastSaleSag: true,
      barcode: true, description2: true,
    },
  });

  const peMap = new Map<string, any>();
  for (const pe of existingProducts) {
    if (pe.sku) peMap.set(pe.sku, pe);
  }
  console.log(`    Existing ProductEntity (SAG): ${B(String(peMap.size))}`);
  console.log("");

  // ── 5. Simulate backfill — compute what would change ───────────────────
  console.log(B("  Paso 4: Simulating backfill..."));
  console.log("");

  let wouldCreate = 0;
  let wouldUpdate = 0;
  let wouldSkip = 0;

  // Field-level counters
  let newGrupoSag = 0;
  let newLineaSag = 0;
  let newCosto = 0;
  let newManejaTallaColor = 0;
  let newLastModifiedSag = 0;
  let newCreatedAtSag = 0;
  let newLastPurchaseSag = 0;
  let newLastSaleSag = 0;
  let newBarcode = 0;
  let newDescription2 = 0;
  let stillNullSubgrupo = 0;

  const errors: string[] = [];

  for (const art of commercial) {
    const grupoId = art.grupo ? parseInt(art.grupo, 10) || null : null;
    const grupoEntry = grupoId != null ? groupMap.get(grupoId) : null;
    const grupoSag = grupoEntry?.name ?? null;

    const subgrupoId = art.subGrupo ? parseInt(art.subGrupo, 10) || null : null;
    const subgrupoEntry = subgrupoId != null ? subgroupMap.get(subgrupoId) : null;
    const subgrupoSag = subgrupoEntry?.name ?? null;

    const lineaId = art.linea ? parseInt(art.linea, 10) || null : null;
    const lineaEntry = lineaId != null ? lineMap.get(lineaId) : null;
    const lineaSag = lineaEntry?.name ?? null;

    const lastModifiedSag = art.fechaModificacion ? new Date(art.fechaModificacion) : null;
    const createdAtSag = art.fechaCreacion ? new Date(art.fechaCreacion) : null;
    const lastPurchaseSag = art.ultimaCompra ? new Date(art.ultimaCompra) : null;
    const lastSaleSag = art.ultimaVenta ? new Date(art.ultimaVenta) : null;

    const pe = peMap.get(art.codigo);

    if (!pe) {
      wouldCreate++;
      // Count new field population for creates
      if (grupoSag) newGrupoSag++;
      if (lineaSag) newLineaSag++;
      if (art.costo) newCosto++;
      if (art.manejaTallaColor) newManejaTallaColor++;
      if (lastModifiedSag) newLastModifiedSag++;
      if (createdAtSag) newCreatedAtSag++;
      if (lastPurchaseSag) newLastPurchaseSag++;
      if (lastSaleSag) newLastSaleSag++;
      if (art.codigoBarras) newBarcode++;
      if (art.descripcion2) newDescription2++;
      if (!subgrupoId) stillNullSubgrupo++;
      continue;
    }

    // Check what would change
    let hasChange = false;

    // Core fields
    if (pe.name !== art.descripcion) hasChange = true;
    if (pe.price !== (art.precio || null)) hasChange = true;
    if (pe.category !== (art.grupo || null)) hasChange = true;
    if (pe.productLine !== (art.linea || null)) hasChange = true;
    if (pe.subgrupoId !== subgrupoId) hasChange = true;

    // New fields — any null → value is a change
    if (pe.grupoId !== grupoId) hasChange = true;
    if (pe.grupoSag !== (grupoSag || null)) hasChange = true;
    if (pe.lineaId !== lineaId) hasChange = true;
    if (pe.lineaSag !== (lineaSag || null)) hasChange = true;
    if (pe.costo !== (art.costo || null)) hasChange = true;
    if (pe.manejaTallaColor !== art.manejaTallaColor) hasChange = true;

    // Dates — compare carefully (existing is null, new may be a Date)
    const peLastMod = pe.lastModifiedSag ? pe.lastModifiedSag.getTime() : null;
    const newLastMod = lastModifiedSag ? lastModifiedSag.getTime() : null;
    if (peLastMod !== newLastMod) hasChange = true;

    const peCreated = pe.createdAtSag ? pe.createdAtSag.getTime() : null;
    const newCreated = createdAtSag ? createdAtSag.getTime() : null;
    if (peCreated !== newCreated) hasChange = true;

    const pePurchase = pe.lastPurchaseSag ? pe.lastPurchaseSag.getTime() : null;
    const newPurchase = lastPurchaseSag ? lastPurchaseSag.getTime() : null;
    if (pePurchase !== newPurchase) hasChange = true;

    const peSale = pe.lastSaleSag ? pe.lastSaleSag.getTime() : null;
    const newSale = lastSaleSag ? lastSaleSag.getTime() : null;
    if (peSale !== newSale) hasChange = true;

    if (pe.barcode !== (art.codigoBarras || null)) hasChange = true;
    if (pe.description2 !== (art.descripcion2 || null)) hasChange = true;

    if (!hasChange) {
      wouldSkip++;
    } else {
      wouldUpdate++;
      // Count field-level gains for updates
      if (!pe.grupoSag && grupoSag) newGrupoSag++;
      if (!pe.lineaSag && lineaSag) newLineaSag++;
      if (!pe.costo && art.costo) newCosto++;
      if (!pe.manejaTallaColor && art.manejaTallaColor) newManejaTallaColor++;
      if (!pe.lastModifiedSag && lastModifiedSag) newLastModifiedSag++;
      if (!pe.createdAtSag && createdAtSag) newCreatedAtSag++;
      if (!pe.lastPurchaseSag && lastPurchaseSag) newLastPurchaseSag++;
      if (!pe.lastSaleSag && lastSaleSag) newLastSaleSag++;
      if (!pe.barcode && art.codigoBarras) newBarcode++;
      if (!pe.description2 && art.descripcion2) newDescription2++;
    }

    if (!subgrupoId) stillNullSubgrupo++;
  }

  // ── 6. Report ──────────────────────────────────────────────────────────

  console.log(B("═══════════════════════════════════════════════════════════════════"));
  console.log(B("  DRY RUN RESULTS"));
  console.log(B("═══════════════════════════════════════════════════════════════════"));
  console.log("");

  console.log(B("  OPERACIONES:"));
  console.log(`    Would CREATE:  ${wouldCreate > 0 ? Y(String(wouldCreate)) : G("0")} new ProductEntity rows`);
  console.log(`    Would UPDATE:  ${wouldUpdate > 0 ? Y(String(wouldUpdate)) : G("0")} existing rows`);
  console.log(`    Would SKIP:    ${G(String(wouldSkip))} (no changes needed)`);
  console.log(`    TOTAL:         ${B(String(commercial.length))} commercial articles`);
  console.log("");

  console.log(B("  CAMPOS NUEVOS (ganancia por campo):"));
  console.log(`    grupoSag nuevo:        ${newGrupoSag > 0 ? G(String(newGrupoSag)) : Y("0")} refs`);
  console.log(`    lineaSag nueva:        ${newLineaSag > 0 ? G(String(newLineaSag)) : Y("0")} refs`);
  console.log(`    costo:                 ${newCosto > 0 ? G(String(newCosto)) : Y("0")} refs`);
  console.log(`    manejaTallaColor:      ${newManejaTallaColor > 0 ? G(String(newManejaTallaColor)) : Y("0")} refs`);
  console.log(`    lastModifiedSag:       ${newLastModifiedSag > 0 ? G(String(newLastModifiedSag)) : Y("0")} refs`);
  console.log(`    createdAtSag:          ${newCreatedAtSag > 0 ? G(String(newCreatedAtSag)) : Y("0")} refs`);
  console.log(`    lastPurchaseSag:       ${newLastPurchaseSag > 0 ? G(String(newLastPurchaseSag)) : Y("0")} refs`);
  console.log(`    lastSaleSag:           ${newLastSaleSag > 0 ? G(String(newLastSaleSag)) : Y("0")} refs`);
  console.log(`    barcode:               ${newBarcode > 0 ? G(String(newBarcode)) : Y("0")} refs`);
  console.log(`    description2:          ${newDescription2 > 0 ? G(String(newDescription2)) : Y("0")} refs`);
  console.log("");

  console.log(B("  GAPS RESTANTES:"));
  console.log(`    subgrupoId null:       ${stillNullSubgrupo > 0 ? Y(String(stillNullSubgrupo)) : G("0")} refs (SAG coverage: 32%)`);
  console.log("");

  if (errors.length > 0) {
    console.log(R("  ERRORS:"));
    for (const e of errors.slice(0, 10)) {
      console.log(`    ${e}`);
    }
    console.log("");
  }

  // ── Sample: 5 refs that would be UPDATED ───────────────────────────────

  console.log(B("  MUESTRA — 5 refs que serían ACTUALIZADOS:"));
  let sampleCount = 0;
  for (const art of commercial) {
    if (sampleCount >= 5) break;
    const pe = peMap.get(art.codigo);
    if (!pe) continue;

    const grupoId = art.grupo ? parseInt(art.grupo, 10) || null : null;
    const grupoEntry = grupoId != null ? groupMap.get(grupoId) : null;
    const lineaId = art.linea ? parseInt(art.linea, 10) || null : null;
    const lineaEntry = lineaId != null ? lineMap.get(lineaId) : null;

    // Only show if it would be updated
    if (!pe.grupoSag && grupoEntry?.name) {
      console.log(`    ${B(art.codigo)} — ${art.descripcion.slice(0, 40)}`);
      console.log(`      grupoSag:  ${R("null")} → ${G(grupoEntry.name)}`);
      console.log(`      lineaSag:  ${R("null")} → ${G(lineaEntry?.name ?? "null")}`);
      console.log(`      costo:     ${R("null")} → ${art.costo ? G(String(art.costo)) : Y("0")}`);
      console.log(`      talla/col: ${R("false")} → ${art.manejaTallaColor ? G("true") : "false"}`);
      console.log(`      fechaMod:  ${R("null")} → ${art.fechaModificacion ? G(art.fechaModificacion.slice(0, 10)) : Y("null")}`);
      console.log(`      barcode:   ${R("null")} → ${art.codigoBarras ? G(art.codigoBarras) : Y("null")}`);
      console.log("");
      sampleCount++;
    }
  }

  // ── Sample: 3 refs que serían CREADOS ──────────────────────────────────

  if (wouldCreate > 0) {
    console.log(B("  MUESTRA — 3 refs que serían CREADOS:"));
    let createSampleCount = 0;
    for (const art of commercial) {
      if (createSampleCount >= 3) break;
      if (peMap.has(art.codigo)) continue;
      console.log(`    ${Y(art.codigo)} — ${art.descripcion.slice(0, 50)}`);
      createSampleCount++;
    }
    console.log("");
  }

  console.log(B("═══════════════════════════════════════════════════════════════════"));
  console.log(B("  DRY RUN COMPLETE — No writes performed."));
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
