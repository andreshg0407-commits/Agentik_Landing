/**
 * _activate-pd-lines-sync.ts
 *
 * INVENTORY-PENDING-ORDERS-ACTIVATION-01 — FASE 3+4
 *
 * Executes the PD order lines sync from SAG MOVIMIENTOS_ITEMS
 * and validates results.
 *
 * Usage: npx dotenv-cli -e .env -- npx tsx scripts/_activate-pd-lines-sync.ts
 */

import "dotenv/config";
import { prisma } from "@/lib/prisma";
import { loadSagTestEnv } from "@/lib/sag/env";
import { syncOrderLines } from "@/lib/connectors/adapters/sag-pya-soap/orders/sag-order-lines-sync";
import type { PyaApiConfig } from "@/lib/connectors/pya/types";

const CASTILLITOS_ORG_SLUG = "castillitos";

const B = (s: string) => `\x1b[1m${s}\x1b[0m`;
const G = (s: string) => `\x1b[32m${s}\x1b[0m`;
const R = (s: string) => `\x1b[31m${s}\x1b[0m`;
const Y = (s: string) => `\x1b[33m${s}\x1b[0m`;

async function main() {
  console.log("");
  console.log(B("═══════════════════════════════════════════════════════════════"));
  console.log(B("  PD LINES SYNC — INVENTORY-PENDING-ORDERS-ACTIVATION-01"));
  console.log(B("═══════════════════════════════════════════════════════════════"));
  console.log(`  Date: ${new Date().toISOString()}`);
  console.log("");

  // ── Setup ─────────────────────────────────────────────────────────────────
  const sagEnv = loadSagTestEnv();
  const sagConfig: PyaApiConfig = {
    endpointUrl: sagEnv.endpointUrl,
    token: sagEnv.token,
    database: sagEnv.database,
  };

  const db = prisma as any;
  const org = await db.organization.findUnique({
    where: { slug: CASTILLITOS_ORG_SLUG },
    select: { id: true, name: true },
  });
  if (!org) {
    console.error(R("ERROR: Castillitos org not found"));
    process.exit(1);
  }
  console.log(`  Org: ${org.name} (${org.id})`);

  // ── Pre-sync state ────────────────────────────────────────────────────────
  const preLinesCount: Array<{ count: number }> = await db.$queryRawUnsafe(
    `SELECT COUNT(*)::int as count FROM "CustomerOrderLine" WHERE "organizationId" = $1`,
    org.id,
  );
  console.log(`  Pre-sync CustomerOrderLine count: ${B(String(preLinesCount[0]?.count ?? 0))}`);
  console.log("");

  // ── FASE 3: Execute sync ──────────────────────────────────────────────────
  console.log(B("  FASE 3 — Executing PD Lines Sync"));
  console.log("  ─────────────────────────────────────────────────────────────");

  const result = await syncOrderLines({
    organizationId: org.id,
    sagConfig,
    sagDatabase: sagEnv.database,
    dryRun: false,
  });

  console.log(`  Orders scanned:      ${B(String(result.metrics.ordersScanned))}`);
  console.log(`  Lines read from SAG: ${B(String(result.metrics.linesRead))}`);
  console.log(`  Lines created:       ${G(String(result.metrics.linesCreated))}`);
  console.log(`  Lines updated:       ${Y(String(result.metrics.linesUpdated))}`);
  console.log(`  Lines errored:       ${result.metrics.linesErrored > 0 ? R(String(result.metrics.linesErrored)) : G("0")}`);
  console.log(`  Duration:            ${B(String(result.metrics.durationMs))} ms`);
  console.log(`  Success:             ${result.success ? G("YES") : R("NO")}`);

  if (result.metrics.errors.length > 0) {
    console.log(`  Errors:`);
    for (const e of result.metrics.errors.slice(0, 10)) {
      console.log(`    ${e.erpMovId ? `movId=${e.erpMovId}: ` : ""}${e.message}`);
    }
  }
  console.log("");

  // ── FASE 4: Validate CustomerOrderLine ────────────────────────────────────
  console.log(B("  FASE 4 — Validate CustomerOrderLine Data"));
  console.log("  ─────────────────────────────────────────────────────────────");

  const totalLines: Array<{ count: number }> = await db.$queryRawUnsafe(
    `SELECT COUNT(*)::int as count FROM "CustomerOrderLine" WHERE "organizationId" = $1`,
    org.id,
  );
  console.log(`  Total lines:            ${B(String(totalLines[0]?.count ?? 0))}`);

  const ordersWithLines: Array<{ count: number }> = await db.$queryRawUnsafe(
    `SELECT COUNT(DISTINCT "orderId")::int as count
     FROM "CustomerOrderLine" WHERE "organizationId" = $1`,
    org.id,
  );
  console.log(`  Orders with lines:      ${B(String(ordersWithLines[0]?.count ?? 0))}`);

  const uniqueRefs: Array<{ count: number }> = await db.$queryRawUnsafe(
    `SELECT COUNT(DISTINCT "referenceCode")::int as count
     FROM "CustomerOrderLine" col
     JOIN "CustomerOrderRecord" cor ON cor.id = col."orderId"
     WHERE col."organizationId" = $1 AND cor.status = 'PENDIENTE'`,
    org.id,
  );
  console.log(`  Unique refs (PENDIENTE): ${B(String(uniqueRefs[0]?.count ?? 0))}`);

  const totalPending: Array<{ total: number }> = await db.$queryRawUnsafe(
    `SELECT SUM(col."quantity")::float as total
     FROM "CustomerOrderLine" col
     JOIN "CustomerOrderRecord" cor ON cor.id = col."orderId"
     WHERE col."organizationId" = $1 AND cor.status = 'PENDIENTE'`,
    org.id,
  );
  console.log(`  Total pending qty:      ${B(String(Math.round(totalPending[0]?.total ?? 0)))}`);
  console.log("");

  // Top 20 references by pending qty
  const topRefs: Array<{ ref: string; qty: number; orders: number }> = await db.$queryRawUnsafe(
    `SELECT col."referenceCode" as ref,
            SUM(col."quantity")::float as qty,
            COUNT(DISTINCT col."orderId")::int as orders
     FROM "CustomerOrderLine" col
     JOIN "CustomerOrderRecord" cor ON cor.id = col."orderId"
     WHERE col."organizationId" = $1 AND cor.status = 'PENDIENTE'
     GROUP BY col."referenceCode"
     ORDER BY qty DESC
     LIMIT 20`,
    org.id,
  );
  if (topRefs.length > 0) {
    console.log(`  ${"REF".padEnd(16)} ${"QTY".padStart(8)} ${"ORDERS".padStart(8)}`);
    console.log(`  ${"─".repeat(16)} ${"─".repeat(8)} ${"─".repeat(8)}`);
    for (const r of topRefs) {
      console.log(`  ${r.ref.padEnd(16)} ${String(Math.round(r.qty)).padStart(8)} ${String(r.orders).padStart(8)}`);
    }
  } else {
    console.log(Y("  No pending order lines found — PD orders may not have lines in SAG"));
  }
  console.log("");

  // ── FASE 5: Validate 4 references ────────────────────────────────────────
  console.log(B("  FASE 5 — 4 Textile Reference Validation"));
  console.log("  ─────────────────────────────────────────────────────────────");
  console.log("");

  const AUDIT_REFS = [
    { sku: "L-1367", adminQty: 64 },
    { sku: "L-8467", adminQty: 511 },
    { sku: "CJ-1126012", adminQty: 79 },
    { sku: "CJ-2026004B", adminQty: 164 },
  ];

  for (const ref of AUDIT_REFS) {
    const grossRows: Array<{ quantity: number }> = await db.$queryRawUnsafe(
      `SELECT SUM("quantity")::float as quantity
       FROM "ProductInventoryLevel" pil
       JOIN "ProductEntity" pe ON pe.id = pil."productId"
       WHERE pil."organizationId" = $1
         AND pe.sku = $2
         AND pil."externalRef" = ANY($3::text[])`,
      org.id, ref.sku, ["01", "04"],
    );
    const gross = Math.round(grossRows[0]?.quantity ?? 0);

    const pendingRows: Array<{ pending: number }> = await db.$queryRawUnsafe(
      `SELECT SUM(col."quantity")::float as pending
       FROM "CustomerOrderLine" col
       JOIN "CustomerOrderRecord" cor ON cor.id = col."orderId"
       WHERE col."organizationId" = $1
         AND col."referenceCode" = $2
         AND cor.status = 'PENDIENTE'`,
      org.id, ref.sku,
    );
    const pending = Math.round(pendingRows[0]?.pending ?? 0);
    const disponible = gross - pending;
    const diffBefore = Math.abs(gross - ref.adminQty);
    const diffAfter = Math.abs(disponible - ref.adminQty);
    const improved = diffAfter < diffBefore;
    const improvePct = diffBefore > 0 ? Math.round((1 - diffAfter / diffBefore) * 100) : 0;

    console.log(`  ${ref.sku.padEnd(14)} ${improved ? G("[IMPROVED]") : Y("[NO CHANGE]")}`);
    console.log(`    B01+B04 gross:     ${String(gross).padStart(8)}`);
    console.log(`    PD pending:        ${String(pending).padStart(8)}`);
    console.log(`    Disponible:        ${B(String(disponible).padStart(8))}`);
    console.log(`    Admin:             ${String(ref.adminQty).padStart(8)}`);
    console.log(`    Gap BEFORE (no PD):${String(diffBefore).padStart(8)}`);
    console.log(`    Gap AFTER  (w/ PD):${String(diffAfter).padStart(8)}`);
    console.log(`    Improvement:       ${improved ? G(improvePct + "%") : Y("0%")}`);
    console.log("");
  }

  console.log(B("═══════════════════════════════════════════════════════════════"));
  console.log("");

  await prisma.$disconnect();
}

main().catch(e => {
  console.error(`FATAL: ${(e as Error).message}`);
  process.exit(1);
});
