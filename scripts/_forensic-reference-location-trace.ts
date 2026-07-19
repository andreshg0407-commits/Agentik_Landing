/**
 * _forensic-reference-location-trace.ts
 *
 * INVENTORY-REFERENCE-LOCATION-TRACE-01
 *
 * READ ONLY forensic script — zero database writes.
 *
 * Traces the exact physical location of CJ-1126012 and CJ-2026004B
 * across ALL SAG bodegas. Determines where the 36 and 25 unit gaps
 * between Agentik and admin values originate.
 *
 * Usage:
 *   npx dotenv-cli -e .env -- npx tsx scripts/_forensic-reference-location-trace.ts
 */

import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";

const ORG = "cmmpwstuf000dp5y58kj1daaj";

const B = (s: string) => `\x1b[1m${s}\x1b[0m`;
const G = (s: string) => `\x1b[32m${s}\x1b[0m`;
const R = (s: string) => `\x1b[31m${s}\x1b[0m`;
const Y = (s: string) => `\x1b[33m${s}\x1b[0m`;
const D = (s: string) => `\x1b[2m${s}\x1b[0m`;

const AUDIT_REFS = [
  { sku: "CJ-1126012", adminQty: 79, agentikQty: 115, gap: 36 },
  { sku: "CJ-2026004B", adminQty: 164, agentikQty: 189, gap: 25 },
];

const CONTROL_REFS = [
  { sku: "L-1367", adminQty: 64, agentikQty: 68, gap: 4 },
  { sku: "L-8467", adminQty: 511, agentikQty: 515, gap: 4 },
];

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter } as any);
  const db = prisma as any;

  console.log("");
  console.log(B("==============================================================="));
  console.log(B("  INVENTORY-REFERENCE-LOCATION-TRACE-01"));
  console.log(B("  MODE: READ ONLY — zero database writes"));
  console.log(B("==============================================================="));
  console.log("");

  // ══════════════════════════════════════════════════════════════════════════
  // FASE 1 — TOPOLOGIA COMPLETA DE BODEGAS
  // ══════════════════════════════════════════════════════════════════════════

  console.log(B("  FASE 1 — TOPOLOGIA COMPLETA DE BODEGAS"));
  console.log("");

  const bodegas: Array<{
    externalRef: string;
    product_count: number;
    total_qty: number;
  }> = await db.$queryRawUnsafe(
    `SELECT "externalRef",
            COUNT(DISTINCT "productId")::int AS product_count,
            SUM("quantity")::float AS total_qty
     FROM "ProductInventoryLevel"
     WHERE "organizationId" = $1
     GROUP BY "externalRef"
     ORDER BY "externalRef"`,
    ORG,
  );

  console.log(`  ${"Bodega".padEnd(10)} ${"Productos".padStart(10)} ${"Saldo Neto".padStart(14)}`);
  console.log(`  ${"─".repeat(10)} ${"─".repeat(10)} ${"─".repeat(14)}`);

  let totalProducts = 0;
  let totalQty = 0;

  for (const b of bodegas) {
    const code = `B${b.externalRef.padStart(2, "0")}`;
    const qty = Math.round(b.total_qty);
    const qtyStr = qty >= 0 ? G(String(qty).padStart(14)) : R(String(qty).padStart(14));
    console.log(`  ${code.padEnd(10)} ${String(b.product_count).padStart(10)} ${qtyStr}`);
    totalProducts += b.product_count;
    totalQty += qty;
  }

  console.log(`  ${"─".repeat(10)} ${"─".repeat(10)} ${"─".repeat(14)}`);
  console.log(`  ${"TOTAL".padEnd(10)} ${String(bodegas.length).padStart(10)} ${String(Math.round(totalQty)).padStart(14)}`);
  console.log(`  Bodegas unicas: ${B(String(bodegas.length))}`);
  console.log("");

  // Classify bodegas
  const bodegaClassification: Record<string, string> = {};
  for (const b of bodegas) {
    const code = b.externalRef;
    const qty = Math.round(b.total_qty);
    let role = "desconocida";
    if (code === "01") role = "central_despacho";
    else if (code === "04") role = "produccion_soporte";
    else if (code === "00") role = "ajustes";
    else if (["02", "03", "23", "29"].includes(code)) role = "vendedor";
    else if (["08", "09", "10", "11", "12", "13", "14", "15"].includes(code)) role = "tienda";
    else if (code === "22") role = "punto_venta";
    else if (code === "24") role = "importacion_despacho";
    else if (["26", "27", "42", "43", "44", "45", "46", "47", "48", "49"].includes(code)) role = "importacion_almacen";
    else if (["20", "28", "41"].includes(code)) role = "otra";
    bodegaClassification[code] = role;
  }

  console.log(B("  CLASIFICACION DE BODEGAS"));
  console.log("");
  for (const b of bodegas) {
    const code = `B${b.externalRef.padStart(2, "0")}`;
    const role = bodegaClassification[b.externalRef] ?? "desconocida";
    console.log(`  ${code.padEnd(6)} → ${role}`);
  }
  console.log("");

  // ══════════════════════════════════════════════════════════════════════════
  // FASE 2 — TRACE CJ-1126012
  // ══════════════════════════════════════════════════════════════════════════

  console.log(B("  FASE 2 — TRACE CJ-1126012 (todas las bodegas)"));
  console.log("");

  await traceReference(db, "CJ-1126012", 79);

  // ══════════════════════════════════════════════════════════════════════════
  // FASE 3 — TRACE CJ-2026004B
  // ══════════════════════════════════════════════════════════════════════════

  console.log(B("  FASE 3 — TRACE CJ-2026004B (todas las bodegas)"));
  console.log("");

  await traceReference(db, "CJ-2026004B", 164);

  // ══════════════════════════════════════════════════════════════════════════
  // FASE 4 — RECONSTRUCCION
  // ══════════════════════════════════════════════════════════════════════════

  console.log(B("  FASE 4 — RECONSTRUCCION ESTRUCTURAL"));
  console.log("");

  for (const ref of AUDIT_REFS) {
    await reconstructReference(db, ref.sku, ref.adminQty);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // FASE 5 — MOVIMIENTOS RECIENTES CJ-1126012
  // ══════════════════════════════════════════════════════════════════════════

  console.log(B("  FASE 5 — MOVIMIENTOS RECIENTES CJ-1126012 (ultimos 30 dias)"));
  console.log("");

  await traceMovements(db, "CJ-1126012");

  // ══════════════════════════════════════════════════════════════════════════
  // FASE 6 — MOVIMIENTOS RECIENTES CJ-2026004B
  // ══════════════════════════════════════════════════════════════════════════

  console.log(B("  FASE 6 — MOVIMIENTOS RECIENTES CJ-2026004B (ultimos 30 dias)"));
  console.log("");

  await traceMovements(db, "CJ-2026004B");

  // ══════════════════════════════════════════════════════════════════════════
  // FASE 7 — BODEGAS EXCLUIDAS
  // ══════════════════════════════════════════════════════════════════════════

  console.log(B("  FASE 7 — BODEGAS QUE NO DEBERIAN ENTRAR EN DISPONIBLE COMERCIAL"));
  console.log("");

  // For each bodega, check if it has stock for audit refs
  const excludeCandidates: Array<{
    code: string;
    role: string;
    totalQty: number;
    hasAuditRefs: boolean;
    reason: string;
  }> = [];

  for (const b of bodegas) {
    const code = b.externalRef;
    if (code === "01" || code === "04") continue; // always included

    const role = bodegaClassification[code] ?? "desconocida";
    const qty = Math.round(b.total_qty);

    // Check if any audit ref exists in this bodega
    const auditCheck: Array<{ cnt: number }> = await db.$queryRawUnsafe(
      `SELECT COUNT(*)::int AS cnt
       FROM "ProductInventoryLevel" pil
       JOIN "ProductEntity" pe ON pe.id = pil."productId"
       WHERE pil."organizationId" = $1
         AND pil."externalRef" = $2
         AND pe.sku IN ('CJ-1126012', 'CJ-2026004B', 'L-1367', 'L-8467')`,
      ORG,
      code,
    );

    let reason = "";
    if (role === "ajustes") reason = "Ajustes contables — no es stock fisico vendible";
    else if (role === "vendedor") reason = "Stock despachado a vendedor — ya salio del central";
    else if (role === "tienda") reason = "Stock fisico en tienda — inventario separado";
    else if (role === "punto_venta") reason = "Stock en punto de venta — inventario separado";
    else if (role === "importacion_despacho") reason = "Importacion en transito — no disponible para venta local";
    else if (role === "importacion_almacen") reason = "Almacen de importacion — no es stock comercial textil";
    else if (role === "otra") reason = "Proposito desconocido — requiere confirmacion admin";
    else reason = "Sin clasificacion — requiere confirmacion admin";

    excludeCandidates.push({
      code,
      role,
      totalQty: qty,
      hasAuditRefs: (auditCheck[0]?.cnt ?? 0) > 0,
      reason,
    });
  }

  console.log(`  ${"Bodega".padEnd(8)} ${"Rol".padEnd(25)} ${"Saldo".padStart(10)} ${"Audit Refs?".padEnd(12)} Razon`);
  console.log(`  ${"─".repeat(8)} ${"─".repeat(25)} ${"─".repeat(10)} ${"─".repeat(12)} ${"─".repeat(40)}`);

  for (const c of excludeCandidates) {
    const code = `B${c.code.padStart(2, "0")}`;
    const qty = c.totalQty >= 0 ? String(c.totalQty) : R(String(c.totalQty));
    console.log(`  ${code.padEnd(8)} ${c.role.padEnd(25)} ${String(c.totalQty).padStart(10)} ${(c.hasAuditRefs ? Y("SI") : "NO").padEnd(12)} ${c.reason}`);
  }
  console.log("");

  // ══════════════════════════════════════════════════════════════════════════
  // FASE 8 — RECONSTRUCCION ADMIN
  // ══════════════════════════════════════════════════════════════════════════

  console.log(B("  FASE 8 — RECONSTRUCCION DEL VALOR ADMINISTRATIVO"));
  console.log("");

  for (const ref of AUDIT_REFS) {
    await reconstructAdminValue(db, ref.sku, ref.adminQty);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // FASE 9 — HALLAZGO PRINCIPAL
  // ══════════════════════════════════════════════════════════════════════════

  console.log(B("  FASE 9 — HALLAZGO PRINCIPAL"));
  console.log("");

  // Gather data for analysis
  for (const ref of AUDIT_REFS) {
    const allBodegas: Array<{ externalRef: string; qty: number }> = await db.$queryRawUnsafe(
      `SELECT pil."externalRef", SUM(pil."quantity")::float AS qty
       FROM "ProductInventoryLevel" pil
       JOIN "ProductEntity" pe ON pe.id = pil."productId"
       WHERE pil."organizationId" = $1 AND pe.sku = $2
       GROUP BY pil."externalRef"
       ORDER BY pil."externalRef"`,
      ORG,
      ref.sku,
    );

    const b01 = Math.round(allBodegas.find(b => b.externalRef === "01")?.qty ?? 0);
    const b04 = Math.round(allBodegas.find(b => b.externalRef === "04")?.qty ?? 0);
    const central = b01 + b04;
    const nonCentral = allBodegas
      .filter(b => b.externalRef !== "01" && b.externalRef !== "04")
      .reduce((sum, b) => sum + Math.round(b.qty), 0);

    // PD pending
    const pdQty: Array<{ qty: number }> = await db.$queryRawUnsafe(
      `SELECT COALESCE(SUM(col."quantity"), 0)::float AS qty
       FROM "CustomerOrderLine" col
       JOIN "CustomerOrderRecord" cor ON cor.id = col."orderId"
       WHERE col."organizationId" = $1
         AND col."referenceCode" = $2
         AND cor.status = 'PENDIENTE'`,
      ORG,
      ref.sku,
    );
    const pd = Math.round(pdQty[0]?.qty ?? 0);

    console.log(B(`  ${ref.sku}:`));
    console.log(`    B01:              ${b01}`);
    console.log(`    B04:              ${b04}`);
    console.log(`    Central (B01+B04): ${central}`);
    console.log(`    Non-central:      ${nonCentral}`);
    console.log(`    PD pendiente:     ${pd}`);
    console.log(`    Agentik disp:     ${central - pd} (B01+B04 - PD)`);
    console.log(`    Admin reporta:    ${ref.adminQty}`);
    console.log(`    Gap:              ${central - pd - ref.adminQty}`);
    console.log("");

    // Hypothesis: Admin uses B01 only
    const b01Only = b01 - pd;
    console.log(`    Hipotesis B01 only:     ${b01Only} (admin=${ref.adminQty}, diff=${b01Only - ref.adminQty})`);
    // Hypothesis: Admin uses B01 + non-central negative
    console.log(`    Hipotesis B01+non-central: ${b01 + nonCentral - pd} (admin=${ref.adminQty}, diff=${b01 + nonCentral - pd - ref.adminQty})`);
    // Hypothesis: Admin uses all bodegas
    const allTotal = central + nonCentral;
    console.log(`    Hipotesis all bodegas:  ${allTotal - pd} (admin=${ref.adminQty}, diff=${allTotal - pd - ref.adminQty})`);
    console.log("");
  }

  // ══════════════════════════════════════════════════════════════════════════
  // FASE 10 — VALIDAR L-1367 Y L-8467 (CONTROL)
  // ══════════════════════════════════════════════════════════════════════════

  console.log(B("  FASE 10 — GRUPO DE CONTROL (L-1367, L-8467)"));
  console.log("");

  for (const ref of CONTROL_REFS) {
    console.log(B(`  ${ref.sku} (admin=${ref.adminQty}, agentik=${ref.agentikQty}, gap=${ref.gap}):`));

    const allBodegas: Array<{ externalRef: string; qty: number }> = await db.$queryRawUnsafe(
      `SELECT pil."externalRef", SUM(pil."quantity")::float AS qty
       FROM "ProductInventoryLevel" pil
       JOIN "ProductEntity" pe ON pe.id = pil."productId"
       WHERE pil."organizationId" = $1 AND pe.sku = $2
       GROUP BY pil."externalRef"
       ORDER BY pil."externalRef"`,
      ORG,
      ref.sku,
    );

    for (const b of allBodegas) {
      const code = `B${b.externalRef.padStart(2, "0")}`;
      const qty = Math.round(b.qty);
      const qtyStr = qty >= 0 ? G(String(qty)) : R(String(qty));
      console.log(`    ${code.padEnd(6)} ${qtyStr}`);
    }

    const b01 = Math.round(allBodegas.find(b => b.externalRef === "01")?.qty ?? 0);
    const b04 = Math.round(allBodegas.find(b => b.externalRef === "04")?.qty ?? 0);
    const central = b01 + b04;
    const nonCentral = allBodegas
      .filter(b => b.externalRef !== "01" && b.externalRef !== "04")
      .reduce((sum, b) => sum + Math.round(b.qty), 0);

    const pdQty: Array<{ qty: number }> = await db.$queryRawUnsafe(
      `SELECT COALESCE(SUM(col."quantity"), 0)::float AS qty
       FROM "CustomerOrderLine" col
       JOIN "CustomerOrderRecord" cor ON cor.id = col."orderId"
       WHERE col."organizationId" = $1
         AND col."referenceCode" = $2
         AND cor.status = 'PENDIENTE'`,
      ORG,
      ref.sku,
    );
    const pd = Math.round(pdQty[0]?.qty ?? 0);

    console.log(`    Central (B01+B04): ${central}, Non-central: ${nonCentral}, PD: ${pd}`);
    console.log(`    Agentik: ${central - pd}, Admin: ${ref.adminQty}, Gap: ${central - pd - ref.adminQty}`);

    // Key insight: do these have B04 stock?
    console.log(`    ${b04 === 0 ? G("Sin stock en B04 — no hay ambiguedad produccion") : Y(`B04=${b04} — produccion presente`)}`);
    console.log("");
  }

  // ══════════════════════════════════════════════════════════════════════════
  // FASE 11 — VEREDICTO
  // ══════════════════════════════════════════════════════════════════════════

  console.log(B("  FASE 11 — VEREDICTO"));
  console.log("");

  // CRM drafts check
  for (const ref of AUDIT_REFS) {
    const crmQty: Array<{ qty: number }> = await db.$queryRawUnsafe(
      `SELECT COALESCE(SUM(cql.qty), 0)::float AS qty
       FROM "CRMQuoteLine" cql
       JOIN "CRMQuote" cq ON cq.id = cql."quoteId"
       WHERE cql."organizationId" = $1
         AND cql."reference" = $2
         AND cq.status = 'DRAFT'`,
      ORG,
      ref.sku,
    );
    const crm = Math.round(crmQty[0]?.qty ?? 0);
    console.log(`  ${ref.sku}: CRM DRAFT reservations = ${crm}`);
  }

  for (const ref of CONTROL_REFS) {
    const crmQty: Array<{ qty: number }> = await db.$queryRawUnsafe(
      `SELECT COALESCE(SUM(cql.qty), 0)::float AS qty
       FROM "CRMQuoteLine" cql
       JOIN "CRMQuote" cq ON cq.id = cql."quoteId"
       WHERE cql."organizationId" = $1
         AND cql."reference" = $2
         AND cq.status = 'DRAFT'`,
      ORG,
      ref.sku,
    );
    const crm = Math.round(crmQty[0]?.qty ?? 0);
    console.log(`  ${ref.sku}: CRM DRAFT reservations = ${crm}`);
  }
  console.log("");

  // Final summary
  console.log(B("  RESUMEN FINAL"));
  console.log(B("==============================================================="));

  for (const ref of [...AUDIT_REFS, ...CONTROL_REFS]) {
    const allBodegas: Array<{ externalRef: string; qty: number }> = await db.$queryRawUnsafe(
      `SELECT pil."externalRef", SUM(pil."quantity")::float AS qty
       FROM "ProductInventoryLevel" pil
       JOIN "ProductEntity" pe ON pe.id = pil."productId"
       WHERE pil."organizationId" = $1 AND pe.sku = $2
       GROUP BY pil."externalRef"
       ORDER BY pil."externalRef"`,
      ORG,
      ref.sku,
    );

    const b01 = Math.round(allBodegas.find(b => b.externalRef === "01")?.qty ?? 0);
    const b04 = Math.round(allBodegas.find(b => b.externalRef === "04")?.qty ?? 0);

    const pdQty: Array<{ qty: number }> = await db.$queryRawUnsafe(
      `SELECT COALESCE(SUM(col."quantity"), 0)::float AS qty
       FROM "CustomerOrderLine" col
       JOIN "CustomerOrderRecord" cor ON cor.id = col."orderId"
       WHERE col."organizationId" = $1
         AND col."referenceCode" = $2
         AND cor.status = 'PENDIENTE'`,
      ORG,
      ref.sku,
    );
    const pd = Math.round(pdQty[0]?.qty ?? 0);

    const crmQty: Array<{ qty: number }> = await db.$queryRawUnsafe(
      `SELECT COALESCE(SUM(cql.qty), 0)::float AS qty
       FROM "CRMQuoteLine" cql
       JOIN "CRMQuote" cq ON cq.id = cql."quoteId"
       WHERE cql."organizationId" = $1
         AND cql."reference" = $2
         AND cq.status = 'DRAFT'`,
      ORG,
      ref.sku,
    );
    const crm = Math.round(crmQty[0]?.qty ?? 0);

    const nonCentral = allBodegas
      .filter(b => b.externalRef !== "01" && b.externalRef !== "04")
      .reduce((sum, b) => sum + Math.round(b.qty), 0);

    console.log(`  ${ref.sku.padEnd(14)} B01=${String(b01).padStart(5)} B04=${String(b04).padStart(5)} other=${String(nonCentral).padStart(5)} PD=${String(pd).padStart(3)} CRM=${String(crm).padStart(4)} Agentik=${String(b01 + b04 - pd).padStart(5)} Admin=${String(ref.adminQty).padStart(5)} Gap=${String(b01 + b04 - pd - ref.adminQty).padStart(4)}`);
  }

  console.log("");
  console.log(B("==============================================================="));
  console.log("");

  await prisma.$disconnect();
  pool.end();
}

// ── Helper: Trace a reference across all bodegas ─────────────────────────────

async function traceReference(db: any, sku: string, adminQty: number) {
  const allBodegas: Array<{
    externalRef: string;
    warehouseId: string;
    qty: number;
    variant_count: number;
  }> = await db.$queryRawUnsafe(
    `SELECT pil."externalRef",
            pil."warehouseId",
            SUM(pil."quantity")::float AS qty,
            COUNT(DISTINCT pil."variantId")::int AS variant_count
     FROM "ProductInventoryLevel" pil
     JOIN "ProductEntity" pe ON pe.id = pil."productId"
     WHERE pil."organizationId" = $1 AND pe.sku = $2
     GROUP BY pil."externalRef", pil."warehouseId"
     ORDER BY pil."externalRef"`,
    ORG,
    sku,
  );

  if (allBodegas.length === 0) {
    console.log(R(`  ${sku}: No se encontro en ninguna bodega.`));
    console.log("");
    return;
  }

  console.log(`  ${"Bodega".padEnd(8)} ${"Variantes".padStart(10)} ${"Cantidad".padStart(10)}`);
  console.log(`  ${"─".repeat(8)} ${"─".repeat(10)} ${"─".repeat(10)}`);

  let total = 0;
  let positiveTotal = 0;
  let negativeTotal = 0;

  for (const b of allBodegas) {
    const code = `B${b.externalRef.padStart(2, "0")}`;
    const qty = Math.round(b.qty);
    const qtyStr = qty >= 0 ? G(String(qty).padStart(10)) : R(String(qty).padStart(10));
    console.log(`  ${code.padEnd(8)} ${String(b.variant_count).padStart(10)} ${qtyStr}`);
    total += qty;
    if (qty > 0) positiveTotal += qty;
    else negativeTotal += qty;
  }

  console.log(`  ${"─".repeat(8)} ${"─".repeat(10)} ${"─".repeat(10)}`);
  console.log(`  ${"TOTAL".padEnd(8)} ${" ".repeat(10)} ${String(total).padStart(10)}`);
  console.log(`  Positivo: ${G(String(positiveTotal))}, Negativo: ${R(String(negativeTotal))}`);
  console.log(`  Admin reporta: ${B(String(adminQty))}`);
  console.log("");

  // Per-variant breakdown for the top bodegas
  const variantDetail: Array<{
    externalRef: string;
    variantName: string;
    qty: number;
  }> = await db.$queryRawUnsafe(
    `SELECT pil."externalRef",
            pv.name AS "variantName",
            pil."quantity"::float AS qty
     FROM "ProductInventoryLevel" pil
     JOIN "ProductEntity" pe ON pe.id = pil."productId"
     JOIN "ProductVariant" pv ON pv.id = pil."variantId"
     WHERE pil."organizationId" = $1 AND pe.sku = $2
     ORDER BY pil."externalRef", pv.name`,
    ORG,
    sku,
  );

  if (variantDetail.length > 0 && variantDetail.length <= 80) {
    console.log(D(`  Detalle por variante (${variantDetail.length} registros):`));
    let currentBodega = "";
    for (const v of variantDetail) {
      if (v.externalRef !== currentBodega) {
        currentBodega = v.externalRef;
        console.log(B(`    B${currentBodega.padStart(2, "0")}:`));
      }
      const qty = Math.round(v.qty);
      const qtyStr = qty >= 0 ? G(String(qty)) : R(String(qty));
      console.log(`      ${(v.variantName ?? "?").slice(0, 40).padEnd(42)} ${qtyStr}`);
    }
    console.log("");
  }
}

// ── Helper: Reconstruct reference stock by segment ───────────────────────────

async function reconstructReference(db: any, sku: string, adminQty: number) {
  const allBodegas: Array<{ externalRef: string; qty: number }> = await db.$queryRawUnsafe(
    `SELECT pil."externalRef", SUM(pil."quantity")::float AS qty
     FROM "ProductInventoryLevel" pil
     JOIN "ProductEntity" pe ON pe.id = pil."productId"
     WHERE pil."organizationId" = $1 AND pe.sku = $2
     GROUP BY pil."externalRef"
     ORDER BY pil."externalRef"`,
    ORG,
    sku,
  );

  const byCode = new Map<string, number>();
  for (const b of allBodegas) {
    byCode.set(b.externalRef, Math.round(b.qty));
  }

  const b01 = byCode.get("01") ?? 0;
  const b04 = byCode.get("04") ?? 0;

  const tiendas = ["08", "09", "10", "11", "12", "13", "14", "15", "22"]
    .reduce((s, c) => s + (byCode.get(c) ?? 0), 0);
  const vendedores = ["02", "03", "23", "29"]
    .reduce((s, c) => s + (byCode.get(c) ?? 0), 0);
  const importacion = ["24", "26", "27", "42", "43", "44", "45", "46", "47", "48", "49"]
    .reduce((s, c) => s + (byCode.get(c) ?? 0), 0);
  const ajustes = byCode.get("00") ?? 0;
  const otras = Array.from(byCode.entries())
    .filter(([c]) => !["01", "04", "00", "02", "03", "23", "29", "08", "09", "10", "11", "12", "13", "14", "15", "22", "24", "26", "27", "42", "43", "44", "45", "46", "47", "48", "49"].includes(c))
    .reduce((s, [, v]) => s + v, 0);

  const stockTotal = Array.from(byCode.values()).reduce((s, v) => s + v, 0);

  // PD pending
  const pdQty: Array<{ qty: number }> = await db.$queryRawUnsafe(
    `SELECT COALESCE(SUM(col."quantity"), 0)::float AS qty
     FROM "CustomerOrderLine" col
     JOIN "CustomerOrderRecord" cor ON cor.id = col."orderId"
     WHERE col."organizationId" = $1
       AND col."referenceCode" = $2
       AND cor.status = 'PENDIENTE'`,
    ORG,
    sku,
  );
  const pd = Math.round(pdQty[0]?.qty ?? 0);

  console.log(B(`  ${sku}:`));
  console.log(`    stock_b01:          ${b01}`);
  console.log(`    stock_b04:          ${b04}`);
  console.log(`    stock_central:      ${b01 + b04}`);
  console.log(`    stock_tiendas:      ${tiendas}`);
  console.log(`    stock_vendedores:   ${vendedores}`);
  console.log(`    stock_importacion:  ${importacion}`);
  console.log(`    stock_ajustes:      ${ajustes}`);
  console.log(`    stock_otras:        ${otras}`);
  console.log(`    stock_total:        ${stockTotal}`);
  console.log(`    pd_pendiente:       ${pd}`);
  console.log(`    disponible_agentik: ${b01 + b04 - pd}`);
  console.log(`    admin_reporta:      ${adminQty}`);
  console.log(`    gap:                ${b01 + b04 - pd - adminQty}`);
  console.log("");
}

// ── Helper: Trace recent movements ──────────────────────────────────────────

async function traceMovements(db: any, sku: string) {
  // Check SaleRecord for recent movements
  const recentSales: Array<{
    saleDate: Date;
    comprobanteCode: string;
    sagDocumentFamily: string;
    totalAmount: number;
    customerNit: string;
  }> = await db.$queryRawUnsafe(
    `SELECT sr."saleDate", sr."comprobanteCode", sr."sagDocumentFamily",
            sr."amount"::float AS "totalAmount", sr."customerNit"
     FROM "SaleRecord" sr
     WHERE sr."organizationId" = $1
       AND sr."saleDate" >= NOW() - INTERVAL '30 days'
       AND sr."customerNit" IN (
         SELECT DISTINCT cor."customerNit"
         FROM "CustomerOrderLine" col
         JOIN "CustomerOrderRecord" cor ON cor.id = col."orderId"
         WHERE col."organizationId" = $1 AND col."referenceCode" = $2
       )
     ORDER BY sr."saleDate" DESC
     LIMIT 30`,
    ORG,
    sku,
  );

  console.log(`  SaleRecords recientes (clientes que pidieron ${sku}): ${recentSales.length}`);
  if (recentSales.length > 0) {
    console.log(`  ${"Fecha".padEnd(12)} ${"Comprobante".padEnd(12)} ${"Familia".padEnd(22)} ${"Monto".padStart(12)} ${"NIT".padEnd(15)}`);
    console.log(`  ${"─".repeat(12)} ${"─".repeat(12)} ${"─".repeat(22)} ${"─".repeat(12)} ${"─".repeat(15)}`);
    for (const s of recentSales.slice(0, 15)) {
      const date = s.saleDate instanceof Date ? s.saleDate.toISOString().slice(0, 10) : String(s.saleDate).slice(0, 10);
      console.log(`  ${date.padEnd(12)} ${(s.comprobanteCode ?? "?").padEnd(12)} ${(s.sagDocumentFamily ?? "?").padEnd(22)} ${String(Math.round(s.totalAmount)).padStart(12)} ${(s.customerNit ?? "?").padEnd(15)}`);
    }
  }
  console.log("");

  // Check CustomerOrderRecord for recent PD orders
  const recentPD: Array<{
    orderDate: Date;
    status: string;
    customerNit: string;
    qty: number;
    orderNumber: string;
  }> = await db.$queryRawUnsafe(
    `SELECT cor."orderDate", cor.status, cor."customerNit",
            col."quantity"::float AS qty, cor."orderNumber"
     FROM "CustomerOrderLine" col
     JOIN "CustomerOrderRecord" cor ON cor.id = col."orderId"
     WHERE col."organizationId" = $1
       AND col."referenceCode" = $2
       AND cor."orderDate" >= NOW() - INTERVAL '30 days'
     ORDER BY cor."orderDate" DESC`,
    ORG,
    sku,
  );

  console.log(`  PD orders recientes para ${sku}: ${recentPD.length}`);
  if (recentPD.length > 0) {
    console.log(`  ${"Fecha".padEnd(12)} ${"Status".padEnd(12)} ${"OrderNum".padEnd(12)} ${"Qty".padStart(6)} ${"NIT".padEnd(15)}`);
    console.log(`  ${"─".repeat(12)} ${"─".repeat(12)} ${"─".repeat(12)} ${"─".repeat(6)} ${"─".repeat(15)}`);
    for (const pd of recentPD) {
      const date = pd.orderDate instanceof Date ? pd.orderDate.toISOString().slice(0, 10) : String(pd.orderDate).slice(0, 10);
      console.log(`  ${date.padEnd(12)} ${pd.status.padEnd(12)} ${(pd.orderNumber ?? "?").padEnd(12)} ${String(Math.round(pd.qty)).padStart(6)} ${(pd.customerNit ?? "?").padEnd(15)}`);
    }
  }
  console.log("");

  // Check CRM quotes
  const crmQuotes: Array<{
    status: string;
    warehouseName: string;
    qty: number;
  }> = await db.$queryRawUnsafe(
    `SELECT cq.status, cql."warehouseName",
            cql.qty::float AS qty
     FROM "CRMQuoteLine" cql
     JOIN "CRMQuote" cq ON cq.id = cql."quoteId"
     WHERE cql."organizationId" = $1
       AND cql."reference" = $2
     ORDER BY cq.status, cql."warehouseName"`,
    ORG,
    sku,
  );

  if (crmQuotes.length > 0) {
    // Aggregate by status + warehouseName
    const crmAgg = new Map<string, number>();
    for (const cq of crmQuotes) {
      const key = `${cq.status}|${cq.warehouseName ?? "?"}`;
      crmAgg.set(key, (crmAgg.get(key) ?? 0) + Math.round(cq.qty));
    }
    console.log(`  CRM quotes para ${sku}: ${crmQuotes.length} lineas`);
    console.log(`  ${"Status".padEnd(12)} ${"Bodega/Label".padEnd(30)} ${"Qty Total".padStart(10)}`);
    console.log(`  ${"─".repeat(12)} ${"─".repeat(30)} ${"─".repeat(10)}`);
    for (const [key, qty] of crmAgg) {
      const [status, label] = key.split("|");
      console.log(`  ${status.padEnd(12)} ${label.padEnd(30)} ${String(qty).padStart(10)}`);
    }
  } else {
    console.log(`  CRM quotes para ${sku}: 0`);
  }
  console.log("");

  // Check PIL syncedAt for freshness
  const pilSync: Array<{ syncedAt: Date; externalRef: string }> = await db.$queryRawUnsafe(
    `SELECT DISTINCT pil."syncedAt", pil."externalRef"
     FROM "ProductInventoryLevel" pil
     JOIN "ProductEntity" pe ON pe.id = pil."productId"
     WHERE pil."organizationId" = $1 AND pe.sku = $2
     ORDER BY pil."syncedAt" DESC
     LIMIT 5`,
    ORG,
    sku,
  );

  if (pilSync.length > 0) {
    console.log(`  PIL syncedAt para ${sku}:`);
    for (const p of pilSync) {
      const syncDate = p.syncedAt instanceof Date ? p.syncedAt.toISOString() : String(p.syncedAt);
      console.log(`    B${p.externalRef.padStart(2, "0")}: ${syncDate}`);
    }
  }
  console.log("");
}

// ── Helper: Reconstruct admin value ─────────────────────────────────────────

async function reconstructAdminValue(db: any, sku: string, adminQty: number) {
  const allBodegas: Array<{ externalRef: string; qty: number }> = await db.$queryRawUnsafe(
    `SELECT pil."externalRef", SUM(pil."quantity")::float AS qty
     FROM "ProductInventoryLevel" pil
     JOIN "ProductEntity" pe ON pe.id = pil."productId"
     WHERE pil."organizationId" = $1 AND pe.sku = $2
     GROUP BY pil."externalRef"
     ORDER BY pil."externalRef"`,
    ORG,
    sku,
  );

  const byCode = new Map<string, number>();
  for (const b of allBodegas) {
    byCode.set(b.externalRef, Math.round(b.qty));
  }

  const b01 = byCode.get("01") ?? 0;
  const b04 = byCode.get("04") ?? 0;

  const pdQty: Array<{ qty: number }> = await db.$queryRawUnsafe(
    `SELECT COALESCE(SUM(col."quantity"), 0)::float AS qty
     FROM "CustomerOrderLine" col
     JOIN "CustomerOrderRecord" cor ON cor.id = col."orderId"
     WHERE col."organizationId" = $1
       AND col."referenceCode" = $2
       AND cor.status = 'PENDIENTE'`,
    ORG,
    sku,
  );
  const pd = Math.round(pdQty[0]?.qty ?? 0);

  const crmQty: Array<{ qty: number }> = await db.$queryRawUnsafe(
    `SELECT COALESCE(SUM(cql.qty), 0)::float AS qty
     FROM "CRMQuoteLine" cql
     JOIN "CRMQuote" cq ON cq.id = cql."quoteId"
     WHERE cql."organizationId" = $1
       AND cql."reference" = $2
       AND cq.status = 'DRAFT'`,
    ORG,
    sku,
  );
  const crm = Math.round(crmQty[0]?.qty ?? 0);

  const vendedores = ["02", "03", "23", "29"]
    .reduce((s, c) => s + (byCode.get(c) ?? 0), 0);

  // Try different formulas
  const formulas: Array<{ name: string; value: number }> = [
    { name: "B01", value: b01 },
    { name: "B01 - PD", value: b01 - pd },
    { name: "B01 + B04", value: b01 + b04 },
    { name: "B01 + B04 - PD", value: b01 + b04 - pd },
    { name: "B01 - CRM", value: b01 - crm },
    { name: "B01 + B04 - CRM", value: b01 + b04 - crm },
    { name: "B01 + B04 - PD - CRM", value: b01 + b04 - pd - crm },
    { name: "B01 + vendedores", value: b01 + vendedores },
    { name: "B01 + B04 + vendedores", value: b01 + b04 + vendedores },
    { name: "B01 + B04 + vendedores - PD", value: b01 + b04 + vendedores - pd },
  ];

  console.log(B(`  ${sku} (admin=${adminQty}):`));
  console.log(`  ${"Formula".padEnd(35)} ${"Valor".padStart(8)} ${"Diff".padStart(8)} ${"Match?".padEnd(8)}`);
  console.log(`  ${"─".repeat(35)} ${"─".repeat(8)} ${"─".repeat(8)} ${"─".repeat(8)}`);

  let bestFormula = "";
  let bestDiff = Infinity;

  for (const f of formulas) {
    const diff = f.value - adminQty;
    const absDiff = Math.abs(diff);
    const match = absDiff === 0 ? G("EXACT") : absDiff <= 5 ? Y("CLOSE") : "";
    console.log(`  ${f.name.padEnd(35)} ${String(f.value).padStart(8)} ${String(diff).padStart(8)} ${match}`);

    if (absDiff < bestDiff) {
      bestDiff = absDiff;
      bestFormula = f.name;
    }
  }

  console.log(`  Best match: ${G(bestFormula)} (diff=${bestDiff})`);
  console.log("");
}

main().catch(e => {
  console.error(`FATAL: ${(e as Error).message}`);
  process.exit(1);
});
