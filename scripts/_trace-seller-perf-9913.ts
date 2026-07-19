/**
 * Runtime trace: cross-reference DB orders with SAG vendor data.
 * Usage: npx tsx scripts/_trace-seller-perf-9913.ts
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import * as dotenv from "dotenv";
dotenv.config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter } as any);

function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

async function sagQuery(consulta: string): Promise<any[]> {
  const token = process.env.PYA_SOAP_TOKEN ?? "";
  const endpoint = process.env.PYA_SOAP_ENDPOINT ?? "https://wssagpya.azurewebsites.net/ServiceSagWeb.svc/soap";
  const database = process.env.PYA_SAG_BD ?? "";
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
    headers: { "Content-Type": "text/xml; charset=utf-8", SOAPAction: "http://tempuri.org/IServiceSagWeb/consultaSagJson" },
    body, signal: AbortSignal.timeout(60_000),
  });
  const xml = await res.text();
  if (!res.ok) throw new Error(`SAG HTTP ${res.status}`);
  const tag = "consultaSagJsonResult";
  const i = xml.indexOf(`<${tag}>`), j = xml.indexOf(`</${tag}>`);
  if (i === -1 || j === -1) throw new Error(`No ${tag}`);
  return JSON.parse(xml.slice(i + tag.length + 2, j));
}

async function main() {
  console.log("=== CROSS-REFERENCE: DB orders vs SAG vendor data ===\n");
  const t0 = Date.now();

  const org = await prisma.organization.findFirst({ where: { slug: "castillitos" } });
  if (!org) { console.log("FATAL: org not found"); return; }
  const orgId = org.id;

  // 1. What erpMovId range exists in DB?
  const range = await (prisma as any).$queryRaw`
    SELECT MIN("erpMovId") AS min_id, MAX("erpMovId") AS max_id, COUNT(*)::int AS total
    FROM "CustomerOrderRecord"
    WHERE "organizationId" = ${orgId}
  ` as any[];
  console.log("[1] DB erpMovId range:", JSON.stringify(range[0]));

  // 2. Get a sample of DB erpMovIds
  const dbSample = await (prisma as any).$queryRaw`
    SELECT "erpMovId" FROM "CustomerOrderRecord"
    WHERE "organizationId" = ${orgId}
    ORDER BY "erpMovId" DESC
    LIMIT 10
  ` as any[];
  console.log("[2] Latest 10 DB erpMovIds:", dbSample.map((r: any) => r.erpMovId));

  // 3. Check which of these DB orders have vendor in SAG
  const sampleIds = dbSample.map((r: any) => r.erpMovId);
  if (sampleIds.length > 0) {
    console.log("\n[3] Checking SAG vendor for DB orders...");
    const idList = sampleIds.join(",");
    const vendorRows = await sagQuery(`
      SELECT ka_nl_movimiento, ka_nl_tercero_vend
      FROM MOVIMIENTOS
      WHERE ka_nl_movimiento IN (${idList})
    `);
    console.log("[3] SAG vendor data for these orders:");
    for (const r of vendorRows) {
      const vendId = Number(r.ka_nl_tercero_vend ?? 0);
      console.log(`    #${r.ka_nl_movimiento}: vendor=${vendId > 0 ? vendId : "NULL"}`);
    }

    // 4. Find one that HAS a vendor
    const withVendor = vendorRows.filter((r: any) => Number(r.ka_nl_tercero_vend ?? 0) > 0);
    if (withVendor.length > 0) {
      const pick = withVendor[0];
      const erpMovId = Number(pick.ka_nl_movimiento);
      const vendorId = Number(pick.ka_nl_tercero_vend);

      // Get vendor name
      const nameRows = await sagQuery(`SELECT sc_nombre FROM TERCEROS WHERE ka_nl_tercero = ${vendorId}`);
      const vendorName = nameRows[0]?.sc_nombre ?? "UNKNOWN";

      console.log(`\n[4] FOUND: Order #${erpMovId} with vendor ${vendorId} (${vendorName})`);
      console.log("    This order IS in DB and HAS a SAG vendor.");
      console.log("    → Frontend should send sellerCode='" + vendorId + "'");

      // Now simulate the full performance query
      console.log("\n[5] Full performance simulation for vendor", vendorId, "...");

      // Get all SAG order IDs for this vendor
      const allIds = await sagQuery(`
        SELECT ka_nl_movimiento FROM MOVIMIENTOS
        WHERE ka_ni_fuente = 40 AND sc_anulado = 'N'
        AND ka_nl_tercero_vend = ${vendorId}
      `);
      const allErpIds = allIds.map((r: any) => Number(r.ka_nl_movimiento));
      console.log(`[step1] SAG: ${allErpIds.length} total orders for vendor ${vendorId}`);

      // Match to DB
      const allStrings = allErpIds.map(String);
      const orders = await (prisma as any).$queryRaw`
        SELECT r."id", r."erpMovId", r."orderDate", r."customerNit",
               r."customerName", r."amount"
        FROM "CustomerOrderRecord" r
        WHERE r."organizationId" = ${orgId}
        AND r."erpMovId"::text = ANY(${allStrings})
        ORDER BY r."orderDate" DESC
      ` as any[];
      console.log(`[step2] DB match: ${orders.length} CustomerOrderRecords`);

      if (orders.length > 0) {
        const orderIds = orders.map((o: any) => o.id);
        const lineAgg = await (prisma as any).$queryRaw`
          SELECT SUM(l."quantity")::float AS total_units,
                 SUM(l."quantity" * l."unitValue")::float AS total_value
          FROM "CustomerOrderLine" l
          WHERE l."orderId" = ANY(${orderIds})
        ` as any[];

        const totalUnits = Math.round(lineAgg[0]?.total_units ?? 0);
        const totalValue = Math.round(lineAgg[0]?.total_value ?? 0);
        const customers = new Set(orders.map((o: any) => o.customerNit).filter(Boolean));

        console.log(`\n=== PERFORMANCE RESULT ===`);
        console.log(`Vendor:         ${vendorName} (code: ${vendorId})`);
        console.log(`totalOrders:    ${orders.length}`);
        console.log(`totalUnits:     ${totalUnits}`);
        console.log(`totalValue:     $${totalValue.toLocaleString()}`);
        console.log(`totalCustomers: ${customers.size}`);
        console.log(`avgTicket:      $${orders.length > 0 ? Math.round(totalValue / orders.length).toLocaleString() : 0}`);
        console.log(`\nUI verdict: ${orders.length > 0 ? "SHOWS KPI PANEL" : "SHOWS PLACEHOLDER"}`);
        console.log(`First order: #${orders[0].erpMovId} — ${orders[0].customerName}`);
      } else {
        console.log("\n=== No DB match for any of this vendor's SAG orders ===");
      }
    } else {
      console.log("\n[4] NONE of the latest 10 DB orders have a SAG vendor.");

      // Try older orders that might have vendor (2020-2022 range)
      console.log("\n[5] Checking older DB orders (2020-2022 range)...");
      const olderSample = await (prisma as any).$queryRaw`
        SELECT "erpMovId" FROM "CustomerOrderRecord"
        WHERE "organizationId" = ${orgId}
        ORDER BY "erpMovId" ASC
        LIMIT 10
      ` as any[];
      const olderIds = olderSample.map((r: any) => r.erpMovId);
      console.log("    Oldest 10 DB erpMovIds:", olderIds);

      if (olderIds.length > 0) {
        const olderIdList = olderIds.join(",");
        const olderVendors = await sagQuery(`
          SELECT ka_nl_movimiento, ka_nl_tercero_vend
          FROM MOVIMIENTOS
          WHERE ka_nl_movimiento IN (${olderIdList})
        `);
        for (const r of olderVendors) {
          const v = Number(r.ka_nl_tercero_vend ?? 0);
          console.log(`    #${r.ka_nl_movimiento}: vendor=${v > 0 ? v : "NULL"}`);
        }
      }
    }
  }

  console.log(`\nTotal ms: ${Date.now() - t0}`);
  await prisma.$disconnect();
}

main().catch(err => { console.error("FATAL:", err); process.exit(1); });
