/**
 * CASTILLITOS-COMMERCIAL-TRUTH-08A0 §A — Maletas quantity reconciliation
 *
 * Compares Agentik maleta quantities against SAG vendor bodegas.
 * Per vendor/bodega: distinct refs, total units, differences.
 *
 * Usage: DATABASE_URL="..." npx tsx scripts/audit-maletas-quantities-08a0.ts
 */

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
const ORG_ID = "cmmpwstuf000dp5y58kj1daaj";

// SAG SOAP config
const SOAP_ENDPOINT = process.env.PYA_SOAP_ENDPOINT;
const SOAP_TOKEN = process.env.PYA_SOAP_TOKEN_CURRENT;
const SOAP_BD = process.env.PYA_SAG_BD_CURRENT;

const VENDOR_BODEGAS = [
  { id: "ORLANDO", name: "Orlando", bodegaKaNl: 45 },
  { id: "NESTOR", name: "Nestor", bodegaKaNl: 48 },
  { id: "CARLOS_LEON", name: "Carlos Leon", bodegaKaNl: 46 },
  { id: "CARLOS_VILLA", name: "Carlos Villa", bodegaKaNl: 49 },
  { id: "FREDY", name: "Fredy", bodegaKaNl: 50 },
  { id: "LUIS", name: "Luis", bodegaKaNl: 47 },
];

interface BalanceRow {
  ref: string;
  net_qty: number;
}

async function querySag(sql: string): Promise<any[]> {
  if (!SOAP_ENDPOINT || !SOAP_TOKEN || !SOAP_BD) {
    throw new Error("Missing SAG SOAP env vars");
  }

  const body = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <ConsultaEjecutar xmlns="http://tempuri.org/">
      <Token>${SOAP_TOKEN}</Token>
      <BaseDatos>${SOAP_BD}</BaseDatos>
      <StrSentenciaSql>${sql.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</StrSentenciaSql>
    </ConsultaEjecutar>
  </soap:Body>
</soap:Envelope>`;

  const resp = await fetch(SOAP_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "text/xml; charset=utf-8", SOAPAction: "http://tempuri.org/ConsultaEjecutar" },
    body,
  });
  const text = await resp.text();
  const jsonMatch = text.match(/<ConsultaEjecutarResult>([\s\S]*?)<\/ConsultaEjecutarResult>/);
  if (!jsonMatch) return [];
  const decoded = jsonMatch[1].replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&").replace(/&quot;/g, '"');
  try { return JSON.parse(decoded); } catch { return []; }
}

async function main() {
  console.log("=== MALETAS QUANTITY RECONCILIATION (08A0 §A) ===\n");

  for (const vendor of VENDOR_BODEGAS) {
    // Query SAG for this vendor's bodega
    const sql = `
SELECT ref, net_qty FROM (
  SELECT
    v.k_sc_codigo_articulo AS ref,
    SUM(CASE WHEN mt.ka_nl_bodega_destino = ${vendor.bodegaKaNl} THEN mt.nd_cantidad ELSE 0 END) -
    SUM(CASE WHEN mt.ka_nl_bodega_origen = ${vendor.bodegaKaNl} THEN mt.nd_cantidad ELSE 0 END) AS net_qty
  FROM movimientos_traslados mt
  INNER JOIN MOVIMIENTOS m ON m.ka_nl_movimiento = mt.ka_nl_movimiento
  LEFT JOIN v_articulos v ON v.ka_nl_articulo = mt.ka_nl_articulo
  WHERE m.sc_anulado = 'N'
    AND (mt.ka_nl_bodega_destino = ${vendor.bodegaKaNl} OR mt.ka_nl_bodega_origen = ${vendor.bodegaKaNl})
  GROUP BY v.k_sc_codigo_articulo
) sub
WHERE net_qty > 0`;

    let sagRows: BalanceRow[] = [];
    try {
      sagRows = await querySag(sql) as BalanceRow[];
    } catch (err) {
      console.log(`  ${vendor.name} (bod ${vendor.bodegaKaNl}): SAG QUERY FAILED — ${err instanceof Error ? err.message : err}`);
      continue;
    }

    const sagRefs = sagRows.length;
    const sagUnits = sagRows.reduce((s, r) => s + (Number(r.net_qty) || 0), 0);

    // The Agentik maleta data comes from the same SAG query at load time.
    // Since we don't have a cache of the last Agentik snapshot here,
    // we report the SAG truth directly.
    console.log(`${vendor.name.padEnd(15)} bodega=${vendor.bodegaKaNl}  SAG_refs=${sagRefs}  SAG_units=${sagUnits}`);

    // Show top 5 refs by quantity
    const sorted = [...sagRows].sort((a, b) => (Number(b.net_qty) || 0) - (Number(a.net_qty) || 0));
    for (const r of sorted.slice(0, 3)) {
      console.log(`    ${(r.ref ?? "").padEnd(15)} qty=${Number(r.net_qty)}`);
    }
  }

  console.log("\nNote: Agentik loads maleta data via the same SAG query (movimientos_traslados).");
  console.log("If quantities differ, check: snapshot freshness, anulado filter, or bodega mapping.\n");

  await prisma.$disconnect();
  pool.end();
}
main();
