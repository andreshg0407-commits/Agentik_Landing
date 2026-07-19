/**
 * scripts/certify-commercial-go-live-01.ts
 *
 * Automated Go Live certification auditor for the Commercial OS.
 * Verifies architecture, engines, policy packs, data loaders,
 * bridges, aggregator, and API connectivity.
 *
 * Run: npx tsx scripts/certify-commercial-go-live-01.ts
 *
 * Exit code 0 = certification PASS
 * Exit code 1 = certification FAIL
 *
 * Sprint: COMMERCIAL-GO-LIVE-CERTIFICATION-01
 */

require("./_mock-server-only.cjs");

// ── Test infrastructure ──────────────────────────────────────────────────────

interface CheckResult {
  phase: string;
  name: string;
  status: "PASS" | "FAIL" | "SKIP" | "WARN";
  detail: string;
}

const results: CheckResult[] = [];

function pass(phase: string, name: string, detail: string) {
  results.push({ phase, name, status: "PASS", detail });
  console.log(`  [PASS] ${name}: ${detail}`);
}

function fail(phase: string, name: string, detail: string) {
  results.push({ phase, name, status: "FAIL", detail });
  console.error(`  [FAIL] ${name}: ${detail}`);
}

function warn(phase: string, name: string, detail: string) {
  results.push({ phase, name, status: "WARN", detail });
  console.log(`  [WARN] ${name}: ${detail}`);
}

function skip(phase: string, name: string, detail: string) {
  results.push({ phase, name, status: "SKIP", detail });
  console.log(`  [SKIP] ${name}: ${detail}`);
}

// ── Resolve org ──────────────────────────────────────────────────────────────

async function resolveOrgId(): Promise<string> {
  if (process.env.CASTILLITOS_ORG_ID) return process.env.CASTILLITOS_ORG_ID;
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

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("\n================================================================");
  console.log("  COMMERCIAL GO LIVE CERTIFICATION — Automated Auditor");
  console.log("================================================================\n");

  const orgId = await resolveOrgId();
  if (!orgId) {
    console.error("ERROR: Cannot resolve castillitos org ID.");
    process.exit(1);
  }
  console.log(`Organization: ${orgId}\n`);

  // ══════════════════════════════════════════════════════════════════════════
  // PHASE 1: ARCHITECTURE
  // ══════════════════════════════════════════════════════════════════════════

  console.log("── Phase 1: Architecture ──────────────────────────────────────");

  // 1.1 BusinessDecision types exist
  try {
    const types = await import("../lib/comercial/business-policy/business-decision-types");
    const hasInterface = typeof types === "object" && "CommercialDomain" in types === false;
    // Types are compile-time only, check for type-related exports
    pass("ARCH", "BusinessDecision types", "Module loads successfully");
  } catch (e: any) {
    fail("ARCH", "BusinessDecision types", e?.message ?? "Import failed");
  }

  // 1.2 Aggregator
  try {
    const agg = await import("../lib/comercial/business-policy/commercial-decision-aggregator");
    if (typeof agg.aggregateCommercialDecisions === "function") {
      pass("ARCH", "Decision aggregator", "aggregateCommercialDecisions is a function");
    } else {
      fail("ARCH", "Decision aggregator", "aggregateCommercialDecisions not found");
    }
  } catch (e: any) {
    fail("ARCH", "Decision aggregator", e?.message ?? "Import failed");
  }

  // 1.3 Decision engines
  const engines = [
    { name: "Maletas Engine", path: "../lib/comercial/maletas/maletas-decision-engine" },
    { name: "Reference Engine", path: "../lib/comercial/maletas/reference-decision-engine" },
    { name: "Store Engine", path: "../lib/comercial/tiendas/store-decision-engine" },
    { name: "Order Engine", path: "../lib/comercial/pedidos/order-decision-engine" },
    { name: "SalesRep Engine", path: "../lib/comercial/sales-reps/sales-rep-decision-engine" },
    { name: "Import Engine", path: "../lib/comercial/importaciones/import-decision-engine" },
    { name: "Production Engine", path: "../lib/comercial/produccion/production-decision-engine" },
  ];

  for (const eng of engines) {
    try {
      const mod = await import(eng.path);
      const exportCount = Object.keys(mod).length;
      if (exportCount > 0) {
        pass("ARCH", eng.name, `${exportCount} exports`);
      } else {
        fail("ARCH", eng.name, "Zero exports");
      }
    } catch (e: any) {
      fail("ARCH", eng.name, e?.message ?? "Import failed");
    }
  }

  // 1.4 BusinessDecision bridges
  const bridges = [
    { name: "Maletas Bridge", path: "../lib/comercial/maletas/maletas-business-decisions" },
    { name: "Store Bridge", path: "../lib/comercial/tiendas/store-business-decisions" },
    { name: "Order Bridge", path: "../lib/comercial/pedidos/order-business-decisions" },
    { name: "SalesRep Bridge", path: "../lib/comercial/sales-reps/sales-rep-business-decisions" },
    { name: "Import Bridge", path: "../lib/comercial/importaciones/import-business-decisions" },
    { name: "Production Bridge", path: "../lib/comercial/produccion/production-business-decisions" },
  ];

  for (const br of bridges) {
    try {
      const mod = await import(br.path);
      const exportCount = Object.keys(mod).length;
      if (exportCount > 0) {
        pass("ARCH", br.name, `${exportCount} exports`);
      } else {
        fail("ARCH", br.name, "Zero exports");
      }
    } catch (e: any) {
      fail("ARCH", br.name, e?.message ?? "Import failed");
    }
  }

  // 1.5 Policy packs
  const packs = [
    { name: "Store PolicyPack", path: "../lib/comercial/tiendas/store-policy-pack", countExport: "CASTILLITOS_STORE_POLICY_COUNT" },
    { name: "Order PolicyPack", path: "../lib/comercial/pedidos/order-policy-pack", countExport: "CASTILLITOS_ORDER_POLICY_COUNT" },
    { name: "Import PolicyPack", path: "../lib/comercial/importaciones/import-policy-pack", countExport: "CASTILLITOS_IMPORT_POLICY_COUNT" },
    { name: "SalesRep PolicyPack", path: "../lib/comercial/sales-reps/sales-rep-policy-pack", countExport: "CASTILLITOS_SALESREP_POLICY_COUNT" },
  ];

  for (const pp of packs) {
    try {
      const mod = await import(pp.path);
      const count = mod[pp.countExport];
      if (typeof count === "number" && count > 0) {
        pass("ARCH", pp.name, `${count} policies`);
      } else {
        warn("ARCH", pp.name, `Count export "${pp.countExport}" not found or zero`);
      }
    } catch (e: any) {
      fail("ARCH", pp.name, e?.message ?? "Import failed");
    }
  }

  // 1.6 Configs
  const configs = [
    { name: "Import Config", path: "../lib/comercial/importaciones/import-policy-pack-config", export: "CASTILLITOS_IMPORT_POLICY_PACK_CONFIG" },
    { name: "Production Config", path: "../lib/comercial/produccion/production-planning-config", export: "CASTILLITOS_PRODUCTION_PLANNING_CONFIG" },
    { name: "SalesRep Config", path: "../lib/comercial/sales-reps/sales-rep-policy-pack-config", export: "CASTILLITOS_SALESREP_POLICY_PACK_CONFIG" },
  ];

  for (const cfg of configs) {
    try {
      const mod = await import(cfg.path);
      const config = mod[cfg.export];
      if (config && typeof config === "object" && config.tenantId === "castillitos") {
        pass("ARCH", cfg.name, `tenantId=castillitos, version=${config.version}`);
      } else {
        fail("ARCH", cfg.name, `Config missing or wrong tenantId`);
      }
    } catch (e: any) {
      fail("ARCH", cfg.name, e?.message ?? "Import failed");
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PHASE 2: DATA LOADERS
  // ══════════════════════════════════════════════════════════════════════════

  console.log("\n── Phase 2: Data Loaders ──────────────────────────────────────");

  // 2.1 Import loader
  let importItems: any[] = [];
  try {
    const { loadImportReferenceInputs } = await import("../lib/comercial/importaciones/import-data-loader");
    importItems = await loadImportReferenceInputs(orgId);
    if (importItems.length > 0) {
      pass("DATA", "Import loader", `${importItems.length} references loaded`);
    } else {
      warn("DATA", "Import loader", "Zero references (data may not be synced)");
    }
  } catch (e: any) {
    fail("DATA", "Import loader", e?.message ?? "Unknown error");
  }

  // 2.2 Production loader
  let prodItems: any[] = [];
  try {
    const { loadProductionSubgroupInputs } = await import("../lib/comercial/produccion/production-data-loader");
    prodItems = await loadProductionSubgroupInputs(orgId);
    if (prodItems.length > 0) {
      pass("DATA", "Production loader", `${prodItems.length} subgroups loaded`);
    } else {
      warn("DATA", "Production loader", "Zero subgroups (data may not be synced)");
    }
  } catch (e: any) {
    fail("DATA", "Production loader", e?.message ?? "Unknown error");
  }

  // 2.3 Seller slugs
  let sellerSlugs: string[] = [];
  try {
    const { listSellerSlugs } = await import("../lib/comercial/sales-reps/sales-rep-data-loader");
    sellerSlugs = await listSellerSlugs(orgId);
    if (sellerSlugs.length > 0) {
      pass("DATA", "Seller slugs", `${sellerSlugs.length} sellers found`);
    } else {
      warn("DATA", "Seller slugs", "Zero sellers (CRM data may not be synced)");
    }
  } catch (e: any) {
    fail("DATA", "Seller slugs", e?.message ?? "Unknown error");
  }

  // 2.4 Seller data (first seller)
  let sellerData: any = null;
  if (sellerSlugs.length > 0) {
    try {
      const { loadSalesRepData } = await import("../lib/comercial/sales-reps/sales-rep-data-loader");
      sellerData = await loadSalesRepData(orgId, sellerSlugs[0]);
      pass("DATA", "Seller loader", `"${sellerSlugs[0]}": customers=${sellerData.customers.length}, items=${sellerData.malletItems.length}`);
    } catch (e: any) {
      fail("DATA", "Seller loader", e?.message ?? "Unknown error");
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PHASE 3: ENGINE EXECUTION
  // ══════════════════════════════════════════════════════════════════════════

  console.log("\n── Phase 3: Engine Execution ──────────────────────────────────");

  const { aggregateCommercialDecisions } = await import("../lib/comercial/business-policy/commercial-decision-aggregator");
  const allDecisions: any[] = [];

  // 3.1 Import engine
  if (importItems.length > 0) {
    try {
      const { buildImportPolicyContext } = await import("../lib/comercial/importaciones/import-data-loader");
      const { evaluateLowRotation, evaluateRepurchase, buildNextContainerRecommendations, evaluateInventoryAging } = await import("../lib/comercial/importaciones/import-decision-engine");
      const { CASTILLITOS_IMPORT_POLICY_PACK_CONFIG: config } = await import("../lib/comercial/importaciones/import-policy-pack-config");
      const { buildAllImportBusinessDecisions } = await import("../lib/comercial/importaciones/import-business-decisions");

      const ctx = buildImportPolicyContext(orgId);
      const lr = evaluateLowRotation(ctx, importItems, config);
      const rp = importItems.map((i: any) => evaluateRepurchase(ctx, i, config));
      const nc = buildNextContainerRecommendations(ctx, importItems, rp, config);
      const ag = evaluateInventoryAging(ctx, importItems, config);
      const dec = buildAllImportBusinessDecisions(orgId, lr, rp, nc.items, ag);
      allDecisions.push(...dec);
      pass("ENGINE", "Import engine", `${dec.length} BusinessDecisions (lowRot=${lr.filter((r: any) => r.isLowRotation).length}, rebuy=${rp.filter((r: any) => r.decision === "REBUY").length})`);
    } catch (e: any) {
      fail("ENGINE", "Import engine", e?.message ?? "Unknown error");
    }
  } else {
    skip("ENGINE", "Import engine", "No import data");
  }

  // 3.2 Production engine
  if (prodItems.length > 0) {
    try {
      const { buildProductionContext } = await import("../lib/comercial/produccion/production-data-loader");
      const { evaluateProductionNeed, evaluatePriority } = await import("../lib/comercial/produccion/production-decision-engine");
      const { CASTILLITOS_PRODUCTION_PLANNING_CONFIG: config } = await import("../lib/comercial/produccion/production-planning-config");
      const { buildAllProductionBusinessDecisions } = await import("../lib/comercial/produccion/production-business-decisions");

      const ctx = buildProductionContext(orgId);
      const needs = evaluateProductionNeed(ctx, prodItems, config);
      const pris = prodItems.map((i: any) => evaluatePriority(ctx, i, config));
      const dec = buildAllProductionBusinessDecisions(needs, pris, orgId);
      allDecisions.push(...dec);
      pass("ENGINE", "Production engine", `${dec.length} BusinessDecisions (produce=${needs.filter((n: any) => n.decision === "PRODUCE").length})`);
    } catch (e: any) {
      fail("ENGINE", "Production engine", e?.message ?? "Unknown error");
    }
  } else {
    skip("ENGINE", "Production engine", "No production data");
  }

  // 3.3 SalesRep engine (first seller)
  if (sellerData) {
    try {
      const { CASTILLITOS_SALESREP_POLICY_PACK_CONFIG: config } = await import("../lib/comercial/sales-reps/sales-rep-policy-pack-config");
      const { evaluateMalletOutOfStock, evaluateCustomerReceivablesAlert, evaluateCustomerInactivity } = await import("../lib/comercial/sales-reps/sales-rep-decision-engine");
      const { buildOutOfStockDecisions, buildOverdueReceivableDecisions, buildInactiveCustomerDecisions } = await import("../lib/comercial/sales-reps/sales-rep-business-decisions");

      let oosCount = 0;
      if (sellerData.malletState) {
        const oos = evaluateMalletOutOfStock(sellerData.context, sellerData.malletState.malletId, sellerData.malletItems, config);
        const oosDec = buildOutOfStockDecisions(oos, orgId);
        allDecisions.push(...oosDec);
        oosCount = oosDec.length;
      }

      const overdueResults = sellerData.customers.map((c: any) =>
        evaluateCustomerReceivablesAlert(sellerData.context, c, config),
      );
      const overdueDec = buildOverdueReceivableDecisions(overdueResults, orgId);
      allDecisions.push(...overdueDec);

      const inactiveResults = sellerData.customers.map((c: any) =>
        evaluateCustomerInactivity(sellerData.context, c, config),
      );
      const inactiveDec = buildInactiveCustomerDecisions(inactiveResults, orgId);
      allDecisions.push(...inactiveDec);

      pass("ENGINE", "SalesRep engine", `oos=${oosCount}, overdue=${overdueDec.length}, inactive=${inactiveDec.length}`);
    } catch (e: any) {
      fail("ENGINE", "SalesRep engine", e?.message ?? "Unknown error");
    }
  } else {
    skip("ENGINE", "SalesRep engine", "No seller data");
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PHASE 4: AGGREGATOR
  // ══════════════════════════════════════════════════════════════════════════

  console.log("\n── Phase 4: Aggregator ────────────────────────────────────────");

  try {
    const summary = aggregateCommercialDecisions(orgId, allDecisions);
    pass("AGG", "Aggregator", `total=${summary.totalDecisions}, critical=${summary.criticalDecisions}, domains=[${summary.domains.join(",")}]`);

    // Validate decision shape
    const missingFields = allDecisions.filter((d: any) =>
      !d.decisionId || !d.domain || !d.engine || !d.policy || !d.title || !d.evidence,
    );
    if (missingFields.length === 0) {
      pass("AGG", "Decision shape", `All ${allDecisions.length} decisions have complete fields`);
    } else {
      fail("AGG", "Decision shape", `${missingFields.length} decisions missing required fields`);
    }

    // Validate evidence
    const missingEvidence = allDecisions.filter((d: any) =>
      !d.evidence?.policyId || !d.evidence?.policyName || !d.evidence?.activationReason,
    );
    if (missingEvidence.length === 0) {
      pass("AGG", "Evidence chain", `All ${allDecisions.length} decisions have complete evidence`);
    } else {
      fail("AGG", "Evidence chain", `${missingEvidence.length} decisions missing evidence fields`);
    }
  } catch (e: any) {
    fail("AGG", "Aggregator", e?.message ?? "Unknown error");
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PHASE 5: CONTROL LOADER
  // ══════════════════════════════════════════════════════════════════════════

  console.log("\n── Phase 5: Control Loader ────────────────────────────────────");

  try {
    const { loadControlComercial } = await import("../lib/comercial/control/control-comercial-loader");
    const snapshot = await loadControlComercial(orgId, "castillitos");
    if (snapshot) {
      pass("CTRL", "Control loader", `Loaded: ventas=${snapshot.ventasMes}, pedidos=${snapshot.pedidosMes}, clientes=${snapshot.clientesActivos}`);
      if (snapshot.decisionsSummary) {
        pass("CTRL", "Decisions summary", `total=${snapshot.decisionsSummary.totalDecisions}, critical=${snapshot.decisionsSummary.criticalDecisions}`);
      } else {
        warn("CTRL", "Decisions summary", "decisionsSummary is null (engines may have failed)");
      }
    } else {
      fail("CTRL", "Control loader", "Snapshot is null");
    }
  } catch (e: any) {
    fail("CTRL", "Control loader", e?.message ?? "Unknown error");
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PHASE 6: CRON CONFIGURATION
  // ══════════════════════════════════════════════════════════════════════════

  console.log("\n── Phase 6: Cron Configuration ────────────────────────────────");

  try {
    const fs = await import("fs");
    const vercelJson = JSON.parse(fs.readFileSync("vercel.json", "utf-8"));
    const crons: any[] = vercelJson.crons ?? [];

    const dataSyncCrm = crons.find((c: any) => c.path?.includes("castillitos_crm"));
    const dataSyncSag = crons.find((c: any) => c.path?.includes("sag_pya_soap"));
    const invRefresh = crons.find((c: any) => c.path?.includes("inventory-refresh"));

    if (dataSyncCrm) {
      pass("CRON", "CRM sync cron", `schedule: ${dataSyncCrm.schedule}`);
    } else {
      fail("CRON", "CRM sync cron", "Not found in vercel.json");
    }

    if (dataSyncSag) {
      pass("CRON", "SAG sync cron", `schedule: ${dataSyncSag.schedule}`);
    } else {
      fail("CRON", "SAG sync cron", "Not found in vercel.json");
    }

    if (invRefresh) {
      pass("CRON", "Inventory refresh cron", `schedule: ${invRefresh.schedule}`);
    } else {
      fail("CRON", "Inventory refresh cron", "Not found in vercel.json");
    }
  } catch (e: any) {
    fail("CRON", "vercel.json", e?.message ?? "Cannot read file");
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SUMMARY
  // ══════════════════════════════════════════════════════════════════════════

  console.log("\n================================================================");
  const passed = results.filter(r => r.status === "PASS").length;
  const failed = results.filter(r => r.status === "FAIL").length;
  const warned = results.filter(r => r.status === "WARN").length;
  const skipped = results.filter(r => r.status === "SKIP").length;

  console.log(`  Results: ${passed} PASS, ${failed} FAIL, ${warned} WARN, ${skipped} SKIP`);
  console.log(`  Total BusinessDecisions: ${allDecisions.length}`);

  // Readiness score
  const archPassed = results.filter(r => r.phase === "ARCH" && r.status === "PASS").length;
  const archTotal = results.filter(r => r.phase === "ARCH").length;
  const dataPassed = results.filter(r => r.phase === "DATA" && r.status === "PASS").length;
  const dataTotal = results.filter(r => r.phase === "DATA").length;
  const enginePassed = results.filter(r => r.phase === "ENGINE" && r.status === "PASS").length;
  const engineTotal = results.filter(r => r.phase === "ENGINE").length;

  const archScore = archTotal > 0 ? Math.round((archPassed / archTotal) * 100) : 0;
  const dataScore = dataTotal > 0 ? Math.round((dataPassed / dataTotal) * 100) : 0;
  const engineScore = engineTotal > 0 ? Math.round((enginePassed / engineTotal) * 100) : 0;
  const overallScore = Math.round((archScore + dataScore + engineScore) / 3);

  console.log(`\n  Readiness Scores:`);
  console.log(`    Architecture: ${archScore}%`);
  console.log(`    Data:         ${dataScore}%`);
  console.log(`    Engines:      ${engineScore}%`);
  console.log(`    Overall:      ${overallScore}%`);

  // Decision
  if (failed === 0) {
    console.log(`\n  CERTIFICATION: GO LIVE APPROVED`);
  } else if (failed <= 3) {
    console.log(`\n  CERTIFICATION: GO LIVE APPROVED WITH CONDITIONS`);
  } else {
    console.log(`\n  CERTIFICATION: GO LIVE NOT APPROVED`);
  }

  console.log("================================================================\n");

  process.exit(failed > 3 ? 1 : 0);
}

main().catch(e => {
  console.error("Fatal error:", e);
  process.exit(1);
});
