/**
 * _transfer-route-analysis.ts
 *
 * INVENTORY-F34-TRANSFER-SYNC-01 — Phases 5-9 analysis.
 *
 * Phase 5: Route Classification
 * Phase 6: Vendor Validation (per-vendor-bodega stats)
 * Phase 7: Reference Validation (top refs by vendor)
 * Phase 8: PIL Reconciliation (F34 in/out vs PIL saldo)
 * Phase 9: Ledger Readiness
 *
 * Usage:
 *   npx dotenv-cli -e .env -- npx tsx scripts/_transfer-route-analysis.ts
 */

import { prisma } from "@/lib/prisma";
import { CASTILLITOS_LOCATIONS } from "@/lib/logistics/catalogs/castillitos-locations";
import {
  CASTILLITOS_BODEGA_MAP,
  internalToExternal,
} from "@/lib/logistics/catalogs/castillitos-bodega-mapping";
import type { InventoryLocation } from "@/lib/logistics/inventory-location-types";

const ORG = "cmmpwstuf000dp5y58kj1daaj";
const db = prisma as any;

const B = (s: string) => `\x1b[1m${s}\x1b[0m`;
const G = (s: string) => `\x1b[32m${s}\x1b[0m`;
const R = (s: string) => `\x1b[31m${s}\x1b[0m`;
const Y = (s: string) => `\x1b[33m${s}\x1b[0m`;
const C = (s: string) => `\x1b[36m${s}\x1b[0m`;

// ── Location classifier ────────────────────────────────────────────────────

type RouteClass =
  | "CENTRAL_TO_STORE"
  | "CENTRAL_TO_VENDOR"
  | "CENTRAL_TO_FRANCHISE"
  | "CENTRAL_TO_IMPORT"
  | "STORE_TO_CENTRAL"
  | "VENDOR_TO_CENTRAL"
  | "FRANCHISE_TO_CENTRAL"
  | "IMPORT_TO_CENTRAL"
  | "IMPORT_TO_STORE"
  | "IMPORT_TO_FRANCHISE"
  | "IMPORT_TO_VENDOR"
  | "STORE_TO_STORE"
  | "CENTRAL_TO_SERVICE"
  | "SERVICE_TO_CENTRAL"
  | "PRODUCTION_INTERNAL"
  | "IMPORT_INTERNAL"
  | "UNKNOWN";

const locationIndex = new Map<string, InventoryLocation>();
for (const loc of CASTILLITOS_LOCATIONS) {
  locationIndex.set(loc.code, loc);
}

function locCategory(code: string | null): string {
  if (!code) return "UNKNOWN";
  const loc = locationIndex.get(code);
  if (!loc) return "UNKNOWN";
  switch (loc.locationType) {
    case "MAIN_WAREHOUSE": return "CENTRAL";
    case "STORE": return "STORE";
    case "PORTFOLIO": return "VENDOR";
    case "FRANCHISE": return "FRANCHISE";
    case "STAGING":
    case "IMPORT": return "IMPORT";
    case "PRODUCTION": return "PRODUCTION";
    case "RAW_MATERIAL": return "PRODUCTION";
    case "SERVICE":
    case "TEMPORARY": return "SERVICE";
    default: return "UNKNOWN";
  }
}

function classifyRoute(origin: string | null, dest: string | null): RouteClass {
  const o = locCategory(origin);
  const d = locCategory(dest);

  if (o === "CENTRAL" && d === "STORE") return "CENTRAL_TO_STORE";
  if (o === "CENTRAL" && d === "VENDOR") return "CENTRAL_TO_VENDOR";
  if (o === "CENTRAL" && d === "FRANCHISE") return "CENTRAL_TO_FRANCHISE";
  if (o === "CENTRAL" && d === "IMPORT") return "CENTRAL_TO_IMPORT";
  if (o === "CENTRAL" && d === "SERVICE") return "CENTRAL_TO_SERVICE";
  if (o === "STORE" && d === "CENTRAL") return "STORE_TO_CENTRAL";
  if (o === "VENDOR" && d === "CENTRAL") return "VENDOR_TO_CENTRAL";
  if (o === "FRANCHISE" && d === "CENTRAL") return "FRANCHISE_TO_CENTRAL";
  if (o === "IMPORT" && d === "CENTRAL") return "IMPORT_TO_CENTRAL";
  if (o === "IMPORT" && d === "STORE") return "IMPORT_TO_STORE";
  if (o === "IMPORT" && d === "FRANCHISE") return "IMPORT_TO_FRANCHISE";
  if (o === "IMPORT" && d === "VENDOR") return "IMPORT_TO_VENDOR";
  if (o === "SERVICE" && d === "CENTRAL") return "SERVICE_TO_CENTRAL";
  if (o === "STORE" && d === "STORE") return "STORE_TO_STORE";
  if (o === "PRODUCTION" && d === "PRODUCTION") return "PRODUCTION_INTERNAL";
  if (o === "IMPORT" && d === "IMPORT") return "IMPORT_INTERNAL";
  return "UNKNOWN";
}

function locLabel(code: string | null): string {
  if (!code) return "?";
  const loc = locationIndex.get(code);
  return loc ? `B${code}(${loc.name})` : `B${code}(?)`;
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log("");
  console.log(B("================================================================="));
  console.log(B("  INVENTORY-F34-TRANSFER-SYNC-01 — Route & Vendor Analysis"));
  console.log(B("  Phases 5-9"));
  console.log(B("================================================================="));
  console.log("");

  // Check if codes are internal or external
  const sampleRoutes: Array<{ origin: string | null; dest: string | null }> =
    await db.$queryRawUnsafe(`
      SELECT "originWarehouseCode" as origin, "destinationWarehouseCode" as dest
      FROM "InventoryTransfer"
      WHERE "organizationId" = $1 AND "originWarehouseCode" IS NOT NULL
      LIMIT 5
    `, ORG);

  // Detect if codes are still internal IDs (>= 10 for most codes)
  const firstOrigin = sampleRoutes[0]?.origin;
  const isInternal = firstOrigin && parseInt(firstOrigin) >= 10;
  if (isInternal) {
    console.log(Y("  WARNING: Warehouse codes appear to be SAG internal IDs (not external codes)."));
    console.log(Y("  Will translate on-the-fly using bodega mapping."));
    console.log("");
  }

  // ── PHASE 5: Route Classification ────────────────────────────────────────

  console.log(B("  PHASE 5 — ROUTE CLASSIFICATION"));
  console.log(B("================================================================="));

  const routes: Array<{
    origin: string | null;
    dest: string | null;
    transfer_type: string;
    cnt: number;
    total_lines: number;
  }> = await db.$queryRawUnsafe(`
    SELECT it."originWarehouseCode" as origin,
           it."destinationWarehouseCode" as dest,
           it."transferType" as transfer_type,
           COUNT(*)::int as cnt,
           COALESCE(SUM(line_counts.line_cnt), 0)::int as total_lines
    FROM "InventoryTransfer" it
    LEFT JOIN (
      SELECT "inventoryTransferId", COUNT(*)::int as line_cnt
      FROM "InventoryTransferLine"
      WHERE "organizationId" = $1
      GROUP BY "inventoryTransferId"
    ) line_counts ON line_counts."inventoryTransferId" = it.id
    WHERE it."organizationId" = $1
    GROUP BY it."originWarehouseCode", it."destinationWarehouseCode", it."transferType"
    ORDER BY cnt DESC
  `, ORG);

  // Classify each route
  const classifiedRoutes = routes.map((r) => {
    const oCode = isInternal && r.origin ? (internalToExternal(parseInt(r.origin)) ?? r.origin) : r.origin;
    const dCode = isInternal && r.dest ? (internalToExternal(parseInt(r.dest)) ?? r.dest) : r.dest;
    return {
      ...r,
      originExt: oCode,
      destExt: dCode,
      routeClass: classifyRoute(oCode, dCode),
    };
  });

  // Aggregate by route class
  const classCounts = new Map<RouteClass, { transfers: number; lines: number }>();
  for (const r of classifiedRoutes) {
    const existing = classCounts.get(r.routeClass) ?? { transfers: 0, lines: 0 };
    existing.transfers += r.cnt;
    existing.lines += r.total_lines;
    classCounts.set(r.routeClass, existing);
  }

  console.log("");
  console.log("  Route Class                  | Transfers | Lines");
  console.log("  -----------------------------|-----------|--------");
  const sortedClasses = [...classCounts.entries()].sort((a, b) => b[1].transfers - a[1].transfers);
  for (const [cls, stats] of sortedClasses) {
    const label = cls.padEnd(30);
    console.log(`  ${label} | ${String(stats.transfers).padStart(9)} | ${String(stats.lines).padStart(6)}`);
  }

  console.log("");
  console.log("  Detailed routes:");
  for (const r of classifiedRoutes.filter(r => r.cnt >= 5)) {
    const arrow = `${locLabel(r.originExt)}→${locLabel(r.destExt)}`;
    const cls = r.routeClass;
    console.log(`    ${arrow.padEnd(55)} ${r.transfer_type} ${cls.padEnd(25)} ${r.cnt} transfers, ${r.total_lines} lines`);
  }

  // ── PHASE 6: Vendor Validation ─────────────────────────────────────────

  console.log("");
  console.log(B("  PHASE 6 — VENDOR VALIDATION"));
  console.log(B("================================================================="));

  const vendorBodegas = CASTILLITOS_LOCATIONS.filter(l => l.locationType === "PORTFOLIO");

  for (const vendor of vendorBodegas) {
    const vendorInternalId = CASTILLITOS_BODEGA_MAP.find(m => m.externalCode === vendor.code)?.internalId;
    const whereCode = isInternal ? String(vendorInternalId) : vendor.code;

    // Inbound (to vendor)
    const inbound: Array<{ cnt: number; total_qty: number; total_value: number; min_date: Date; max_date: Date }> =
      await db.$queryRawUnsafe(`
        SELECT COUNT(DISTINCT it.id)::int as cnt,
               COALESCE(SUM(itl.quantity), 0)::int as total_qty,
               COALESCE(SUM(itl."lineTotal"), 0)::float as total_value,
               MIN(it."documentDate") as min_date,
               MAX(it."documentDate") as max_date
        FROM "InventoryTransfer" it
        JOIN "InventoryTransferLine" itl ON itl."inventoryTransferId" = it.id
        WHERE it."organizationId" = $1
          AND it."destinationWarehouseCode" = $2
      `, ORG, whereCode);

    // Outbound (from vendor)
    const outbound: Array<{ cnt: number; total_qty: number; total_value: number }> =
      await db.$queryRawUnsafe(`
        SELECT COUNT(DISTINCT it.id)::int as cnt,
               COALESCE(SUM(itl.quantity), 0)::int as total_qty,
               COALESCE(SUM(itl."lineTotal"), 0)::float as total_value
        FROM "InventoryTransfer" it
        JOIN "InventoryTransferLine" itl ON itl."inventoryTransferId" = it.id
        WHERE it."organizationId" = $1
          AND it."originWarehouseCode" = $2
      `, ORG, whereCode);

    // Unique refs
    const refs: Array<{ ref_cnt: number }> = await db.$queryRawUnsafe(`
      SELECT COUNT(DISTINCT itl."referenceCode")::int as ref_cnt
      FROM "InventoryTransfer" it
      JOIN "InventoryTransferLine" itl ON itl."inventoryTransferId" = it.id
      WHERE it."organizationId" = $1
        AND (it."destinationWarehouseCode" = $2 OR it."originWarehouseCode" = $2)
    `, ORG, whereCode);

    const i = inbound[0] ?? { cnt: 0, total_qty: 0, total_value: 0, min_date: null, max_date: null };
    const o = outbound[0] ?? { cnt: 0, total_qty: 0, total_value: 0 };
    const netQty = i.total_qty - o.total_qty;
    const netValue = i.total_value - o.total_value;

    console.log("");
    console.log(`  ${B(vendor.name)} (B${vendor.code}) — ${vendor.sellerName ?? "?"}`);
    console.log(`    Inbound:  ${G(String(i.cnt))} transfers, ${G(String(i.total_qty))} units, $${(i.total_value / 1e6).toFixed(1)}M COP`);
    console.log(`    Outbound: ${Y(String(o.cnt))} transfers, ${Y(String(o.total_qty))} units, $${(o.total_value / 1e6).toFixed(1)}M COP`);
    console.log(`    Net:      ${netQty >= 0 ? R(String(netQty)) : G(String(netQty))} units, $${(netValue / 1e6).toFixed(1)}M COP`);
    console.log(`    Refs:     ${refs[0]?.ref_cnt ?? 0} unique product references`);
    if (i.min_date) {
      console.log(`    Period:   ${new Date(i.min_date).toISOString().split("T")[0]} → ${new Date(i.max_date).toISOString().split("T")[0]}`);
    }
  }

  // ── PHASE 7: Reference Validation ──────────────────────────────────────

  console.log("");
  console.log(B("  PHASE 7 — REFERENCE VALIDATION (TOP REFS BY VENDOR SALDO)"));
  console.log(B("================================================================="));

  // Top refs with highest pending saldo across all vendors
  const topRefs: Array<{
    ref: string;
    product_name: string | null;
    in_qty: number;
    out_qty: number;
    net_qty: number;
    vendor_cnt: number;
  }> = await db.$queryRawUnsafe(`
    WITH vendor_codes AS (
      SELECT unnest($2::text[]) as code
    ),
    inbound AS (
      SELECT itl."referenceCode" as ref,
             MAX(itl."productName") as product_name,
             SUM(itl.quantity)::int as qty
      FROM "InventoryTransfer" it
      JOIN "InventoryTransferLine" itl ON itl."inventoryTransferId" = it.id
      JOIN vendor_codes vc ON it."destinationWarehouseCode" = vc.code
      WHERE it."organizationId" = $1
      GROUP BY itl."referenceCode"
    ),
    outbound AS (
      SELECT itl."referenceCode" as ref,
             SUM(itl.quantity)::int as qty
      FROM "InventoryTransfer" it
      JOIN "InventoryTransferLine" itl ON itl."inventoryTransferId" = it.id
      JOIN vendor_codes vc ON it."originWarehouseCode" = vc.code
      WHERE it."organizationId" = $1
      GROUP BY itl."referenceCode"
    ),
    vendor_spread AS (
      SELECT itl."referenceCode" as ref,
             COUNT(DISTINCT COALESCE(it."destinationWarehouseCode", it."originWarehouseCode"))::int as vendor_cnt
      FROM "InventoryTransfer" it
      JOIN "InventoryTransferLine" itl ON itl."inventoryTransferId" = it.id
      JOIN vendor_codes vc ON (it."destinationWarehouseCode" = vc.code OR it."originWarehouseCode" = vc.code)
      WHERE it."organizationId" = $1
      GROUP BY itl."referenceCode"
    )
    SELECT i.ref,
           i.product_name,
           i.qty as in_qty,
           COALESCE(o.qty, 0) as out_qty,
           (i.qty - COALESCE(o.qty, 0)) as net_qty,
           COALESCE(vs.vendor_cnt, 0) as vendor_cnt
    FROM inbound i
    LEFT JOIN outbound o ON o.ref = i.ref
    LEFT JOIN vendor_spread vs ON vs.ref = i.ref
    ORDER BY (i.qty - COALESCE(o.qty, 0)) DESC
    LIMIT 20
  `, ORG, vendorBodegas.map(v => {
    const internal = CASTILLITOS_BODEGA_MAP.find(m => m.externalCode === v.code)?.internalId;
    return isInternal ? String(internal) : v.code;
  }));

  console.log("");
  console.log("  Ref          | Product                | In   | Out  | Net  | Vendors");
  console.log("  -------------|------------------------|------|------|------|--------");
  for (const r of topRefs) {
    const ref = (r.ref ?? "").padEnd(12);
    const name = (r.product_name ?? "").substring(0, 22).padEnd(22);
    console.log(`  ${ref} | ${name} | ${String(r.in_qty).padStart(4)} | ${String(r.out_qty).padStart(4)} | ${r.net_qty >= 0 ? R(String(r.net_qty).padStart(4)) : G(String(r.net_qty).padStart(4))} | ${r.vendor_cnt}`);
  }

  // Zero-return refs
  const zeroReturn: Array<{ ref: string; product_name: string | null; total_in: number; vendor_cnt: number }> =
    await db.$queryRawUnsafe(`
      WITH vendor_codes AS (
        SELECT unnest($2::text[]) as code
      ),
      inbound AS (
        SELECT itl."referenceCode" as ref,
               MAX(itl."productName") as product_name,
               SUM(itl.quantity)::int as total_in
        FROM "InventoryTransfer" it
        JOIN "InventoryTransferLine" itl ON itl."inventoryTransferId" = it.id
        JOIN vendor_codes vc ON it."destinationWarehouseCode" = vc.code
        WHERE it."organizationId" = $1
        GROUP BY itl."referenceCode"
        HAVING SUM(itl.quantity) >= 10
      ),
      outbound_refs AS (
        SELECT DISTINCT itl."referenceCode" as ref
        FROM "InventoryTransfer" it
        JOIN "InventoryTransferLine" itl ON itl."inventoryTransferId" = it.id
        JOIN vendor_codes vc ON it."originWarehouseCode" = vc.code
        WHERE it."organizationId" = $1
      ),
      vendor_spread AS (
        SELECT itl."referenceCode" as ref,
               COUNT(DISTINCT it."destinationWarehouseCode")::int as vendor_cnt
        FROM "InventoryTransfer" it
        JOIN "InventoryTransferLine" itl ON itl."inventoryTransferId" = it.id
        JOIN vendor_codes vc ON it."destinationWarehouseCode" = vc.code
        WHERE it."organizationId" = $1
        GROUP BY itl."referenceCode"
      )
      SELECT i.ref, i.product_name, i.total_in, COALESCE(vs.vendor_cnt, 0) as vendor_cnt
      FROM inbound i
      LEFT JOIN outbound_refs o ON o.ref = i.ref
      LEFT JOIN vendor_spread vs ON vs.ref = i.ref
      WHERE o.ref IS NULL
      ORDER BY i.total_in DESC
      LIMIT 15
    `, ORG, vendorBodegas.map(v => {
      const internal = CASTILLITOS_BODEGA_MAP.find(m => m.externalCode === v.code)?.internalId;
      return isInternal ? String(internal) : v.code;
    }));

  console.log("");
  console.log(`  ${R("ZERO-RETURN REFS")} (dispatched to vendors, never returned):`);
  console.log("  Ref          | Product                | Units In | Vendors");
  console.log("  -------------|------------------------|----------|--------");
  for (const r of zeroReturn) {
    const ref = (r.ref ?? "").padEnd(12);
    const name = (r.product_name ?? "").substring(0, 22).padEnd(22);
    console.log(`  ${ref} | ${name} | ${R(String(r.total_in).padStart(8))} | ${r.vendor_cnt}`);
  }

  // ── PHASE 8: PIL Reconciliation ────────────────────────────────────────

  console.log("");
  console.log(B("  PHASE 8 — PIL RECONCILIATION (F34 net vs PIL saldo)"));
  console.log(B("================================================================="));

  for (const vendor of vendorBodegas) {
    const vendorInternalId = CASTILLITOS_BODEGA_MAP.find(m => m.externalCode === vendor.code)?.internalId;
    const whereCode = isInternal ? String(vendorInternalId) : vendor.code;

    // F34 net (from transfers)
    const transferNet: Array<{ in_qty: number; out_qty: number }> = await db.$queryRawUnsafe(`
      SELECT
        COALESCE((
          SELECT SUM(itl.quantity)::int
          FROM "InventoryTransfer" it
          JOIN "InventoryTransferLine" itl ON itl."inventoryTransferId" = it.id
          WHERE it."organizationId" = $1 AND it."destinationWarehouseCode" = $2
        ), 0) as in_qty,
        COALESCE((
          SELECT SUM(itl.quantity)::int
          FROM "InventoryTransfer" it
          JOIN "InventoryTransferLine" itl ON itl."inventoryTransferId" = it.id
          WHERE it."organizationId" = $1 AND it."originWarehouseCode" = $2
        ), 0) as out_qty
    `, ORG, whereCode);

    // PIL saldo for this vendor bodega
    const pilSaldo: Array<{ total_qty: number; variant_cnt: number }> = await db.$queryRawUnsafe(`
      SELECT COALESCE(SUM(pil.quantity), 0)::int as total_qty,
             COUNT(*)::int as variant_cnt
      FROM "ProductInventoryLevel" pil
      WHERE pil."organizationId" = $1 AND pil."warehouseId" = $2
    `, ORG, vendor.code);

    const tNet = transferNet[0] ?? { in_qty: 0, out_qty: 0 };
    const pil = pilSaldo[0] ?? { total_qty: 0, variant_cnt: 0 };
    const f34Net = tNet.in_qty - tNet.out_qty;
    const delta = f34Net - pil.total_qty;

    console.log("");
    console.log(`  ${B(vendor.name)} (B${vendor.code})`);
    console.log(`    F34 in:     ${G(String(tNet.in_qty))} units`);
    console.log(`    F34 out:    ${Y(String(tNet.out_qty))} units`);
    console.log(`    F34 net:    ${B(String(f34Net))} units`);
    console.log(`    PIL saldo:  ${C(String(pil.total_qty))} units (${pil.variant_cnt} variants)`);
    console.log(`    Delta:      ${Math.abs(delta) < 100 ? G(String(delta)) : R(String(delta))} (F34 - PIL)`);
  }

  // ── PHASE 9: Ledger Readiness ──────────────────────────────────────────

  console.log("");
  console.log(B("  PHASE 9 — VENDOR SAMPLE LEDGER READINESS"));
  console.log(B("================================================================="));

  const totalHeaders = await db.inventoryTransfer.count({ where: { organizationId: ORG } });
  const totalLines = await db.inventoryTransferLine.count({ where: { organizationId: ORG } });

  const headersWithOrigin: Array<{ cnt: number }> = await db.$queryRawUnsafe(`
    SELECT COUNT(*)::int as cnt FROM "InventoryTransfer"
    WHERE "organizationId" = $1 AND "originWarehouseCode" IS NOT NULL
  `, ORG);

  const headersWithDest: Array<{ cnt: number }> = await db.$queryRawUnsafe(`
    SELECT COUNT(*)::int as cnt FROM "InventoryTransfer"
    WHERE "organizationId" = $1 AND "destinationWarehouseCode" IS NOT NULL
  `, ORG);

  const headersWithLines: Array<{ cnt: number }> = await db.$queryRawUnsafe(`
    SELECT COUNT(DISTINCT it.id)::int as cnt
    FROM "InventoryTransfer" it
    JOIN "InventoryTransferLine" itl ON itl."inventoryTransferId" = it.id
    WHERE it."organizationId" = $1
  `, ORG);

  const vendorTransfers: Array<{ cnt: number }> = await db.$queryRawUnsafe(`
    SELECT COUNT(*)::int as cnt FROM "InventoryTransfer"
    WHERE "organizationId" = $1
      AND ("destinationWarehouseCode" IN (${vendorBodegas.map(v => {
        const internal = CASTILLITOS_BODEGA_MAP.find(m => m.externalCode === v.code)?.internalId;
        return `'${isInternal ? internal : v.code}'`;
      }).join(",")})
      OR "originWarehouseCode" IN (${vendorBodegas.map(v => {
        const internal = CASTILLITOS_BODEGA_MAP.find(m => m.externalCode === v.code)?.internalId;
        return `'${isInternal ? internal : v.code}'`;
      }).join(",")})
      )
  `, ORG);

  const originCoverage = ((headersWithOrigin[0]?.cnt ?? 0) / totalHeaders * 100).toFixed(1);
  const destCoverage = ((headersWithDest[0]?.cnt ?? 0) / totalHeaders * 100).toFixed(1);
  const lineCoverage = ((headersWithLines[0]?.cnt ?? 0) / totalHeaders * 100).toFixed(1);

  console.log("");
  console.log(`  Total transfers:     ${B(String(totalHeaders))}`);
  console.log(`  Total lines:         ${B(String(totalLines))}`);
  console.log(`  With origin code:    ${headersWithOrigin[0]?.cnt ?? 0} (${originCoverage}%)`);
  console.log(`  With dest code:      ${headersWithDest[0]?.cnt ?? 0} (${destCoverage}%)`);
  console.log(`  With line items:     ${headersWithLines[0]?.cnt ?? 0} (${lineCoverage}%)`);
  console.log(`  Vendor-related:      ${vendorTransfers[0]?.cnt ?? 0}`);
  console.log("");

  // Readiness assessment
  const checks = [
    { name: "F34 headers synced", pass: totalHeaders >= 1000, value: `${totalHeaders}` },
    { name: "F34 lines synced", pass: totalLines >= 50000, value: `${totalLines}` },
    { name: "Origin warehouse coverage > 80%", pass: parseFloat(originCoverage) >= 80, value: `${originCoverage}%` },
    { name: "Destination warehouse coverage > 80%", pass: parseFloat(destCoverage) >= 80, value: `${destCoverage}%` },
    { name: "Line item coverage > 70%", pass: parseFloat(lineCoverage) >= 70, value: `${lineCoverage}%` },
    { name: "Vendor transfers identifiable", pass: (vendorTransfers[0]?.cnt ?? 0) > 0, value: `${vendorTransfers[0]?.cnt ?? 0}` },
    { name: "Route classification working", pass: classCounts.size >= 3, value: `${classCounts.size} route classes` },
  ];

  let passCount = 0;
  for (const check of checks) {
    const icon = check.pass ? G("PASS") : R("FAIL");
    console.log(`  [${icon}] ${check.name}: ${check.value}`);
    if (check.pass) passCount++;
  }

  console.log("");
  const readiness = passCount === checks.length
    ? "READY"
    : passCount >= checks.length - 2
    ? "PARTIAL"
    : "NOT_READY";

  if (readiness === "READY") {
    console.log(G(`  LEDGER READINESS: ${readiness} — VendorSampleLedger can be built.`));
  } else if (readiness === "PARTIAL") {
    console.log(Y(`  LEDGER READINESS: ${readiness} — VendorSampleLedger can be partially built.`));
  } else {
    console.log(R(`  LEDGER READINESS: ${readiness} — More data needed.`));
  }

  console.log("");
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(`FATAL: ${(e as Error).message}`);
  process.exit(1);
});
