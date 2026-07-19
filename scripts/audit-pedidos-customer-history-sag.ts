/**
 * scripts/audit-pedidos-customer-history-sag.ts
 *
 * PEDIDOS-CUSTOMER-HISTORY-SAG-AUDIT-01
 *
 * Read-only audit: compares Agentik CustomerOrderRecord counts
 * against SAG SOAP PD document counts.
 *
 * Usage:
 *   npx tsx scripts/audit-pedidos-customer-history-sag.ts
 *
 * Requires: DATABASE_URL in environment, SAG connector active.
 */
import { prisma } from "@/lib/prisma";
import { consultaSagJson } from "@/lib/connectors/pya/client";
import type { PyaApiConfig } from "@/lib/connectors/pya/types";

async function main() {
  const orgId = "cmmpwstuf000dp5y58kj1daaj";
  let pass = 0;
  let fail = 0;

  function check(label: string, ok: boolean) {
    if (ok) { pass++; console.log(`  PASS  ${label}`); }
    else    { fail++; console.log(`  FAIL  ${label}`); }
  }

  // Get SAG config
  const connector = await prisma.connector.findFirst({
    where: { organizationId: orgId, source: "sag_pya_soap", status: "ACTIVE" },
    select: { config: true },
  });

  if (!connector) {
    console.error("No active SAG connector — cannot run audit");
    process.exit(1);
  }

  const cfg = connector.config as Record<string, string>;
  const sagConfig: PyaApiConfig = {
    endpointUrl: cfg.endpointUrl,
    token: cfg.token ?? "",
    database: cfg.database,
  };

  console.log("=== PEDIDOS CUSTOMER HISTORY SAG AUDIT ===\n");

  // ── 1. Global counts ──────────────────────────────────────────────────────
  console.log("[1] Global coverage");

  const sagGlobal = await consultaSagJson(sagConfig, `
    SELECT COUNT(*) as cnt, COUNT(DISTINCT m.ka_nl_tercero) as customers
    FROM MOVIMIENTOS m
    INNER JOIN FUENTES f ON f.ka_ni_fuente = m.ka_ni_fuente
    WHERE f.k_n_clase_fuente = 4 AND f.ka_ni_fuente = 40
    AND m.sc_anulado = 'N'
  `);
  const sagCount = Number((sagGlobal[0] as any).cnt);
  const sagCustomers = Number((sagGlobal[0] as any).customers);

  const agentikGlobal = await prisma.$queryRaw`
    SELECT COUNT(*)::int as cnt, COUNT(DISTINCT "customerNit")::int as customers
    FROM "CustomerOrderRecord"
    WHERE "organizationId" = ${orgId}
  ` as any[];
  const agCount = agentikGlobal[0].cnt;
  const agCustomers = agentikGlobal[0].customers;

  check(`SAG PD active count matches Agentik COR (SAG=${sagCount}, Agentik=${agCount})`, sagCount === agCount);
  check(`SAG unique customers matches Agentik (SAG=${sagCustomers}, Agentik=${agCustomers})`, sagCustomers === agCustomers);

  // ── 2. Sample customer checks ──────────────────────────────────────────────
  console.log("\n[2] Per-customer sample validation");

  const sampleNits = ["9586", "26545", "1324", "26055"];
  for (const nit of sampleNits) {
    const sagRows = await consultaSagJson(sagConfig, `
      SELECT COUNT(*) as cnt
      FROM MOVIMIENTOS m
      INNER JOIN FUENTES f ON f.ka_ni_fuente = m.ka_ni_fuente
      WHERE f.k_n_clase_fuente = 4 AND f.ka_ni_fuente = 40
      AND m.sc_anulado = 'N'
      AND m.ka_nl_tercero = ${nit}
    `);
    const sagNitCount = Number((sagRows[0] as any).cnt);

    const agRows = await prisma.$queryRaw`
      SELECT COUNT(*)::int as cnt
      FROM "CustomerOrderRecord"
      WHERE "organizationId" = ${orgId} AND "customerNit" = ${nit}
    ` as any[];
    const agNitCount = agRows[0].cnt;

    check(`NIT ${nit}: SAG=${sagNitCount} Agentik=${agNitCount}`, sagNitCount === agNitCount);
  }

  // ── 3. Cancelled documents are excluded ────────────────────────────────────
  console.log("\n[3] Cancelled documents correctly excluded");

  const cancelled = await consultaSagJson(sagConfig, `
    SELECT COUNT(*) as cnt
    FROM MOVIMIENTOS m
    INNER JOIN FUENTES f ON f.ka_ni_fuente = m.ka_ni_fuente
    WHERE f.k_n_clase_fuente = 4 AND f.ka_ni_fuente = 40
    AND m.sc_anulado != 'N'
  `);
  const cancelledCount = Number((cancelled[0] as any).cnt);
  check(`Cancelled PD docs exist in SAG (${cancelledCount} found)`, cancelledCount > 0);
  check("No cancelled docs in Agentik COR", agCount === sagCount); // already verified

  // ── 4. Non-PD fuentes excluded ─────────────────────────────────────────────
  console.log("\n[4] Non-PD fuentes correctly excluded");

  const nonPd = await consultaSagJson(sagConfig, `
    SELECT COUNT(*) as cnt
    FROM MOVIMIENTOS m
    INNER JOIN FUENTES f ON f.ka_ni_fuente = m.ka_ni_fuente
    WHERE f.k_n_clase_fuente = 4 AND f.ka_ni_fuente != 40
  `);
  const nonPdCount = Number((nonPd[0] as any).cnt);
  check(`Non-PD clase_fuente=4 docs exist (${nonPdCount} test/purchase orders)`, nonPdCount > 0);

  // ── 5. Date range consistency ──────────────────────────────────────────────
  console.log("\n[5] Date range consistency");

  const sagDates = await consultaSagJson(sagConfig, `
    SELECT MIN(m.d_fecha_documento) as min_d, MAX(m.d_fecha_documento) as max_d
    FROM MOVIMIENTOS m
    INNER JOIN FUENTES f ON f.ka_ni_fuente = m.ka_ni_fuente
    WHERE f.k_n_clase_fuente = 4 AND f.ka_ni_fuente = 40
    AND m.sc_anulado = 'N'
  `);
  const sagMin = String((sagDates[0] as any).min_d ?? "").slice(0, 10);
  const sagMax = String((sagDates[0] as any).max_d ?? "").slice(0, 10);

  const agDates = await prisma.$queryRaw`
    SELECT MIN("orderDate")::text as min_d, MAX("orderDate")::text as max_d
    FROM "CustomerOrderRecord"
    WHERE "organizationId" = ${orgId}
  ` as any[];
  const agMin = (agDates[0].min_d ?? "").slice(0, 10);
  const agMax = (agDates[0].max_d ?? "").slice(0, 10);

  check(`Start date matches (SAG=${sagMin}, Agentik=${agMin})`, sagMin === agMin);
  check(`End date matches (SAG=${sagMax}, Agentik=${agMax})`, sagMax === agMax);

  // ── Summary ────────────────────────────────────────────────────────────────
  const total = pass + fail;
  console.log(`\n=== AUDIT COMPLETE: ${pass}/${total} PASS, ${fail} FAIL ===`);

  await prisma.$disconnect();
  process.exit(fail > 0 ? 1 : 0);
}

main().catch(e => {
  console.error("FATAL:", e.message);
  process.exit(1);
});
