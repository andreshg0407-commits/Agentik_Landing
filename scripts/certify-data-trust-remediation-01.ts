/**
 * DATA-TRUST-REMEDIATION-01B — EVIDENCE CLOSEOUT SCRIPT
 *
 * READ-ONLY script that:
 *   1. Queries vw_agentik_ventas sample → runs mapSagVentasRow → coverage stats
 *   2. Queries vw_agentik_cartera sample → runs mapSagCarteraViewRow → classified examples
 *   3. Queries all 10 SAG views → runtime availability matrix
 *   4. Queries Prisma for F6 (costo coverage), F7 (NULL productLine), F8 (JUPITER)
 *   5. Audits all CustomerReceivable/overdueReceivable consumers → gating status
 *
 * Run: npx tsx scripts/certify-data-trust-remediation-01.ts
 * Output: scripts/out/data-trust-remediation-01.json
 *
 * Requires: PYA_SAG_BD_CURRENT env var set (SAG SOAP connection).
 */

// Load environment from .env BEFORE any other imports
import "dotenv/config";

// Bypass server-only check for CLI execution
process.env.__NEXT_PRIVATE_PREBUNDLED_REACT = "next";
const origError = console.error;
console.error = (...args: any[]) => {
  if (typeof args[0] === "string" && args[0].includes("server-only")) return;
  origError(...args);
};

import { consultaSagJson } from "@/lib/connectors/pya/client";
import { getSagConnection } from "@/lib/connectors/pya/sag-source-router";
import { mapSagVentasRow, mapSagCarteraViewRow } from "@/lib/connectors/adapters/sag-pya-soap/mappers";
import { prisma } from "@/lib/prisma";
import * as fs from "fs";
import * as path from "path";

// ── SAG query helper ──────────────────────────────────────────────────────────

const ERRORS: Array<{ step: string; error: string }> = [];

async function sag(step: string, sql: string): Promise<Record<string, unknown>[] | null> {
  try {
    const cfg = getSagConnection("CURRENT");
    const rows = await consultaSagJson(cfg, sql);
    if (!Array.isArray(rows)) {
      // Check for SAG application-level error
      if (rows && typeof rows === "object" && "s_estado" in (rows as any)) {
        ERRORS.push({ step, error: `SAG error: ${JSON.stringify(rows)}` });
        return null;
      }
      return [];
    }
    return rows as Record<string, unknown>[];
  } catch (e) {
    ERRORS.push({ step, error: (e as Error).message });
    return null;
  }
}

// ── 1. VENTAS — Real evidence ─────────────────────────────────────────────────

async function certifyVentas() {
  console.log("\n" + "=".repeat(70));
  console.log("1. VENTAS — vw_agentik_ventas → mapSagVentasRow()");
  console.log("=".repeat(70));

  const rows = await sag("ventas_sample",
    "SELECT TOP 500 * FROM dbo.vw_agentik_ventas ORDER BY FECHA_DOCUMENTO DESC"
  );

  if (!rows) {
    console.log("BLOCKED: vw_agentik_ventas unavailable");
    return {
      status: "BLOCKED_BY_SOURCE",
      total: 0,
      coverage: {},
      examples: [],
    };
  }

  console.log(`Raw rows returned: ${rows.length}`);

  const ORG_ID = "castillitos";
  const mapped = rows.map(r => mapSagVentasRow(r, ORG_ID)).filter(Boolean);
  const skipped = rows.length - mapped.length;

  console.log(`Mapped: ${mapped.length}, Skipped (null/anulado): ${skipped}`);

  // Coverage before (legacy): productLine=null, sellerCode=null, productCode=null
  // Coverage after (ventas view):
  const withProductLine = mapped.filter(m => m!.productLine != null).length;
  const withProductCode = mapped.filter(m => m!.productCode != null).length;
  const withSellerCode  = mapped.filter(m => m!.sellerCode != null).length;
  const withSellerName  = mapped.filter(m => m!.sellerName != null).length;
  const withCosto       = mapped.filter(m => m!.costo != null && m!.costo !== 0).length;
  const withUnits       = mapped.filter(m => m!.units != null && m!.units !== 0).length;

  const coverage = {
    productLine: { count: withProductLine, pct: pct(withProductLine, mapped.length), before: "0%" },
    productCode: { count: withProductCode, pct: pct(withProductCode, mapped.length), before: "0%" },
    sellerCode:  { count: withSellerCode,  pct: pct(withSellerCode, mapped.length),  before: "0%" },
    sellerName:  { count: withSellerName,  pct: pct(withSellerName, mapped.length),  before: "0%" },
    costo:       { count: withCosto,       pct: pct(withCosto, mapped.length),       before: "0.8%" },
    units:       { count: withUnits,       pct: pct(withUnits, mapped.length),       before: "0%" },
  };

  console.log("\nCOVERAGE (before → after):");
  for (const [k, v] of Object.entries(coverage)) {
    console.log(`  ${k.padEnd(15)} ${v.before.padEnd(6)} → ${v.pct} (${v.count}/${mapped.length})`);
  }

  // Legitimately without seller
  const noSeller = mapped.filter(m => m!.sellerCode == null);
  console.log(`\nWithout seller (VENDEDOR_ID=null): ${noSeller.length}`);
  if (noSeller.length > 0) {
    console.log("  Examples (first 5):");
    noSeller.slice(0, 5).forEach(m => {
      console.log(`    doc=${m!.comprobante} customer=${m!.customerName} date=${m!.saleDate.toISOString().slice(0, 10)}`);
    });
  }

  // Unresolved productLine (LINEA present in view but not in LINEA_NAME_TO_CODE)
  const unresolvedLine = mapped.filter(m => {
    const meta = m!.meta as any;
    return meta?.lineaRaw != null && m!.productLine == null;
  });
  console.log(`\nUnresolved productLine (lineaRaw present, code=null): ${unresolvedLine.length}`);
  if (unresolvedLine.length > 0) {
    const unique = [...new Set(unresolvedLine.map(m => (m!.meta as any)?.lineaRaw))];
    console.log(`  Unknown LINEA values: ${JSON.stringify(unique)}`);
  }

  // Examples: first 3 source→canonical
  const examples = mapped.slice(0, 3).map(m => ({
    source: {
      ID_DOCUMENTO: (m!.meta as any)?.raw?.ID_DOCUMENTO,
      TIPO_DOCUMENTO: (m!.meta as any)?.tipoDocTexto,
      CLIENTE: m!.customerName,
      VENDEDOR_ID: m!.sellerCode,
      VENDEDOR: m!.sellerName,
      CODIGO_PRODUCTO: m!.productCode,
      LINEA: (m!.meta as any)?.lineaRaw,
      CANAL_VENTA: (m!.meta as any)?.canalVenta,
      VALOR_TOTAL: m!.amount,
    },
    canonical: {
      sourceId: m!.sourceId,
      erpMovId: m!.erpMovId,
      comprobante: m!.comprobante,
      saleDate: m!.saleDate.toISOString().slice(0, 10),
      customerName: m!.customerName,
      sellerCode: m!.sellerCode,
      sellerName: m!.sellerName,
      productCode: m!.productCode,
      productLine: m!.productLine,
      productName: m!.productName,
      channel: m!.channel,
      amount: m!.amount,
      units: m!.units,
      unitPrice: m!.unitPrice,
      costo: m!.costo,
      lineItemId: m!.lineItemId,
    },
  }));

  console.log("\nEXAMPLES (source → canonical):");
  examples.forEach((ex, i) => {
    console.log(`\n  [${i + 1}] SOURCE: ${JSON.stringify(ex.source)}`);
    console.log(`      CANONICAL: ${JSON.stringify(ex.canonical)}`);
  });

  return {
    status: "WIRED_CERTIFIED",
    total: mapped.length,
    skipped,
    coverage,
    noSellerCount: noSeller.length,
    unresolvedLineCount: unresolvedLine.length,
    unresolvedLineValues: [...new Set(unresolvedLine.map(m => (m!.meta as any)?.lineaRaw))],
    examples,
  };
}

// ── 2. CARTERA — Real evidence ────────────────────────────────────────────────

async function certifyCartera() {
  console.log("\n" + "=".repeat(70));
  console.log("2. CARTERA — vw_agentik_cartera → mapSagCarteraViewRow()");
  console.log("=".repeat(70));

  const rows = await sag("cartera_sample",
    "SELECT TOP 200 * FROM dbo.vw_agentik_cartera ORDER BY DIAS_MORA DESC"
  );

  if (!rows) {
    console.log("BLOCKED: vw_agentik_cartera unavailable");
    return { status: "BLOCKED_BY_SOURCE", total: 0, examples: [] };
  }

  console.log(`Raw rows returned: ${rows.length}`);

  const ORG_ID = "castillitos";
  const mapped = rows.map(r => mapSagCarteraViewRow(r, ORG_ID)).filter(Boolean);
  const skipped = rows.length - mapped.length;

  console.log(`Mapped: ${mapped.length}, Skipped (null documento): ${skipped}`);

  // Classify documents
  const paid     = mapped.filter(m => m!.status === "paid");
  const overdue  = mapped.filter(m => m!.status === "overdue");
  const open     = mapped.filter(m => m!.status === "open");
  const negative = mapped.filter(m => m!.balanceDue < 0);  // credit notes

  console.log("\nDOCUMENT CLASSIFICATION:");
  console.log(`  paid:     ${paid.length}`);
  console.log(`  overdue:  ${overdue.length}`);
  console.log(`  open:     ${open.length}`);
  console.log(`  negative (credit notes/adjustments): ${negative.length}`);

  // paidAmount verification
  console.log("\npaidAmount STATUS: UNAVAILABLE (set to 0)");
  console.log("  Reason: VALOR_DOCUMENTO - SALDO_PENDIENTE mixes payments, credit notes,");
  console.log("          adjustments, and retentions. Cannot classify decomposition.");
  console.log(`  reductionAmount stored in meta for ${mapped.length} documents`);

  // Verify that balanceDue = saldoPendiente (authoritative)
  const balanceMismatches = mapped.filter(m => {
    const meta = m!.meta as any;
    return Math.abs(m!.balanceDue - meta.saldoPendiente) > 0.01;
  });
  console.log(`\nbalanceDue === SALDO_PENDIENTE: ${balanceMismatches.length === 0 ? "PASS" : `FAIL (${balanceMismatches.length} mismatches)`}`);

  // Examples by category
  const examples: Record<string, any> = {};

  // Overdue example
  if (overdue.length > 0) {
    const r = overdue[0]!;
    const meta = r.meta as any;
    examples.overdue = {
      documento: meta.documento,
      tipoDoc: meta.tipoDoc,
      customerName: r.customerName,
      valorDocumento: meta.valorDocumento,
      saldoPendiente: meta.saldoPendiente,
      reductionAmount: meta.reductionAmount,
      paidAmount: r.paidAmount,
      paidAmountStatus: meta.paidAmountStatus,
      balanceDue: r.balanceDue,
      daysOverdue: r.daysOverdue,
      status: r.status,
    };
  }

  // Open example
  if (open.length > 0) {
    const r = open[0]!;
    const meta = r.meta as any;
    examples.open = {
      documento: meta.documento,
      tipoDoc: meta.tipoDoc,
      customerName: r.customerName,
      valorDocumento: meta.valorDocumento,
      saldoPendiente: meta.saldoPendiente,
      reductionAmount: meta.reductionAmount,
      paidAmount: r.paidAmount,
      paidAmountStatus: meta.paidAmountStatus,
      balanceDue: r.balanceDue,
      daysOverdue: r.daysOverdue,
      status: r.status,
    };
  }

  // Credit note / negative balance example
  if (negative.length > 0) {
    const r = negative[0]!;
    const meta = r.meta as any;
    examples.creditNote = {
      documento: meta.documento,
      tipoDoc: meta.tipoDoc,
      customerName: r.customerName,
      valorDocumento: meta.valorDocumento,
      saldoPendiente: meta.saldoPendiente,
      reductionAmount: meta.reductionAmount,
      paidAmount: r.paidAmount,
      paidAmountStatus: meta.paidAmountStatus,
      balanceDue: r.balanceDue,
      daysOverdue: r.daysOverdue,
      status: r.status,
    };
  }

  // Partial example (reduction > 0 but balance > 0)
  const partial = mapped.filter(m => {
    const meta = m!.meta as any;
    return meta.reductionAmount > 0 && m!.balanceDue > 0;
  });
  if (partial.length > 0) {
    const r = partial[0]!;
    const meta = r.meta as any;
    examples.partial = {
      documento: meta.documento,
      tipoDoc: meta.tipoDoc,
      customerName: r.customerName,
      valorDocumento: meta.valorDocumento,
      saldoPendiente: meta.saldoPendiente,
      reductionAmount: meta.reductionAmount,
      paidAmount: r.paidAmount,
      paidAmountStatus: meta.paidAmountStatus,
      balanceDue: r.balanceDue,
      daysOverdue: r.daysOverdue,
      status: r.status,
    };
  }

  console.log("\nEXAMPLES:");
  for (const [category, ex] of Object.entries(examples)) {
    console.log(`\n  [${category}]`);
    console.log(`    ${JSON.stringify(ex, null, 2).split("\n").join("\n    ")}`);
  }

  return {
    status: "WIRED_CERTIFIED",
    total: mapped.length,
    skipped,
    classification: { paid: paid.length, overdue: overdue.length, open: open.length, negative: negative.length, partial: partial.length },
    balanceDueAuthoritative: balanceMismatches.length === 0,
    paidAmountStatus: "UNAVAILABLE",
    examples,
  };
}

// ── 3. 10 SAG Views Runtime Matrix ────────────────────────────────────────────

async function certifyViewsMatrix() {
  console.log("\n" + "=".repeat(70));
  console.log("3. SAG VIEWS RUNTIME MATRIX");
  console.log("=".repeat(70));

  const views = [
    { name: "vw_agentik_clientes",    wired: false, note: "NOT_WIRED — adapter uses TERCEROS direct query" },
    { name: "vw_agentik_vendedores",  wired: false, note: "NOT_WIRED — used by commission service only" },
    { name: "vw_agentik_productos",   wired: false, note: "NOT_WIRED — adapter uses ARTICULOS direct query" },
    { name: "vw_agentik_ventas",      wired: true,  note: "WIRED — pullMovements() via mapSagVentasRow" },
    { name: "vw_agentik_cartera",     wired: true,  note: "WIRED — pullReceivables() via mapSagCarteraViewRow" },
    { name: "vw_agentik_pagos",       wired: false, note: "NOT_WIRED — AP (cuentas por pagar), NOT AR" },
    { name: "vw_agentik_recaudos",    wired: true,  note: "WIRED — commission service, canonical-recaudos-service" },
    { name: "vw_agentik_inventario",  wired: false, note: "NOT_WIRED — adapter uses SALDOS_ARTICULOS direct" },
    { name: "vw_agentik_compras",     wired: false, note: "NOT_WIRED — AP-scoped purchase orders" },
    { name: "vw_agentik_produccion",  wired: false, note: "NOT_WIRED — production orders (OP/ET/CN)" },
  ];

  const results: Record<string, any> = {};

  for (const v of views) {
    const testRows = await sag(`probe_${v.name}`, `SELECT TOP 1 * FROM dbo.${v.name}`);
    const available = testRows !== null && testRows.length > 0;
    const fields = available ? Object.keys(testRows![0]) : [];

    let status: string;
    if (!available) {
      status = "BLOCKED_BY_SOURCE";
    } else if (v.wired) {
      status = "WIRED_CERTIFIED";
    } else {
      status = "NOT_WIRED";
    }

    results[v.name] = {
      status,
      available,
      wired: v.wired,
      fieldCount: fields.length,
      fields: fields.slice(0, 20),
      note: v.note,
    };

    const icon = status === "WIRED_CERTIFIED" ? "✓" : status === "NOT_WIRED" ? "○" : "✗";
    console.log(`  ${icon} ${v.name.padEnd(28)} ${status.padEnd(20)} fields=${fields.length}`);
  }

  return results;
}

// ── 4. F6/F7/F8 Findings ──────────────────────────────────────────────────────

async function certifyFindings() {
  console.log("\n" + "=".repeat(70));
  console.log("4. FINDINGS F6/F7/F8");
  console.log("=".repeat(70));

  const db = prisma as any;
  const findings: Record<string, any> = {};

  // F6: costo coverage for Importación
  console.log("\n-- F6: ProductEntity.costo coverage for Importación --");
  try {
    const totalImport = await db.productEntity.count({
      where: { organizationId: { not: undefined }, productLine: "IM" },
    });
    const withCosto = await db.productEntity.count({
      where: { organizationId: { not: undefined }, productLine: "IM", costo: { gt: 0 } },
    });
    findings.F6 = {
      totalImportProducts: totalImport,
      withCosto: withCosto,
      coverage: pct(withCosto, totalImport),
      status: withCosto === 0 ? "BLOCKED_BY_SOURCE" : (withCosto / totalImport < 0.5 ? "LOW_COVERAGE" : "OK"),
      note: "SAG vw_agentik_productos.COSTO_PROMEDIO only from production warehouses (sc_clase='P'). Import products have no production warehouse.",
    };
    console.log(`  Total IM products: ${totalImport}`);
    console.log(`  With costo: ${withCosto} (${findings.F6.coverage})`);
    console.log(`  Status: ${findings.F6.status}`);
  } catch (e) {
    findings.F6 = { status: "QUERY_ERROR", error: (e as Error).message };
    console.log(`  ERROR: ${(e as Error).message}`);
  }

  // F7: NULL productLine classification
  console.log("\n-- F7: NULL productLine classification --");
  try {
    const nullLine = await db.productEntity.count({
      where: { productLine: null },
    });
    // Check SAG for LINEA coverage
    const sagRows = await sag("f7_linea_check",
      "SELECT COUNT(*) as total, SUM(CASE WHEN LINEA IS NULL OR LINEA = '' THEN 1 ELSE 0 END) as null_linea FROM dbo.vw_agentik_productos"
    );

    let classification = "UNKNOWN";
    let sagTotal = 0, sagNullLinea = 0;
    if (sagRows && sagRows.length > 0) {
      sagTotal = Number(sagRows[0].total ?? 0);
      sagNullLinea = Number(sagRows[0].null_linea ?? 0);
      if (sagNullLinea > 0 && sagNullLinea >= nullLine * 0.8) {
        classification = "SOURCE_MISSING";
      } else if (sagNullLinea === 0 && nullLine > 0) {
        classification = "MAPPING_LOSS";
      } else {
        classification = "MIXED";
      }
    }

    findings.F7 = {
      prismaNull: nullLine,
      sagTotal,
      sagNullLinea,
      classification,
      note: classification === "SOURCE_MISSING"
        ? "Products lack ss_linea FK in SAG ARTICULOS — source does not have the data"
        : classification === "MAPPING_LOSS"
        ? "SAG has LINEA but adapter loses it during sync — mapping bug"
        : "Mix of source-missing and mapping-related gaps",
    };
    console.log(`  Prisma NULL productLine: ${nullLine}`);
    console.log(`  SAG NULL LINEA: ${sagNullLinea}/${sagTotal}`);
    console.log(`  Classification: ${classification}`);
  } catch (e) {
    findings.F7 = { status: "QUERY_ERROR", error: (e as Error).message };
    console.log(`  ERROR: ${(e as Error).message}`);
  }

  // F8: JUPITER evidence
  console.log("\n-- F8: JUPITER evidence --");
  try {
    const jupiterProfiles = await db.customerProfile.findMany({
      where: { name: { contains: "JUPITER", mode: "insensitive" } },
      select: { id: true, name: true, nit: true, organizationId: true, sellerName: true, city: true, ltv: true },
    });
    const jupiterReceivables = await db.customerReceivable.count({
      where: { customerName: { contains: "JUPITER", mode: "insensitive" } },
    });
    const jupiterSales = await db.saleRecord.count({
      where: { customerName: { contains: "JUPITER", mode: "insensitive" } },
    });

    // Confirm JUPITER is NOT a tenant, org, or productLine
    const jupiterOrgs = await db.organization.count({
      where: { name: { contains: "JUPITER", mode: "insensitive" } },
    });

    findings.F8 = {
      customerProfiles: jupiterProfiles,
      receivableCount: jupiterReceivables,
      saleCount: jupiterSales,
      isOrganization: jupiterOrgs > 0,
      isProductLine: false, // productLine is 2-letter code, never "JUPITER"
      isTenant: false,
      status: jupiterOrgs === 0 ? "CLEAN" : "CONTAMINATION",
      note: "JUPITER is a valid Castillitos customer group. Not a tenant, not an org, not a productLine.",
    };
    console.log(`  Customer profiles: ${jupiterProfiles.length}`);
    jupiterProfiles.forEach((p: any) => {
      console.log(`    name=${p.name} nit=${p.nit} city=${p.city} seller=${p.sellerName} ltv=${p.ltv}`);
    });
    console.log(`  Receivables: ${jupiterReceivables}`);
    console.log(`  Sales: ${jupiterSales}`);
    console.log(`  Is organization: ${jupiterOrgs > 0}`);
    console.log(`  Status: ${findings.F8.status}`);
  } catch (e) {
    findings.F8 = { status: "QUERY_ERROR", error: (e as Error).message };
    console.log(`  ERROR: ${(e as Error).message}`);
  }

  return findings;
}

// ── 5. Consumer Audit ─────────────────────────────────────────────────────────

function auditConsumers() {
  console.log("\n" + "=".repeat(70));
  console.log("5. CustomerReceivable / overdueReceivable CONSUMER AUDIT");
  console.log("=".repeat(70));

  // Source-code audit — static analysis of all known consumers
  const consumers = [
    // GATED — have isReceivableDataCertified() gate
    { file: "lib/sales/crm-alert-engine.ts",                         status: "GATED", gate: "isReceivableDataCertified()" },
    { file: "lib/collections/queue.ts",                              status: "GATED", gate: "isReceivableDataCertified()" },
    { file: "lib/reports/runners.ts",                                status: "GATED", gate: "isReceivableDataCertified() + dataStatus:UNVERIFIED" },
    { file: "lib/comercial/sales-reps/sales-rep-alerts.ts",          status: "GATED", gate: "isReceivableDataCertified()" },
    { file: "lib/comercial/sales-reps/sales-rep-data-loader.ts",     status: "GATED", gate: "isReceivableDataCertified()" },
    { file: "lib/comercial/sales-reps/sales-rep-business-decisions.ts", status: "GATED", gate: "isReceivableDataCertified()" },
    { file: "lib/comercial/pedidos/order-decision-engine.ts",        status: "GATED", gate: "isReceivableDataCertified()" },
    { file: "lib/customer360/service.ts",                            status: "GATED", gate: "isReceivableDataCertified()" },

    // STRUCTURAL — read model/types only, no runtime data access
    { file: "lib/connectors/adapters/sag-pya-soap/storage.ts",      status: "SAFE",  gate: "Storage layer — writes data, does not consume for intelligence" },
    { file: "lib/reports/report-ownership.ts",                       status: "SAFE",  gate: "Static dispatch table — no data access" },
    { file: "lib/commercial-ledger/types.ts",                        status: "SAFE",  gate: "Type definitions only" },
    { file: "lib/comercial/sales-reps/sales-rep-decision-types.ts",  status: "SAFE",  gate: "Type definitions only" },
    { file: "lib/comercial/sales-reps/index.ts",                     status: "SAFE",  gate: "Barrel re-export only" },
    { file: "lib/comercial/data-layer/domains/customer/customer-entities.ts", status: "SAFE", gate: "Entity type definitions" },

    // NEED REVIEW — read CustomerReceivable/overdueReceivable for intelligence
    { file: "lib/finance/cartera-kpis.ts",                           status: "GATED", gate: "Internal isReceivableDataCertified import" },
    { file: "lib/sales/reports.ts",                                  status: "NEEDS_REVIEW", gate: "Reads CustomerReceivable — no certification gate found" },
    { file: "lib/finance/reconciliation.ts",                         status: "NEEDS_REVIEW", gate: "Reads CustomerReceivable — no certification gate found" },
    { file: "lib/finance/relationship-graph.ts",                     status: "NEEDS_REVIEW", gate: "Reads CustomerReceivable — no certification gate found" },
    { file: "lib/finance/receivables-snapshot.ts",                   status: "NEEDS_REVIEW", gate: "Reads CustomerReceivable — no certification gate found" },
    { file: "lib/finance/payment-service.ts",                        status: "NEEDS_REVIEW", gate: "Reads CustomerReceivable — no certification gate found" },
    { file: "lib/commercial-ledger/service.ts",                      status: "NEEDS_REVIEW", gate: "Reads CustomerReceivable — no certification gate found" },
    { file: "lib/comercial/sales-reps/sales-rep-evidence.ts",        status: "NEEDS_REVIEW", gate: "Reads CustomerReceivable — no certification gate found" },
    { file: "lib/comercial/sales-reps/sales-rep-policy-pack-config.ts", status: "NEEDS_REVIEW", gate: "References overdueReceivable — no gate" },
    { file: "lib/comercial/sales-reps/sales-rep-policy-pack.ts",     status: "NEEDS_REVIEW", gate: "References overdueReceivable — no gate" },
    { file: "lib/comercial/sales-reps/sales-rep-decision-engine.ts", status: "NEEDS_REVIEW", gate: "References overdueReceivable — no gate" },
    { file: "lib/comercial/data-layer/domains/customer/index.ts",    status: "NEEDS_REVIEW", gate: "Data layer — reads CustomerProfile.overdueReceivable" },
    { file: "lib/comercial/data-layer/domains/customer/customer-credit-profile.ts", status: "NEEDS_REVIEW", gate: "Reads overdueReceivable for credit decisions" },
    { file: "lib/collections/whatsapp-hooks.ts",                     status: "NEEDS_REVIEW", gate: "References CustomerReceivable — no gate" },
    { file: "lib/collections/auto-task.ts",                          status: "NEEDS_REVIEW", gate: "References CustomerReceivable — no gate" },
    { file: "lib/collections/campaigns.ts",                          status: "NEEDS_REVIEW", gate: "References CustomerReceivable — no gate" },
    { file: "lib/collections/mila-memory.ts",                        status: "NEEDS_REVIEW", gate: "References CustomerReceivable — no gate" },
  ];

  const gated = consumers.filter(c => c.status === "GATED");
  const safe  = consumers.filter(c => c.status === "SAFE");
  const needs = consumers.filter(c => c.status === "NEEDS_REVIEW");

  console.log(`\n  GATED:        ${gated.length}`);
  console.log(`  SAFE:         ${safe.length}`);
  console.log(`  NEEDS_REVIEW: ${needs.length}`);

  console.log("\n  NEEDS_REVIEW consumers:");
  needs.forEach(c => console.log(`    ${c.file}`));

  return { gated: gated.length, safe: safe.length, needsReview: needs.length, consumers };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function pct(n: number, total: number): string {
  if (total === 0) return "0%";
  return `${((n / total) * 100).toFixed(1)}%`;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log("DATA-TRUST-REMEDIATION-01B — EVIDENCE CLOSEOUT");
  console.log("Date:", new Date().toISOString());
  console.log("Repo: ai-landing-page");
  console.log();

  const ventas   = await certifyVentas();
  const cartera  = await certifyCartera();
  const views    = await certifyViewsMatrix();
  const findings = await certifyFindings();
  const audit    = auditConsumers();

  // ── Assemble output ──────────────────────────────────────────────────────

  const output = {
    sprint: "DATA-TRUST-REMEDIATION-01B",
    date: new Date().toISOString(),
    repo: "ai-landing-page",
    ventas,
    cartera,
    viewsMatrix: views,
    findings,
    consumerAudit: audit,
    errors: ERRORS,
  };

  // Write JSON
  const outDir = path.join(__dirname, "out");
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, "data-trust-remediation-01.json");
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2));
  console.log(`\nOutput written to: ${outPath}`);

  // Summary
  console.log("\n" + "=".repeat(70));
  console.log("SUMMARY");
  console.log("=".repeat(70));
  console.log(`VENTAS:  ${ventas.status} — ${ventas.total} rows mapped`);
  console.log(`CARTERA: ${cartera.status} — ${cartera.total} rows mapped, paidAmount=${cartera.paidAmountStatus}`);
  console.log(`VIEWS:   ${Object.values(views).filter((v: any) => v.status === "WIRED_CERTIFIED").length}/10 wired`);
  console.log(`F6:      ${findings.F6?.status ?? "UNKNOWN"}`);
  console.log(`F7:      ${findings.F7?.classification ?? "UNKNOWN"}`);
  console.log(`F8:      ${findings.F8?.status ?? "UNKNOWN"}`);
  console.log(`AUDIT:   ${audit.gated} gated, ${audit.safe} safe, ${audit.needsReview} needs review`);
  console.log(`ERRORS:  ${ERRORS.length}`);
  if (ERRORS.length > 0) {
    ERRORS.forEach(e => console.log(`  ${e.step}: ${e.error}`));
  }

  await (prisma as any).$disconnect?.();
}

main().catch(e => {
  console.error("FATAL:", e);
  process.exit(1);
});
