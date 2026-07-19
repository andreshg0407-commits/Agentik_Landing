/**
 * _diagnose-textil-derrotero-match.ts
 *
 * TEXTIL DERROTERO MATCHING DIAGNOSTIC
 *
 * Traces B48 (Néstor) textil refs through the full matching pipeline:
 * 1. SAG presence (F34 net_qty > 0)
 * 2. ProductEntity enrichment (brand, group, subgrupo)
 * 3. Derrotero catalog keys
 * 4. Match matrix
 *
 * Usage: npx tsx --env-file=.env scripts/_diagnose-textil-derrotero-match.ts
 */

import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";

const NESTOR_BODEGA_KA_NL = 48;

async function main() {
  const token = (process.env.PYA_SOAP_TOKEN ?? process.env.SAG_TEST_TOKEN ?? "").trim();
  const database = (process.env.PYA_SAG_BD ?? "").trim() || undefined;
  const endpointUrl = process.env.PYA_SOAP_ENDPOINT?.trim() ??
    "http://wssagpya.azurewebsites.net/ServiceSagWeb.svc/soap";
  if (!token) { console.error("FATAL: PYA_SOAP_TOKEN required"); process.exit(1); }
  const config = { token, endpointUrl, database };

  const { consultaSagJson } = await import("../lib/connectors/pya/client");

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter } as any);

  // ══════════════════════════════════════════════════════════════════════════
  // 1. FETCH B48 PRESENCE
  // ══════════════════════════════════════════════════════════════════════════
  console.log("\n=== 1. B48 PRESENCE (net_qty > 0) ===\n");
  const balanceQuery = `
SELECT ref, descr, net_qty, subgrupo_id FROM (
  SELECT
    v.k_sc_codigo_articulo AS ref,
    MAX(v.sc_detalle_articulo) AS descr,
    MAX(v.ka_ni_subgrupo) AS subgrupo_id,
    SUM(CASE WHEN mt.ka_nl_bodega_destino = ${NESTOR_BODEGA_KA_NL} THEN mt.nd_cantidad ELSE 0 END) -
    SUM(CASE WHEN mt.ka_nl_bodega_origen = ${NESTOR_BODEGA_KA_NL} THEN mt.nd_cantidad ELSE 0 END) AS net_qty
  FROM movimientos_traslados mt
  INNER JOIN MOVIMIENTOS m ON m.ka_nl_movimiento = mt.ka_nl_movimiento
  LEFT JOIN v_articulos v ON v.ka_nl_articulo = mt.ka_nl_articulo
  WHERE m.sc_anulado = 'N'
    AND (mt.ka_nl_bodega_destino = ${NESTOR_BODEGA_KA_NL} OR mt.ka_nl_bodega_origen = ${NESTOR_BODEGA_KA_NL})
  GROUP BY v.k_sc_codigo_articulo
) sub
WHERE net_qty > 0`.trim();

  const presenceRows = await consultaSagJson(config as any, balanceQuery);
  console.log(`Total B48 refs: ${presenceRows.length}`);

  // ══════════════════════════════════════════════════════════════════════════
  // 2. FETCH SAG SUBGRUPOS LOOKUP
  // ══════════════════════════════════════════════════════════════════════════
  console.log("\n=== 2. SAG SUBGRUPOS LOOKUP ===\n");
  let subgrupoLookup = new Map<number, string>();
  try {
    const sgRows = await consultaSagJson(config as any, "SELECT * FROM SUBGRUPOS");
    for (const r of sgRows) {
      const id = Number((r as any).ka_nl_subgrupo ?? (r as any).CODIGO);
      const name = String((r as any).sc_detalle_subgrupo ?? (r as any).DESCRIPCION ?? "").trim();
      if (id && name) subgrupoLookup.set(id, name);
    }
    console.log(`Subgrupos loaded: ${subgrupoLookup.size}`);
  } catch (e) {
    console.log(`Subgrupos fetch failed: ${(e as Error).message}`);
    // Try alternative
    try {
      const sgRows = await consultaSagJson(config as any, "SELECT * FROM SUBGRUPOS_ARTICULOS");
      for (const r of sgRows) {
        const id = Number((r as any).ka_nl_subgrupo ?? (r as any).CODIGO);
        const name = String((r as any).sc_detalle_subgrupo ?? (r as any).DESCRIPCION ?? "").trim();
        if (id && name) subgrupoLookup.set(id, name);
      }
      console.log(`Subgrupos loaded (alt table): ${subgrupoLookup.size}`);
    } catch (e2) {
      console.log(`Alt fetch also failed: ${(e2 as Error).message}`);
    }
  }

  // Also get v_articulos for sc_detalle_subgrupo (it has the resolved name)
  console.log("Fetching v_articulos for resolved subgrupo names...");
  const vArticulos = await consultaSagJson(config as any, "SELECT * FROM v_articulos");
  const vSubgrupoByCode = new Map<string, string>(); // code → sc_detalle_subgrupo
  const vGrupoByCode = new Map<string, string>();    // code → sc_detalle_grupo
  for (const r of vArticulos) {
    const code = String((r as any).k_sc_codigo_articulo ?? "").trim();
    const sg = String((r as any).sc_detalle_subgrupo ?? "").trim();
    const g = String((r as any).sc_detalle_grupo ?? "").trim();
    if (code) {
      if (sg) vSubgrupoByCode.set(code, sg);
      if (g) vGrupoByCode.set(code, g);
    }
  }
  console.log(`v_articulos subgrupo names: ${vSubgrupoByCode.size}`);

  // ══════════════════════════════════════════════════════════════════════════
  // 3. LOAD ProductEntity ENRICHMENT
  // ══════════════════════════════════════════════════════════════════════════
  console.log("\n=== 3. ProductEntity ENRICHMENT ===\n");

  const org = await prisma.organization.findFirst({
    where: { slug: "castillitos" },
    select: { id: true },
  });
  if (!org) { console.error("Org not found"); process.exit(1); }

  const products = await (prisma as any).productEntity.findMany({
    where: { organizationId: org.id },
    select: {
      sku: true,
      name: true,
      productLine: true,
      category: true,
      subgrupoId: true,
      subgrupoSag: true,
      handlingUnit: true,
    },
  });

  const productMap = new Map<string, any>();
  for (const p of products) {
    if (p.sku) productMap.set(p.sku, p);
  }
  console.log(`ProductEntity loaded: ${productMap.size}`);

  // Brand resolution
  const BRAND_FROM_LINE: Record<string, string> = {
    "1": "Latin Kids",
    "2": "Castillitos",
    "5": "Importación",
  };

  // ══════════════════════════════════════════════════════════════════════════
  // 4. CLASSIFY B48 REFS
  // ══════════════════════════════════════════════════════════════════════════

  interface RefTrace {
    reference: string;
    description: string;
    qty: number;
    productLine: string | null;
    brand: string | null;
    groupId: string | null;   // subgrupoId from ProductEntity
    groupCode: string | null; // category from ProductEntity
    groupName: string | null; // v_articulos sc_detalle_grupo
    subgroupId: number | null;
    subgroupCode: string | null; // subgrupoSag from ProductEntity
    subgroupName: string | null; // v_articulos sc_detalle_subgrupo
    subgrupoSagOnRef: string | null; // what the loader would put on VendorSampleRef.subgrupoSag
  }

  const csRefs: RefTrace[] = [];
  const ltRefs: RefTrace[] = [];
  let importCount = 0;
  let otherCount = 0;
  let noProduct = 0;

  for (const row of presenceRows) {
    const ref = String(row.ref ?? "").trim();
    if (!ref) continue;
    const qty = Number(row.net_qty) || 0;
    const sagSubgrupoId = row.subgrupo_id != null ? Number(row.subgrupo_id) : null;

    const product = productMap.get(ref);
    if (!product) {
      noProduct++;
      continue;
    }

    const brand = BRAND_FROM_LINE[product.productLine ?? ""] ?? null;

    if (product.productLine === "5") {
      importCount++;
      continue;
    }

    // Resolve subgrupoSag — same logic as vendor-sample-loader
    const subgrupoFromLookup = sagSubgrupoId != null ? subgrupoLookup.get(sagSubgrupoId) : null;
    const subgrupoSagOnRef = subgrupoFromLookup ?? product.subgrupoSag ?? "OTRO";

    const trace: RefTrace = {
      reference: ref,
      description: String(product.name ?? row.descr ?? ""),
      qty,
      productLine: product.productLine,
      brand,
      groupId: product.subgrupoId != null ? String(product.subgrupoId) : null,
      groupCode: product.category,
      groupName: vGrupoByCode.get(ref) ?? null,
      subgroupId: sagSubgrupoId,
      subgroupCode: product.subgrupoSag,
      subgroupName: vSubgrupoByCode.get(ref) ?? null,
      subgrupoSagOnRef,
    };

    if (brand === "Castillitos") csRefs.push(trace);
    else if (brand === "Latin Kids") ltRefs.push(trace);
    else otherCount++;
  }

  console.log(`\n=== CLASSIFICATION ===`);
  console.log(`  Castillitos: ${csRefs.length}`);
  console.log(`  Latin Kids:  ${ltRefs.length}`);
  console.log(`  Import:      ${importCount}`);
  console.log(`  Other/null:  ${otherCount}`);
  console.log(`  No product:  ${noProduct}`);

  // ══════════════════════════════════════════════════════════════════════════
  // 5. RAW DATA REPORT — first 20 per brand
  // ══════════════════════════════════════════════════════════════════════════

  const printRefs = (label: string, refs: RefTrace[], limit: number) => {
    console.log(`\n${"═".repeat(80)}`);
    console.log(`  ${label} — RAW DATA (first ${limit})`);
    console.log(`${"═".repeat(80)}\n`);
    console.log(
      `${"REF".padEnd(18)} ` +
      `${"BRAND".padEnd(13)} ` +
      `${"LINE".padEnd(5)} ` +
      `${"GRP_CODE".padEnd(10)} ` +
      `${"GRP_NAME".padEnd(22)} ` +
      `${"SUBG_ID".padEnd(8)} ` +
      `${"SUBG_CODE".padEnd(22)} ` +
      `${"SUBG_NAME".padEnd(22)} ` +
      `${"SUBG_ON_REF".padEnd(22)} ` +
      `QTY`
    );
    console.log("-".repeat(160));

    for (const r of refs.slice(0, limit)) {
      console.log(
        `${(r.reference ?? "—").padEnd(18)} ` +
        `${(r.brand ?? "—").padEnd(13)} ` +
        `${(r.productLine ?? "—").padEnd(5)} ` +
        `${(r.groupCode ?? "—").padEnd(10)} ` +
        `${(r.groupName ?? "—").padEnd(22)} ` +
        `${(r.subgroupId != null ? String(r.subgroupId) : "—").padEnd(8)} ` +
        `${(r.subgroupCode ?? "—").padEnd(22)} ` +
        `${(r.subgroupName ?? "—").padEnd(22)} ` +
        `${(r.subgrupoSagOnRef ?? "—").padEnd(22)} ` +
        `${r.qty}`
      );
    }
  };

  printRefs("CASTILLITOS TEXTIL", csRefs, 20);
  printRefs("LATIN KIDS TEXTIL", ltRefs, 20);

  // ══════════════════════════════════════════════════════════════════════════
  // 6. CATALOG KEYS
  // ══════════════════════════════════════════════════════════════════════════

  const { buildCastillitosTextilCatalog, buildLatinKidsTextilCatalog } = await import(
    "../lib/comercial/maletas/assortment-catalog/castillitos-mallet-assortment-catalog"
  );

  const csCatalog = buildCastillitosTextilCatalog();
  const ltCatalog = buildLatinKidsTextilCatalog();

  console.log(`\n${"═".repeat(80)}`);
  console.log(`  CASTILLITOS CATALOG KEYS`);
  console.log(`${"═".repeat(80)}\n`);
  console.log(`${"GROUP_CODE".padEnd(20)} ${"SUBGROUP_CODE".padEnd(25)} ${"SUBGROUP_NAME".padEnd(30)} TARGET`);
  console.log("-".repeat(85));
  for (const group of csCatalog.groups) {
    for (const e of group.entries) {
      if (!e.active) continue;
      console.log(
        `${group.groupCode.padEnd(20)} ${(e.subgroupCode ?? "—").padEnd(25)} ${e.subgroupName.padEnd(30)} ${e.targetUnits}`
      );
    }
  }

  console.log(`\n${"═".repeat(80)}`);
  console.log(`  LATIN KIDS CATALOG KEYS`);
  console.log(`${"═".repeat(80)}\n`);
  console.log(`${"GROUP_CODE".padEnd(20)} ${"SUBGROUP_CODE".padEnd(25)} ${"SUBGROUP_NAME".padEnd(30)} TARGET`);
  console.log("-".repeat(85));
  for (const group of ltCatalog.groups) {
    for (const e of group.entries) {
      if (!e.active) continue;
      console.log(
        `${group.groupCode.padEnd(20)} ${(e.subgroupCode ?? "—").padEnd(25)} ${e.subgroupName.padEnd(30)} ${e.targetUnits}`
      );
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 7. MATCHING MATRIX
  // ══════════════════════════════════════════════════════════════════════════

  // Collect all valid catalog subgroupCodes
  const csCatalogKeys = new Set<string>();
  for (const g of csCatalog.groups) {
    for (const e of g.entries) {
      if (e.active && e.subgroupCode) csCatalogKeys.add(e.subgroupCode);
    }
  }
  const ltCatalogKeys = new Set<string>();
  for (const g of ltCatalog.groups) {
    for (const e of g.entries) {
      if (e.active && e.subgroupCode) ltCatalogKeys.add(e.subgroupCode);
    }
  }

  const matchMatrix = (
    label: string,
    refs: RefTrace[],
    catalogKeys: Set<string>,
  ) => {
    console.log(`\n${"═".repeat(120)}`);
    console.log(`  ${label} — MATCHING MATRIX (ALL ${refs.length} refs)`);
    console.log(`${"═".repeat(120)}\n`);
    console.log(
      `${"REF".padEnd(18)} ` +
      `${"SUBG_ON_REF (real key)".padEnd(30)} ` +
      `${"MATCH".padEnd(10)} ` +
      `REASON`
    );
    console.log("-".repeat(100));

    let matched = 0;
    let unmatched = 0;
    const reasons: Record<string, number> = {};

    for (const r of refs) {
      const realKey = r.subgrupoSagOnRef ?? "—";
      const isMatch = catalogKeys.has(realKey);
      let reason = "";

      if (isMatch) {
        matched++;
        reason = "OK";
      } else {
        unmatched++;
        if (!r.brand) {
          reason = "PRODUCT_NOT_ENRICHED";
        } else if (!r.subgrupoSagOnRef || r.subgrupoSagOnRef === "OTRO") {
          reason = "SUBGROUP_CODE_MISSING";
        } else {
          // subgrupoSag has a value but it doesn't match any catalog key
          reason = "SUBGROUP_CODE_MISMATCH";
        }
        reasons[reason] = (reasons[reason] || 0) + 1;
      }

      console.log(
        `${r.reference.padEnd(18)} ` +
        `${realKey.padEnd(30)} ` +
        `${(isMatch ? "MATCH" : "NO MATCH").padEnd(10)} ` +
        `${reason}`
      );
    }

    console.log(`\n  TOTAL: ${refs.length}  |  MATCH: ${matched}  |  NO MATCH: ${unmatched}`);
    console.log(`  Match rate: ${refs.length > 0 ? ((matched / refs.length) * 100).toFixed(1) : 0}%`);
    if (Object.keys(reasons).length > 0) {
      console.log(`\n  MISMATCH REASONS:`);
      for (const [r, c] of Object.entries(reasons).sort((a, b) => b[1] - a[1])) {
        console.log(`    ${r}: ${c}`);
      }
    }

    // Show unique real keys vs catalog keys
    const realKeys = new Set(refs.map((r) => r.subgrupoSagOnRef ?? "—"));
    console.log(`\n  UNIQUE REAL KEYS (${realKeys.size}):`);
    for (const k of [...realKeys].sort()) {
      const inCatalog = catalogKeys.has(k);
      console.log(`    ${inCatalog ? "✓" : "✗"} "${k}"`);
    }
    console.log(`\n  CATALOG KEYS (${catalogKeys.size}):`);
    for (const k of [...catalogKeys].sort()) {
      const hasMatch = refs.some((r) => r.subgrupoSagOnRef === k);
      console.log(`    ${hasMatch ? "✓" : "·"} "${k}"`);
    }
  };

  matchMatrix("CASTILLITOS TEXTIL", csRefs, csCatalogKeys);
  matchMatrix("LATIN KIDS TEXTIL", ltRefs, ltCatalogKeys);

  // ══════════════════════════════════════════════════════════════════════════
  // 8. CONCLUSION
  // ══════════════════════════════════════════════════════════════════════════

  console.log(`\n${"═".repeat(80)}`);
  console.log(`  CONCLUSION`);
  console.log(`${"═".repeat(80)}`);
  console.log(`  Matching logic: r.subgrupoSag === entry.subgroupCode`);
  console.log(`  (maletas-functional-evaluation.ts line 262)`);
  console.log(`\n  The ref's subgrupoSag comes from SAG SUBGRUPOS lookup (sc_detalle_subgrupo).`);
  console.log(`  The catalog's subgroupCode is a coded key like PIJAMA_CL, VESTIDO, etc.`);
  console.log(`  If SAG returns "PIJAMA C.L." and catalog expects "PIJAMA_CL", they won't match.`);
  console.log(`${"═".repeat(80)}\n`);

  await prisma.$disconnect();
  pool.end();
}

main().catch((e) => {
  console.error(`FATAL: ${(e as Error).message}`);
  process.exit(1);
});
