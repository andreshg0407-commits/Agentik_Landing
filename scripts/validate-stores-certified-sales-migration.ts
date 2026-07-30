/**
 * scripts/validate-stores-certified-sales-migration.ts
 *
 * AGENTIK-STORES-CERTIFIED-SALES-MIGRATION-01 — DB validation gate.
 *
 * Certifies store sales against SaleRecord (canonical fuente→tienda) and
 * quantifies the San Diego April discrepancy (21.1M reported vs ~29M expected):
 *
 *   1. Per store × month × document family totals from SaleRecord.
 *   2. San Diego 2026-04 spotlight: FACTURA vs NOTA_CREDITO vs RECAUDO_POS,
 *      plus the legacy uncertified figure (CustomerOrderLine × warehouseId).
 *   3. Unattributed ALMACEN codes (VC, DA, AN, SI) — money visible at stores
 *      that cannot be attributed to a specific store yet.
 *
 * Run: npx tsx --env-file=.env scripts/validate-stores-certified-sales-migration.ts
 */

import { prisma } from "../lib/prisma";
import {
  CANONICAL_SALES_STORES,
  getCodesForStore,
  resolveCanonicalSalesSource,
} from "../lib/comercial/sales-canonical-source";
import { assembleStoreSales, type StoreSalesRawRow } from "../lib/comercial/tiendas/store-sales-assembly";

const YEAR_START = "2026-01-01";
const YEAR_END   = "2027-01-01";
const SPOTLIGHT_STORE = "san_diego";
const SPOTLIGHT_MONTH = "2026-04";
const REPORTED_LOW  = 21_100_000;
const EXPECTED_HIGH = 29_000_000;

const UNATTRIBUTED_ALMACEN_CODES = ["VC", "DA", "AN", "SI"];

function fmt(n: number): string {
  return "$" + Math.round(n).toLocaleString("es-CO");
}

async function main() {
  const db = prisma as any;

  const org = await db.organization.findFirst({
    where: { slug: process.env.VALIDATE_ORG_SLUG ?? "castillitos" },
    select: { id: true, slug: true },
  });
  if (!org) throw new Error("Organization not found (set VALIDATE_ORG_SLUG)");

  console.log(`\n═══ STORES-CERTIFIED-SALES-MIGRATION-01 — validación (${org.slug}) ═══\n`);

  // ── 1. Per store × month × code from SaleRecord ─────────────────────────────

  const allCodes = [
    ...CANONICAL_SALES_STORES.flatMap(s => getCodesForStore(s.storeId)),
    ...UNATTRIBUTED_ALMACEN_CODES,
  ];

  const raw = await db.$queryRawUnsafe(`
    SELECT DATE_TRUNC('month', s."saleDate") as month,
           s."rawJson"->>'code' as code,
           COUNT(*)::int as doc_count,
           SUM(s.amount::float)::float as amount
    FROM "SaleRecord" s
    WHERE s."organizationId" = $1
      AND s."saleDate" >= $2
      AND s."saleDate" < $3
      AND s."rawJson"->>'code' = ANY($4)
    GROUP BY 1, 2
    ORDER BY 1, 2
  `, org.id, YEAR_START, YEAR_END, allCodes) as any[];

  const rows: StoreSalesRawRow[] = raw.map(r => ({
    month:    r.month ? (r.month as Date).toISOString().slice(0, 7) : "????-??",
    code:     r.code ?? "",
    docCount: r.doc_count ?? 0,
    amount:   r.amount ?? 0,
  }));

  for (const store of CANONICAL_SALES_STORES) {
    const res = assembleStoreSales(store.storeId, 2026, rows);
    if (!res) continue;
    console.log(`── ${res.storeName} — 2026 certificado ──`);
    console.log(`   Neto: ${fmt(res.kpis.totalRevenue)} · ${res.kpis.invoiceCount} facturas · ` +
                `${res.kpis.creditNoteCount} NC · recaudos POS (aparte): ${fmt(res.kpis.totalPosReceiptRev)} (${res.kpis.posReceiptCount} docs)`);
    for (const m of res.monthly) {
      console.log(`   ${m.month}  neto ${fmt(m.revenue).padStart(15)}  ` +
                  `fact ${String(m.invoices).padStart(4)}  NC ${String(m.credits).padStart(3)}  ` +
                  `recaudos ${fmt(m.posReceiptRev).padStart(14)} (${m.posReceiptCount})`);
    }
    console.log("");
  }

  // ── 2. San Diego April spotlight ────────────────────────────────────────────

  console.log(`── SPOTLIGHT: San Diego ${SPOTLIGHT_MONTH} (reportado ${fmt(REPORTED_LOW)} vs esperado ~${fmt(EXPECTED_HIGH)}) ──`);

  const sdRows = rows.filter(r => r.month === SPOTLIGHT_MONTH);
  for (const r of sdRows) {
    const res = resolveCanonicalSalesSource(r.code);
    const storeName = res?.store?.storeName ?? "(sin tienda)";
    console.log(`   ${r.code}  ${res?.documentFamily ?? "?"}  ${storeName.padEnd(12)} ` +
                `${String(r.docCount).padStart(5)} docs  ${fmt(r.amount).padStart(15)}`);
  }

  const sd = assembleStoreSales(SPOTLIGHT_STORE, 2026, rows);
  const sdMonth = sd?.monthly.find(m => m.month === SPOTLIGHT_MONTH);
  if (sdMonth) {
    console.log(`\n   CERTIFICADO San Diego ${SPOTLIGHT_MONTH}:`);
    console.log(`     Facturas (FD):        ${fmt(sdMonth.grossRev)} (${sdMonth.invoices} docs)`);
    console.log(`     Notas crédito (NS):   ${fmt(sdMonth.creditRev)} (${sdMonth.credits} docs)`);
    console.log(`     NETO:                 ${fmt(sdMonth.revenue)}`);
    console.log(`     Recaudos POS (RS):    ${fmt(sdMonth.posReceiptRev)} (${sdMonth.posReceiptCount} docs) — NO suma al neto`);
    console.log(`     Neto + recaudos:      ${fmt(sdMonth.revenue + sdMonth.posReceiptRev)} (solo diagnóstico)`);
    const dLow  = sdMonth.revenue - REPORTED_LOW;
    const dHigh = sdMonth.revenue - EXPECTED_HIGH;
    console.log(`     Δ vs 21.1M: ${fmt(dLow)} · Δ vs 29M: ${fmt(dHigh)}`);
  } else {
    console.log(`   ⚠ Sin datos certificados para San Diego en ${SPOTLIGHT_MONTH}`);
  }

  // ── 3. Legacy uncertified figure (CustomerOrderLine × warehouseId) ─────────

  // San Diego warehouse PK = 11 (CANONICAL_STORE_IDENTITY in
  // store-distribution-service.ts — hardcoded here to avoid importing a
  // server-only module into a script).
  const SAN_DIEGO_WAREHOUSE_PK = 11;
  const legacy = await db.$queryRawUnsafe(`
    SELECT SUM(CASE WHEN l.quantity > 0 THEN l.quantity * l."unitValue" ELSE 0 END)::float as revenue,
           COUNT(DISTINCT r.id)::int as orders
    FROM "CustomerOrderLine" l
    JOIN "CustomerOrderRecord" r ON l."orderId" = r.id
    WHERE l."organizationId" = $1
      AND l."warehouseId" = $2
      AND r.status = 'FACTURADO'
      AND r."orderDate" >= '2026-04-01'
      AND r."orderDate" < '2026-05-01'
  `, org.id, SAN_DIEGO_WAREHOUSE_PK).catch(() => null) as any[] | null;

  if (legacy && legacy[0]) {
    console.log(`\n   LEGADO (CustomerOrderLine × warehouse "San Diego", abril): ` +
                `${fmt(legacy[0].revenue ?? 0)} en ${legacy[0].orders ?? 0} pedidos FACTURADO`);
  } else {
    console.log(`\n   LEGADO: no se pudo calcular (revisar join de bodega) — no bloquea la certificación.`);
  }

  // ── 4. Unattributed ALMACEN money in April ──────────────────────────────────

  const unattributed = sdRows.filter(r => UNATTRIBUTED_ALMACEN_CODES.includes(r.code));
  const unattrTotal = unattributed.reduce((s, r) => s + r.amount, 0);
  console.log(`\n   Dinero ALMACEN sin tienda en ${SPOTLIGHT_MONTH} (VC/DA/AN/SI): ${fmt(unattrTotal)}`);
  console.log(`   → Si Δ vs 29M ≈ este monto, la brecha es atribución pendiente, no ventas faltantes.\n`);

  console.log("═══ Fin de validación ═══\n");
}

main()
  .catch(err => { console.error(err); process.exit(1); })
  .finally(() => (prisma as any).$disconnect?.());
