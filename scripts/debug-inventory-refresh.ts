/**
 * debug-inventory-refresh.ts
 *
 * INVENTARIO-CRON-RECOVERY-01 — Manual pipeline execution with full tracing.
 *
 * Runs the exact same pipeline that production uses, with detailed logging
 * at every stage to identify the failure point.
 *
 * Usage: npx tsx scripts/debug-inventory-refresh.ts
 *
 * WARNING: This WRITES to the database. It is NOT a dry-run.
 * It creates new ProductInventoryLevel rows and CommercialCoverageSnapshot rows.
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import * as dotenv from "dotenv";
dotenv.config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter } as any) as any;

// ── SAG SOAP client (inline to avoid server-only) ────────────────────────────

function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

async function sagQuery(consulta: string): Promise<any[]> {
  const token = process.env.PYA_SOAP_TOKEN ?? "";
  const endpoint = process.env.PYA_SOAP_ENDPOINT ?? "https://wssagpya.azurewebsites.net/ServiceSagWeb.svc/soap";
  const database = process.env.PYA_SAG_BD ?? "";

  if (!token) throw new Error("PYA_SOAP_TOKEN not set");

  const body =
    `<?xml version="1.0" encoding="utf-8"?>` +
    `<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:tns="http://tempuri.org/">` +
      `<soap:Body><tns:consultaSagJson>` +
        `<tns:a_s_token>${escapeXml(token)}</tns:a_s_token>` +
        (database ? `<tns:a_s_bd>${escapeXml(database)}</tns:a_s_bd>` : "") +
        `<tns:a_s_consulta>${escapeXml(consulta)}</tns:a_s_consulta>` +
      `</tns:consultaSagJson></soap:Body></soap:Envelope>`;

  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "text/xml; charset=utf-8",
      SOAPAction: "http://tempuri.org/IServiceSagWeb/consultaSagJson",
    },
    body,
    signal: AbortSignal.timeout(120_000),
  });

  const xml = await res.text();
  if (!res.ok) throw new Error(`SAG HTTP ${res.status}: ${xml.slice(0, 200)}`);

  const tag = "consultaSagJsonResult";
  const i = xml.indexOf(`<${tag}>`);
  const j = xml.indexOf(`</${tag}>`);
  if (i === -1 || j === -1) throw new Error(`No ${tag} in response`);

  const jsonStr = xml.slice(i + tag.length + 2, j);
  return JSON.parse(jsonStr);
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const t0 = Date.now();
  console.log("=== INVENTORY REFRESH DEBUG ===\n");
  console.log(`Started: ${new Date().toISOString()}`);

  // 0. Resolve org
  const org = await prisma.organization.findFirst({ where: { slug: "castillitos" } });
  if (!org) { console.log("FATAL: org not found"); return; }
  const orgId = org.id;
  console.log(`Org: ${org.slug} (${orgId})\n`);

  // ── STEP 1: SAG Master Lookups ──────────────────────────────────────────
  console.log("=== STEP 1: SAG Master Lookups ===");
  const step1T0 = Date.now();

  let tallas: any[], colores: any[], bodegas: any[], lineas: any[];
  try {
    [tallas, colores, bodegas, lineas] = await Promise.all([
      sagQuery("SELECT * FROM TALLAS"),
      sagQuery("SELECT * FROM COLORES"),
      sagQuery("SELECT * FROM BODEGAS"),
      sagQuery("SELECT * FROM LINEAS"),
    ]);
    console.log(`  Tallas: ${tallas.length}, Colores: ${colores.length}, Bodegas: ${bodegas.length}, Lineas: ${lineas.length}`);
    console.log(`  Duration: ${Date.now() - step1T0}ms`);
  } catch (err: any) {
    console.error(`  FAILED: ${err.message}`);
    console.log("\n=== PIPELINE ABORTED AT STEP 1 ===");
    await prisma.$disconnect();
    await pool.end();
    return;
  }

  // Build lookup maps
  const tallaMap = new Map<string, string>();
  for (const t of tallas) tallaMap.set(String(t.ka_nl_talla ?? ""), t.sc_nombre ?? "");
  const colorMap = new Map<string, string>();
  for (const c of colores) colorMap.set(String(c.ka_nl_color ?? ""), c.sc_nombre ?? "");
  const bodegaMap = new Map<string, string>();
  for (const b of bodegas) bodegaMap.set(String(b.ka_nl_bodega ?? ""), b.sc_nombre ?? "");

  // ── STEP 2: SAG Variant Inventory Query ─────────────────────────────────
  console.log("\n=== STEP 2: SAG Variant Inventory Query ===");
  const step2T0 = Date.now();

  const VARIANT_QUERY = `
    SELECT
      A.k_sc_codigo_articulo,
      A.sc_detalle_articulo,
      MI.ss_talla,
      MI.ss_color,
      MI.ka_nl_bodega,
      MI.ka_nl_sku,
      SUM(CASE WHEN F.sc_signo_inventario = '+' THEN MI.n_cantidad ELSE -MI.n_cantidad END) AS saldo
    FROM MOVIMIENTOS_ITEMS MI
    INNER JOIN MOVIMIENTOS M ON MI.ka_nl_movimiento = M.ka_nl_movimiento
    INNER JOIN FUENTES F ON M.ka_ni_fuente = F.ka_ni_fuente
    INNER JOIN ARTICULOS A ON MI.ka_nl_articulo = A.ka_nl_articulo
    WHERE F.sc_afecta_inventario = 'S'
      AND M.sc_anulado = 'N'
      AND A.sc_activo = 'S'
      AND A.sc_bloqueado = 'N'
      AND A.n_valor_venta_normal > 0
      AND A.sc_maneja_kardex = 'S'
    GROUP BY A.k_sc_codigo_articulo, A.sc_detalle_articulo, MI.ss_talla, MI.ss_color, MI.ka_nl_bodega, MI.ka_nl_sku
    HAVING SUM(CASE WHEN F.sc_signo_inventario = '+' THEN MI.n_cantidad ELSE -MI.n_cantidad END) <> 0
    ORDER BY A.k_sc_codigo_articulo, MI.ss_talla, MI.ss_color, MI.ka_nl_bodega
  `;

  let sagRows: any[];
  try {
    sagRows = await sagQuery(VARIANT_QUERY);
    console.log(`  SAG returned: ${sagRows.length} rows`);
    console.log(`  Duration: ${Date.now() - step2T0}ms`);

    // Sample first 3 rows
    for (const r of sagRows.slice(0, 3)) {
      console.log(`  Sample: ${r.k_sc_codigo_articulo} talla=${r.ss_talla} color=${r.ss_color} bodega=${r.ka_nl_bodega} saldo=${r.saldo}`);
    }

    // Count distinct products/warehouses
    const products = new Set(sagRows.map((r: any) => r.k_sc_codigo_articulo));
    const warehouses = new Set(sagRows.map((r: any) => String(r.ka_nl_bodega)));
    console.log(`  Distinct products: ${products.size}`);
    console.log(`  Distinct warehouses: ${warehouses.size}`);
  } catch (err: any) {
    console.error(`  FAILED: ${err.message}`);
    console.log("\n=== PIPELINE ABORTED AT STEP 2 ===");
    await prisma.$disconnect();
    await pool.end();
    return;
  }

  // ── STEP 3: Match products in DB ──────────────────────────────────────────
  console.log("\n=== STEP 3: Match Products in DB ===");
  const step3T0 = Date.now();

  const dbProducts = await prisma.productEntity.findMany({
    where: { organizationId: orgId, externalSource: "sag" },
    select: { id: true, sku: true, externalId: true, productLine: true },
  });
  const productLookup = new Map<string, { id: string; sku: string; productLine: string }>();
  for (const p of dbProducts) {
    if (p.externalId) productLookup.set(p.externalId.toUpperCase(), { id: p.id, sku: p.sku, productLine: p.productLine ?? "" });
  }

  const sagProductCodes = new Set(sagRows.map((r: any) => String(r.k_sc_codigo_articulo).toUpperCase()));
  let matched = 0;
  let unmatched = 0;
  for (const code of sagProductCodes) {
    if (productLookup.has(code)) matched++;
    else unmatched++;
  }

  console.log(`  DB products (externalSource=sag): ${dbProducts.length}`);
  console.log(`  SAG product codes: ${sagProductCodes.size}`);
  console.log(`  Matched: ${matched}`);
  console.log(`  Unmatched: ${unmatched}`);
  console.log(`  Duration: ${Date.now() - step3T0}ms`);

  // ── STEP 4: Check PIL write capability ──────────────────────────────────
  console.log("\n=== STEP 4: PIL Write Capability Test ===");
  const step4T0 = Date.now();

  // Count existing levels
  const existingLevels = await prisma.$queryRaw`
    SELECT COUNT(*)::int AS cnt FROM "ProductInventoryLevel"
    WHERE "organizationId" = ${orgId} AND "source" = 'sag'
  ` as any[];
  console.log(`  Existing PIL rows (source=sag): ${existingLevels[0]?.cnt ?? 0}`);

  // Count existing variants
  const existingVariants = await prisma.$queryRaw`
    SELECT COUNT(*)::int AS cnt FROM "ProductVariant"
    WHERE "organizationId" = ${orgId} AND "externalSource" = 'sag'
  ` as any[];
  console.log(`  Existing ProductVariant rows (externalSource=sag): ${existingVariants[0]?.cnt ?? 0}`);
  console.log(`  Duration: ${Date.now() - step4T0}ms`);

  // ── STEP 5: CCS snapshot write capability ──────────────────────────────
  console.log("\n=== STEP 5: CCS Snapshot Capability ===");

  // Check what the pipeline would build
  const commercialWarehouses = ["01", "04"];
  const commercialAgg = await prisma.$queryRawUnsafe(`
    SELECT "productId", SUM("quantity")::float as total_qty
    FROM "ProductInventoryLevel"
    WHERE "organizationId" = $1 AND "externalRef" = ANY($2::text[])
    GROUP BY "productId"
  `, orgId, commercialWarehouses) as any[];
  console.log(`  Commercial warehouse agg (01+04): ${commercialAgg.length} products`);

  // Pending orders
  const pendingOrders = await prisma.$queryRawUnsafe(`
    SELECT COUNT(*)::int AS cnt
    FROM "CustomerOrderRecord"
    WHERE "organizationId" = $1 AND status = 'PENDIENTE'
  `, orgId) as any[];
  console.log(`  Pending orders: ${pendingOrders[0]?.cnt ?? 0}`);

  // ── STEP 6: Simulate pipeline execution (DRY RUN mode) ────────────────
  console.log("\n=== STEP 6: Full Pipeline Dry Run ===");

  // Count how many CCS rows would be produced
  const LINE_MAP: Record<string, string> = { "1": "LT", "2": "CS", "3": "PK", "5": "AC" };
  const productIds = commercialAgg.map((r: any) => r.productId);
  const productsForSnap = await prisma.productEntity.findMany({
    where: { id: { in: productIds } },
    select: { id: true, sku: true, name: true, productLine: true },
  });
  const pMap = new Map<string, any>();
  for (const p of productsForSnap) pMap.set(p.id, p);

  let ltCount = 0, csCount = 0, otherCount = 0;
  for (const agg of commercialAgg) {
    const product = pMap.get(agg.productId);
    if (!product) continue;
    const line = LINE_MAP[product.productLine ?? ""] ?? "OT";
    if (line === "LT") ltCount++;
    else if (line === "CS") csCount++;
    else otherCount++;
  }
  console.log(`  CCS rows that would be written: LT=${ltCount}, CS=${csCount}, other=${otherCount}`);
  console.log(`  Total commercial (LT+CS): ${ltCount + csCount}`);

  // ── STEP 7: Execute the REAL pipeline ──────────────────────────────────
  console.log("\n=== STEP 7: EXECUTE REAL PIPELINE ===");
  console.log("  Importing refreshInventoryPipeline...");

  try {
    // Dynamic import to handle server-only
    const mod = await import("../lib/integrations/sag/inventory-refresh-pipeline");
    console.log("  Starting refreshInventoryPipeline...");
    const result = await mod.refreshInventoryPipeline(orgId);
    console.log("\n=== PIPELINE RESULT ===");
    console.log(JSON.stringify(result, null, 2));
  } catch (err: any) {
    console.error(`\n=== PIPELINE FAILED ===`);
    console.error(`  Error: ${err.message}`);
    console.error(`  Stack: ${err.stack?.split("\n").slice(0, 5).join("\n")}`);

    // If server-only blocked us, report that
    if (err.message?.includes("server-only") || err.message?.includes("This module cannot be imported")) {
      console.log("\n  NOTE: server-only import blocked execution.");
      console.log("  The pipeline imports 'server-only' which only works in Next.js server context.");
      console.log("  This means the pipeline CANNOT be tested outside of a running Next.js server.");
      console.log("  The cron/API route is the only way to execute it.");
    }
  }

  // ── STEP 8: Verify freshness after execution ──────────────────────────
  console.log("\n=== STEP 8: Post-execution Freshness ===");
  const pilAfter = await prisma.$queryRaw`
    SELECT MAX("syncedAt") AS max_synced FROM "ProductInventoryLevel"
    WHERE "organizationId" = ${orgId}
  ` as any[];
  const ccsAfter = await prisma.$queryRaw`
    SELECT MAX("snapshotAt") AS max_snapshot FROM "CommercialCoverageSnapshot"
    WHERE "organizationId" = ${orgId}
  ` as any[];
  console.log(`  PIL max syncedAt:   ${pilAfter[0]?.max_synced}`);
  console.log(`  CCS max snapshotAt: ${ccsAfter[0]?.max_snapshot}`);

  console.log(`\nTotal duration: ${Date.now() - t0}ms`);
  await prisma.$disconnect();
  await pool.end();
}

main().catch(e => { console.error("FATAL:", e); process.exit(1); });
