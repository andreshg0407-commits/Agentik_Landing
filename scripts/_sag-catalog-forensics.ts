/**
 * _sag-catalog-forensics.ts
 *
 * SAG-CATALOG-SYNC-01 Phase 8A — Forensic dry run.
 *
 * Fetches ARTICULOS from SAG SOAP, normalizes, and prints forensic report.
 * Does NOT write to ProductEntity.
 *
 * Usage:
 *   npx dotenv-cli -e .env -- npx tsx scripts/_sag-catalog-forensics.ts
 *
 * Modes (set via env):
 *   MODE=dryrun    (default) — fetch + normalize + report, no writes
 *   MODE=pilot     — import first 100 articles into ProductEntity
 *   LIMIT=N        — override row limit (default: 20 for dryrun, 100 for pilot)
 */

// These imports are safe — no server-only dependency
import { consultaSagJson } from "@/lib/connectors/pya/client";
import { QUERY_CATALOG }   from "@/lib/connectors/adapters/sag-pya-soap/query-catalog";
import { normalizeArticles } from "@/lib/connectors/adapters/sag-pya-soap/catalog/sag-articles-normalizer";
import type { PyaApiConfig } from "@/lib/connectors/pya/types";
import type { SagArticleRawRow } from "@/lib/connectors/adapters/sag-pya-soap/catalog/sag-articles-types";
// syncSagArticlesToProductEntity imported dynamically in pilot mode (needs server-only patch)

const B = (s: string) => `\x1b[1m${s}\x1b[0m`;
const G = (s: string) => `\x1b[32m${s}\x1b[0m`;
const R = (s: string) => `\x1b[31m${s}\x1b[0m`;
const Y = (s: string) => `\x1b[33m${s}\x1b[0m`;
const C = (s: string) => `\x1b[36m${s}\x1b[0m`;
const D = (s: string) => `\x1b[2m${s}\x1b[0m`;

const CASTILLITOS_ORG_ID = "cmmpwstuf000dp5y58kj1daaj";

async function main() {
  const mode  = (process.env.MODE ?? "dryrun").toLowerCase();
  const token = (process.env.PYA_SOAP_TOKEN ?? process.env.SAG_TEST_TOKEN ?? "").trim();
  const database = (process.env.PYA_SAG_BD ?? "").trim() || undefined;
  const endpoint = process.env.PYA_SOAP_ENDPOINT?.trim() ??
    "http://wssagpya.azurewebsites.net/ServiceSagWeb.svc/soap";

  if (!token) {
    console.error(R("ERROR: PYA_SOAP_TOKEN or SAG_TEST_TOKEN required."));
    process.exit(1);
  }

  const config: PyaApiConfig = { token, endpointUrl: endpoint, database };

  console.log("");
  console.log(B("═══════════════════════════════════════════════════════════════"));
  console.log(B("  SAG-CATALOG-SYNC-01 — FASE 8A: FORENSIC DRY RUN"));
  console.log(B("═══════════════════════════════════════════════════════════════"));
  console.log("");
  console.log(`  Mode:     ${C(mode)}`);
  console.log(`  Endpoint: ${D(endpoint)}`);
  console.log(`  Database: ${D(database ?? "(env default)")}`);
  console.log(`  Token:    ${D(token.slice(0, 6) + "..." + token.slice(-4))}`);
  console.log("");

  // ── FASE 8A: Fetch from SAG ───────────────────────────────────────────────

  console.log(B("── 1. FETCHING ARTICULOS FROM SAG ──────────────────────────────"));
  console.log(`  Query: ${C(QUERY_CATALOG.articles.all.query)}`);
  console.log("");

  const t0 = Date.now();
  let rawRows: SagArticleRawRow[];
  try {
    rawRows = await consultaSagJson(config, QUERY_CATALOG.articles.all.query) as SagArticleRawRow[];
  } catch (e) {
    console.error(R(`  SOAP ERROR: ${(e as Error).message}`));
    process.exit(1);
  }
  const fetchMs = Date.now() - t0;

  console.log(G(`  ✓ Received ${rawRows.length} rows in ${fetchMs}ms`));
  console.log("");

  // ── 2. Analyze raw field availability ─────────────────────────────────────

  console.log(B("── 2. RAW FIELD ANALYSIS ───────────────────────────────────────"));

  if (rawRows.length === 0) {
    console.log(R("  No rows returned. SAG ARTICULOS table may be empty or query rejected."));
    process.exit(0);
  }

  // Collect all keys present across all rows
  const allKeys = new Set<string>();
  const keyPresenceCount = new Map<string, number>();
  for (const row of rawRows) {
    for (const key of Object.keys(row)) {
      allKeys.add(key);
      keyPresenceCount.set(key, (keyPresenceCount.get(key) ?? 0) + 1);
    }
  }

  const total = rawRows.length;
  const sortedKeys = Array.from(allKeys).sort();

  console.log(`  Total unique fields: ${C(String(sortedKeys.length))}`);
  console.log("");
  console.log("  Field                          | Present   | Empty  | Sample");
  console.log("  ───────────────────────────────┼───────────┼────────┼──────────────────────");

  for (const key of sortedKeys) {
    const present = keyPresenceCount.get(key) ?? 0;
    let emptyCount = 0;
    let sampleVal = "";
    for (const row of rawRows) {
      const v = row[key];
      if (v == null || String(v).trim() === "") emptyCount++;
      else if (!sampleVal) sampleVal = String(v).slice(0, 30);
    }
    const pctPresent = ((present / total) * 100).toFixed(0).padStart(3);
    const pctEmpty   = ((emptyCount / total) * 100).toFixed(0).padStart(3);
    const keyPad     = key.padEnd(32);
    const color = emptyCount === total ? R : emptyCount > total * 0.5 ? Y : G;
    console.log(`  ${keyPad}| ${pctPresent}% (${String(present).padStart(5)}) | ${color(pctEmpty + "%")}    | ${D(sampleVal)}`);
  }
  console.log("");

  // ── 3. Expected fields check ──────────────────────────────────────────────

  console.log(B("── 3. EXPECTED FIELDS CHECK ────────────────────────────────────"));
  const expected = QUERY_CATALOG.articles.all.expectedFields;
  for (const f of expected) {
    const present = allKeys.has(f);
    const icon = present ? G("✓") : R("✗");
    const count = keyPresenceCount.get(f) ?? 0;
    console.log(`  ${icon} ${f.padEnd(25)} ${present ? `${count}/${total} rows` : "NOT FOUND"}`);
  }

  // Check for unexpected bonus fields
  const bonus = sortedKeys.filter(k => !expected.includes(k));
  if (bonus.length > 0) {
    console.log("");
    console.log(`  ${Y("+")} Bonus fields not in expectedFields: ${bonus.join(", ")}`);
  }
  console.log("");

  // ── 4. Normalize ──────────────────────────────────────────────────────────

  console.log(B("── 4. NORMALIZATION ────────────────────────────────────────────"));

  const { normalized, errors } = normalizeArticles(rawRows);

  console.log(`  Raw rows:       ${C(String(total))}`);
  console.log(`  Valid:           ${G(String(normalized.length))}`);
  console.log(`  Invalid:         ${errors.length > 0 ? R(String(errors.length)) : G("0")}`);
  console.log("");

  if (errors.length > 0) {
    console.log("  Validation errors:");
    for (const e of errors.slice(0, 10)) {
      console.log(`    row ${e.rowIndex}: ${R(e.reason)} (CODIGO: ${e.codigo ?? "—"})`);
    }
    console.log("");
  }

  // ── 5. First 10 normalized records ────────────────────────────────────────

  const limit = parseInt(process.env.LIMIT ?? (mode === "pilot" ? "100" : "20"), 10);
  const sample = normalized.slice(0, Math.min(10, limit));

  console.log(B("── 5. FIRST 10 NORMALIZED RECORDS ──────────────────────────────"));
  console.log("");

  for (let i = 0; i < sample.length; i++) {
    const art = sample[i];
    console.log(`  ${C(`[${i + 1}]`)} ${B(art.codigo)}`);
    console.log(`      Descripción:  ${art.descripcion}`);
    console.log(`      Grupo:        ${art.grupo || D("(vacío)")}`);
    console.log(`      Línea:        ${art.linea || D("(vacío)")}`);
    console.log(`      Marca:        ${art.marca || D("(vacío)")}`);
    console.log(`      Precio:       ${art.precio > 0 ? G(String(art.precio)) : Y("0")}`);
    console.log(`      Costo:        ${art.costo > 0 ? String(art.costo) : D("0")}`);
    console.log(`      Unidad:       ${art.unidad || D("(vacío)")}`);
    console.log(`      IVA:          ${art.iva ? "Sí" : "No"} (tarifa: ${art.tarifaIva}%)`);
    console.log(`      Activo:       ${art.activo ? G("Sí") : R("No")}`);
    console.log(`      Bloqueado:    ${art.bloqueado ? R("Sí") : G("No")}`);
    console.log(`      Kardex:       ${art.manejaKardex ? "Sí" : "No"}`);
    console.log(`      Talla/Color:  ${art.manejaTallaColor ? Y("Sí") : "No"}`);
    console.log(`      Lote:         ${art.manejaLote ? "Sí" : "No"}`);
    console.log(`      F.Modif:      ${art.fechaModificacion ?? D("(null)")}`);
    console.log("");
  }

  // ── 6. Uniqueness analysis ────────────────────────────────────────────────

  console.log(B("── 6. DATA QUALITY ANALYSIS ────────────────────────────────────"));

  const codigos = normalized.map(a => a.codigo);
  const uniqueCodigos = new Set(codigos);
  const duplicates = codigos.length - uniqueCodigos.size;

  console.log(`  Total normalized:    ${C(String(normalized.length))}`);
  console.log(`  Unique CODIGOs:      ${G(String(uniqueCodigos.size))}`);
  console.log(`  Duplicate CODIGOs:   ${duplicates > 0 ? R(String(duplicates)) : G("0")}`);

  // Active / blocked breakdown
  const active    = normalized.filter(a => a.activo && !a.bloqueado).length;
  const inactive  = normalized.filter(a => !a.activo).length;
  const blocked   = normalized.filter(a => a.bloqueado).length;
  console.log(`  Activos:             ${G(String(active))}`);
  console.log(`  Inactivos:           ${inactive > 0 ? Y(String(inactive)) : "0"}`);
  console.log(`  Bloqueados:          ${blocked > 0 ? R(String(blocked)) : "0"}`);

  // Talla/Color variants
  const withVariants = normalized.filter(a => a.manejaTallaColor).length;
  console.log(`  Con talla/color:     ${withVariants > 0 ? Y(String(withVariants)) : "0"}`);

  // Price distribution
  const withPrice = normalized.filter(a => a.precio > 0).length;
  const withCost  = normalized.filter(a => a.costo > 0).length;
  console.log(`  Con precio > 0:      ${withPrice}/${normalized.length}`);
  console.log(`  Con costo > 0:       ${withCost}/${normalized.length}`);

  // Lines / Groups
  const lines  = new Set(normalized.map(a => a.linea).filter(Boolean));
  const groups = new Set(normalized.map(a => a.grupo).filter(Boolean));
  const marcas = new Set(normalized.map(a => a.marca).filter(Boolean));
  console.log(`  Líneas distintas:    ${C(String(lines.size))} ${lines.size <= 10 ? D(`(${Array.from(lines).join(", ")})`) : ""}`);
  console.log(`  Grupos distintos:    ${C(String(groups.size))} ${groups.size <= 10 ? D(`(${Array.from(groups).join(", ")})`) : ""}`);
  console.log(`  Marcas distintas:    ${C(String(marcas.size))} ${marcas.size <= 10 ? D(`(${Array.from(marcas).join(", ")})`) : ""}`);
  console.log("");

  // ── 7. FASE 8B — Model compatibility check ───────────────────────────────

  console.log(B("── 7. FASE 8B: PRODUCTENTITY MODEL COMPATIBILITY ──────────────"));
  console.log("");

  const checks = [
    { field: "sku (CODIGO)",                supported: true,  notes: "ProductEntity.sku + externalId" },
    { field: "name (DESCRIPCION)",          supported: true,  notes: "ProductEntity.name" },
    { field: "category (GRUPO)",            supported: true,  notes: "ProductEntity.category" },
    { field: "productLine (LINEA)",         supported: true,  notes: "ProductEntity.productLine" },
    { field: "price (PRECIO)",              supported: true,  notes: "ProductEntity.price" },
    { field: "commercialStatus (ACTIVO)",   supported: true,  notes: "active/discontinued" },
    { field: "externalSource",              supported: true,  notes: '"sag" — idempotent upsert key' },
    { field: "externalId",                  supported: true,  notes: "CODIGO — idempotent upsert key" },
    { field: "description (metadata)",      supported: true,  notes: "Marca + Grupo + SubGrupo + Unidad composite" },
    { field: "MARCA",                       supported: false, notes: "No dedicated ProductEntity.marca field — stored in description" },
    { field: "COSTO",                       supported: false, notes: "No ProductEntity.cost field — not persisted" },
    { field: "TARIFA_IVA",                  supported: false, notes: "No dedicated IVA field — stored in description if needed" },
    { field: "MANEJA_TALLA_COLOR",          supported: false, notes: "ProductVariant model exists but not populated by this sync" },
    { field: "MANEJA_LOTE",                 supported: false, notes: "Not modeled in ProductEntity" },
  ];

  for (const c of checks) {
    const icon = c.supported ? G("✓") : Y("△");
    console.log(`  ${icon} ${c.field.padEnd(35)} ${D(c.notes)}`);
  }

  const gaps = checks.filter(c => !c.supported);
  console.log("");
  if (gaps.length > 0) {
    console.log(`  ${Y("△")} ${gaps.length} fields stored in description or not persisted — acceptable for V1.`);
    console.log(`     Future sprints can add dedicated columns (marca, cost, iva, variants).`);
  } else {
    console.log(G("  ✓ Full model compatibility."));
  }
  console.log("");

  // ── FASE 8C: Pilot import (if mode=pilot) ────────────────────────────────

  if (mode === "pilot") {
    console.log(B("═══════════════════════════════════════════════════════════════"));
    console.log(B("  FASE 8C: PILOT IMPORT (limit=" + limit + ")"));
    console.log(B("═══════════════════════════════════════════════════════════════"));
    console.log("");

    const orgId = process.env.ORG_ID ?? CASTILLITOS_ORG_ID;
    console.log(`  Org ID: ${C(orgId)}`);
    console.log("");

    const { syncSagArticlesToProductEntity } = await import(
      "@/lib/connectors/adapters/sag-pya-soap/catalog/sag-articles-sync"
    );
    const result = await syncSagArticlesToProductEntity(orgId, config, {
      dryRun: false,
      limit,
      activeOnly: false,
    });

    console.log(`  Status:     ${result.status === "success" ? G(result.status) : result.status === "error" ? R(result.status) : Y(result.status)}`);
    console.log(`  Total rows: ${result.totalRows}`);
    console.log(`  Valid:       ${result.validRows}`);
    console.log(`  Created:     ${G(String(result.created))}`);
    console.log(`  Updated:     ${Y(String(result.updated))}`);
    console.log(`  Skipped:     ${String(result.skipped)}`);
    console.log(`  Errors:      ${result.invalidRows > 0 ? R(String(result.invalidRows)) : "0"}`);
    console.log(`  Duration:    ${result.durationMs}ms`);
    console.log("");

    if (result.error) {
      console.log(R(`  Error: ${result.error}`));
    }

    if (result.validationErrors.length > 0) {
      console.log("  Validation errors:");
      for (const e of result.validationErrors.slice(0, 10)) {
        console.log(`    row ${e.rowIndex}: ${R(e.reason)}`);
      }
    }

    // Show first 20 inserted products
    if (result.created > 0 || result.updated > 0) {
      console.log("");
      console.log(B("── FIRST 20 PRODUCTS IN DB ─────────────────────────────────"));
      try {
        // Dynamic import to avoid server-only at top level
        const { PrismaClient } = await import("@prisma/client");
        const { Pool } = await import("pg");
        const { PrismaPg } = await import("@prisma/adapter-pg");
        const pool = new Pool({ connectionString: process.env.DATABASE_URL });
        const adapter = new PrismaPg(pool);
        const localPrisma = new PrismaClient({ adapter } as any);

        const products = await (localPrisma as any).productEntity.findMany({
          where: { organizationId: orgId, externalSource: "sag" },
          orderBy: { createdAt: "desc" },
          take: 20,
          select: {
            sku: true,
            name: true,
            category: true,
            productLine: true,
            price: true,
            commercialStatus: true,
            externalId: true,
          },
        });

        for (let i = 0; i < products.length; i++) {
          const p = products[i];
          console.log(`  ${C(`[${i + 1}]`)} ${B(p.sku ?? "—")} | ${p.name} | ${p.category ?? "—"} | ${p.productLine ?? "—"} | $${p.price ?? 0} | ${p.commercialStatus}`);
        }

        await localPrisma.$disconnect();
        pool.end();
      } catch (e) {
        console.log(Y(`  Could not read back products: ${(e as Error).message}`));
      }
    }

    console.log("");
  }

  console.log(B("═══════════════════════════════════════════════════════════════"));
  console.log(G("  FORENSIC ANALYSIS COMPLETE"));
  console.log(B("═══════════════════════════════════════════════════════════════"));
  console.log("");
}

main().catch(e => {
  console.error(R(`FATAL: ${(e as Error).message}`));
  process.exit(1);
});
