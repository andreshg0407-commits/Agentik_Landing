/**
 * scripts/validate-commercial-data-connectivity-01.ts
 *
 * Validation script for COMMERCIAL-DATA-CONNECTIVITY-01 sprint.
 * Tests the full data connectivity chain:
 *   SAG → Prisma → Data Loader → Decision Engine → BusinessDecision → Aggregator
 *
 * Run: npx tsx scripts/validate-commercial-data-connectivity-01.ts
 *
 * Exit code 0 = all validations pass
 * Exit code 1 = some validations failed
 */

// Mock server-only for script context
require("./_mock-server-only.cjs");

import { loadImportReferenceInputs, buildImportPolicyContext } from "../lib/comercial/importaciones/import-data-loader";
import { loadProductionSubgroupInputs, buildProductionContext } from "../lib/comercial/produccion/production-data-loader";
import { loadSalesRepData, listSellerSlugs } from "../lib/comercial/sales-reps/sales-rep-data-loader";
import { evaluateLowRotation, evaluateRepurchase, buildNextContainerRecommendations, evaluateInventoryAging } from "../lib/comercial/importaciones/import-decision-engine";
import { evaluateProductionNeed, evaluatePriority } from "../lib/comercial/produccion/production-decision-engine";
import { evaluateMalletOutOfStock, evaluateCustomerReceivablesAlert, evaluateCustomerInactivity } from "../lib/comercial/sales-reps/sales-rep-decision-engine";
import { CASTILLITOS_IMPORT_POLICY_PACK_CONFIG } from "../lib/comercial/importaciones/import-policy-pack-config";
import { CASTILLITOS_PRODUCTION_PLANNING_CONFIG } from "../lib/comercial/produccion/production-planning-config";
import { CASTILLITOS_SALESREP_POLICY_PACK_CONFIG } from "../lib/comercial/sales-reps/sales-rep-policy-pack-config";
import { buildAllImportBusinessDecisions } from "../lib/comercial/importaciones/import-business-decisions";
import { buildAllProductionBusinessDecisions } from "../lib/comercial/produccion/production-business-decisions";
import { buildOutOfStockDecisions, buildOverdueReceivableDecisions, buildInactiveCustomerDecisions } from "../lib/comercial/sales-reps/sales-rep-business-decisions";
import { aggregateCommercialDecisions } from "../lib/comercial/business-policy/commercial-decision-aggregator";
import type { BusinessDecision } from "../lib/comercial/business-policy/business-decision-types";

// ── Test infrastructure ──────────────────────────────────────────────────────

interface TestResult {
  name: string;
  status: "PASS" | "FAIL" | "SKIP";
  detail: string;
}

const results: TestResult[] = [];

function pass(name: string, detail: string) {
  results.push({ name, status: "PASS", detail });
  console.log(`  ✓ ${name}: ${detail}`);
}

function fail(name: string, detail: string) {
  results.push({ name, status: "FAIL", detail });
  console.error(`  ✗ ${name}: ${detail}`);
}

function skip(name: string, detail: string) {
  results.push({ name, status: "SKIP", detail });
  console.log(`  ○ ${name}: ${detail}`);
}

// ── Castillitos org ID (from seed) ────────────────────────────────────────────

const CASTILLITOS_ORG_ID = process.env.CASTILLITOS_ORG_ID ?? "";

async function resolveOrgId(): Promise<string> {
  if (CASTILLITOS_ORG_ID) return CASTILLITOS_ORG_ID;
  try {
    const { prisma } = await import("../lib/prisma");
    const org = await (prisma as any).organization.findFirst({
      where: { slug: "castillitos" },
      select: { id: true },
    });
    if (org?.id) return org.id;
  } catch {}
  return "";
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log("\n═══════════════════════════════════════════════════════════");
  console.log("  COMMERCIAL-DATA-CONNECTIVITY-01 — Validation");
  console.log("═══════════════════════════════════════════════════════════\n");

  const orgId = await resolveOrgId();
  if (!orgId) {
    console.error("ERROR: Cannot resolve castillitos org ID. Set CASTILLITOS_ORG_ID env.");
    process.exit(1);
  }
  console.log(`Organization: ${orgId}\n`);

  // ── PHASE 1: Data Loaders ──────────────────────────────────────────────

  console.log("── Phase 1: Data Loaders ──────────────────────────────────");

  // Importaciones loader
  let importItems: Awaited<ReturnType<typeof loadImportReferenceInputs>> = [];
  try {
    importItems = await loadImportReferenceInputs(orgId);
    if (importItems.length > 0) {
      pass("IMPORT-LOADER", `Loaded ${importItems.length} import references`);
      // Validate field coverage
      const withPrices = importItems.filter(i => i.pricePV3 !== null || i.pricePV4 !== null).length;
      const withSales = importItems.filter(i => i.sales6m > 0).length;
      const withInventory = importItems.filter(i => i.currentInventory > 0).length;
      pass("IMPORT-FIELDS", `prices=${withPrices}, sales=${withSales}, inventory=${withInventory}`);
    } else {
      fail("IMPORT-LOADER", "Zero import references loaded");
    }
  } catch (e: any) {
    fail("IMPORT-LOADER", e?.message ?? "Unknown error");
  }

  // Production loader
  let prodItems: Awaited<ReturnType<typeof loadProductionSubgroupInputs>> = [];
  try {
    prodItems = await loadProductionSubgroupInputs(orgId);
    if (prodItems.length > 0) {
      pass("PROD-LOADER", `Loaded ${prodItems.length} subgroups`);
      const withOPs = prodItems.filter(s => s.activeOPs.length > 0).length;
      const withSales = prodItems.filter(s => s.sales6m > 0).length;
      const withInventory = prodItems.filter(s => s.availableInventory > 0).length;
      pass("PROD-FIELDS", `activeOPs=${withOPs}, sales=${withSales}, inventory=${withInventory}`);
    } else {
      fail("PROD-LOADER", "Zero production subgroups loaded");
    }
  } catch (e: any) {
    fail("PROD-LOADER", e?.message ?? "Unknown error");
  }

  // Vendedores loader
  let sellerSlugs: string[] = [];
  try {
    sellerSlugs = await listSellerSlugs(orgId);
    if (sellerSlugs.length > 0) {
      pass("SELLER-SLUGS", `Found ${sellerSlugs.length} sellers`);
    } else {
      fail("SELLER-SLUGS", "Zero sellers found");
    }
  } catch (e: any) {
    fail("SELLER-SLUGS", e?.message ?? "Unknown error");
  }

  let sellerData: Awaited<ReturnType<typeof loadSalesRepData>> | null = null;
  if (sellerSlugs.length > 0) {
    try {
      sellerData = await loadSalesRepData(orgId, sellerSlugs[0]);
      const c = sellerData.customers.length;
      const m = sellerData.malletItems.length;
      const o = sellerData.orders.length;
      pass("SELLER-LOADER", `Seller "${sellerSlugs[0]}": customers=${c}, malletItems=${m}, orders=${o}`);
      if (c > 0) {
        const withReceivables = sellerData.customers.filter(cu => cu.receivables !== null).length;
        pass("SELLER-FIELDS", `customersWithReceivables=${withReceivables}/${c}`);
      }
    } catch (e: any) {
      fail("SELLER-LOADER", e?.message ?? "Unknown error");
    }
  }

  // ── PHASE 2: Decision Engines ──────────────────────────────────────────

  console.log("\n── Phase 2: Decision Engines ──────────────────────────────");

  const allDecisions: BusinessDecision[] = [];

  // Import engine
  if (importItems.length > 0) {
    try {
      const ctx = buildImportPolicyContext(orgId);
      const config = CASTILLITOS_IMPORT_POLICY_PACK_CONFIG;
      const lr = evaluateLowRotation(ctx, importItems, config);
      const rp = importItems.map(i => evaluateRepurchase(ctx, i, config));
      const nc = buildNextContainerRecommendations(ctx, importItems, rp, config);
      const ag = evaluateInventoryAging(ctx, importItems, config);
      const dec = buildAllImportBusinessDecisions(orgId, lr, rp, nc.items, ag);
      allDecisions.push(...dec);
      pass("IMPORT-ENGINE", `lowRotation=${lr.filter(r => r.isLowRotation).length}, repurchase=${rp.filter(r => r.decision === "REBUY").length}, container=${nc.items.length}, aging=${ag.filter(a => a.agingStatus !== "NORMAL").length} → ${dec.length} BusinessDecisions`);
    } catch (e: any) {
      fail("IMPORT-ENGINE", e?.message ?? "Unknown error");
    }
  } else {
    skip("IMPORT-ENGINE", "No import items loaded");
  }

  // Production engine
  if (prodItems.length > 0) {
    try {
      const ctx = buildProductionContext(orgId);
      const config = CASTILLITOS_PRODUCTION_PLANNING_CONFIG;
      const needs = evaluateProductionNeed(ctx, prodItems, config);
      const pris = prodItems.map(i => evaluatePriority(ctx, i, config));
      const dec = buildAllProductionBusinessDecisions(needs, pris, orgId);
      allDecisions.push(...dec);
      const produce = needs.filter(n => n.decision === "PRODUCE").length;
      const wait = needs.filter(n => n.decision === "WAIT_EXISTING_OP").length;
      pass("PROD-ENGINE", `produce=${produce}, waitOP=${wait} → ${dec.length} BusinessDecisions`);
    } catch (e: any) {
      fail("PROD-ENGINE", e?.message ?? "Unknown error");
    }
  } else {
    skip("PROD-ENGINE", "No production subgroups loaded");
  }

  // Vendedores engine
  if (sellerData) {
    try {
      const config = CASTILLITOS_SALESREP_POLICY_PACK_CONFIG;
      let oosCount = 0, overdueCount = 0, inactiveCount = 0;

      if (sellerData.malletState) {
        const oos = evaluateMalletOutOfStock(
          sellerData.context, sellerData.malletState.malletId, sellerData.malletItems, config,
        );
        const oosDec = buildOutOfStockDecisions(oos, orgId);
        allDecisions.push(...oosDec);
        oosCount = oosDec.length;
      }

      const overdueResults = sellerData.customers.map(c =>
        evaluateCustomerReceivablesAlert(sellerData!.context, c, config),
      );
      const overdueDec = buildOverdueReceivableDecisions(overdueResults, orgId);
      allDecisions.push(...overdueDec);
      overdueCount = overdueDec.length;

      const inactiveResults = sellerData.customers.map(c =>
        evaluateCustomerInactivity(sellerData!.context, c, config),
      );
      const inactiveDec = buildInactiveCustomerDecisions(inactiveResults, orgId);
      allDecisions.push(...inactiveDec);
      inactiveCount = inactiveDec.length;

      pass("SELLER-ENGINE", `outOfStock=${oosCount}, overdue=${overdueCount}, inactive=${inactiveCount} → ${oosCount + overdueCount + inactiveCount} BusinessDecisions`);
    } catch (e: any) {
      fail("SELLER-ENGINE", e?.message ?? "Unknown error");
    }
  } else {
    skip("SELLER-ENGINE", "No seller data loaded");
  }

  // ── PHASE 3: Aggregator ────────────────────────────────────────────────

  console.log("\n── Phase 3: Aggregator ────────────────────────────────────");

  try {
    const summary = aggregateCommercialDecisions(orgId, allDecisions);
    pass("AGGREGATOR", `total=${summary.totalDecisions}, critical=${summary.criticalDecisions}, high=${summary.highDecisions}, domains=[${summary.domains.join(",")}]`);

    // Validate all decisions have required fields
    const missingFields = allDecisions.filter(d =>
      !d.decisionId || !d.domain || !d.engine || !d.policy || !d.title || !d.evidence,
    );
    if (missingFields.length === 0) {
      pass("DECISION-SHAPE", `All ${allDecisions.length} decisions have complete fields`);
    } else {
      fail("DECISION-SHAPE", `${missingFields.length} decisions missing required fields`);
    }

    // Validate evidence chain
    const missingEvidence = allDecisions.filter(d =>
      !d.evidence.policyId || !d.evidence.policyName || !d.evidence.activationReason,
    );
    if (missingEvidence.length === 0) {
      pass("EVIDENCE-CHAIN", `All ${allDecisions.length} decisions have complete evidence`);
    } else {
      fail("EVIDENCE-CHAIN", `${missingEvidence.length} decisions missing evidence fields`);
    }
  } catch (e: any) {
    fail("AGGREGATOR", e?.message ?? "Unknown error");
  }

  // ── PHASE 4: Coverage Score ────────────────────────────────────────────

  console.log("\n── Phase 4: Coverage Assessment ───────────────────────────");

  const domainScores: Record<string, number> = {};
  const DOMAINS = ["IMPORTACIONES", "PRODUCCION", "VENDEDORES"];

  for (const domain of DOMAINS) {
    const domainDec = allDecisions.filter(d => d.domain === domain);
    // Score: loader produced data (40%) + engine ran without error (30%) + decisions produced (30%)
    let score = 0;
    if (domain === "IMPORTACIONES" && importItems.length > 0) score += 40;
    if (domain === "PRODUCCION" && prodItems.length > 0) score += 40;
    if (domain === "VENDEDORES" && sellerData) score += 40;

    const enginePassed = results.some(r => r.name.includes(domain.slice(0, 4).toUpperCase() + "-ENGINE") && r.status === "PASS");
    if (enginePassed) score += 30;

    if (domainDec.length > 0) score += 30;

    domainScores[domain] = score;
    const label = score >= 90 ? "PASS" : score >= 50 ? "PARTIAL" : "FAIL";
    console.log(`  ${label === "PASS" ? "✓" : label === "PARTIAL" ? "◐" : "✗"} ${domain}: ${score}% (${domainDec.length} decisions)`);
  }

  // ── Summary ────────────────────────────────────────────────────────────

  console.log("\n═══════════════════════════════════════════════════════════");
  const passed = results.filter(r => r.status === "PASS").length;
  const failed = results.filter(r => r.status === "FAIL").length;
  const skipped = results.filter(r => r.status === "SKIP").length;
  console.log(`  Results: ${passed} PASS, ${failed} FAIL, ${skipped} SKIP`);
  console.log(`  Total BusinessDecisions: ${allDecisions.length}`);
  console.log(`  Domains covered: ${Object.entries(domainScores).filter(([, s]) => s >= 90).map(([d]) => d).join(", ") || "none at 90%+"}`);
  console.log("═══════════════════════════════════════════════════════════\n");

  process.exit(failed > 0 ? 1 : 0);
}

main().catch(e => {
  console.error("Fatal error:", e);
  process.exit(1);
});
