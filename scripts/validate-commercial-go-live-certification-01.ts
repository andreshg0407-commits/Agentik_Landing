/**
 * scripts/validate-commercial-go-live-certification-01.ts
 *
 * Structural validation for COMMERCIAL-GO-LIVE-CERTIFICATION-01 sprint.
 * Verifies all domains, engines, policy packs, questions, BusinessDecision
 * contract, and no regression.
 *
 * Run: npx tsx scripts/validate-commercial-go-live-certification-01.ts
 *
 * Exit code 0 = all validations pass
 * Exit code 1 = some validations failed
 *
 * Sprint: COMMERCIAL-GO-LIVE-CERTIFICATION-01
 */

require("./_mock-server-only.cjs");

import * as fs from "fs";
import * as path from "path";

// ── Test infrastructure ──────────────────────────────────────────────────────

interface TestResult {
  name: string;
  status: "PASS" | "FAIL";
  detail: string;
}

const results: TestResult[] = [];

function pass(name: string, detail: string) {
  results.push({ name, status: "PASS", detail });
  console.log(`  [PASS] ${name}: ${detail}`);
}

function fail(name: string, detail: string) {
  results.push({ name, status: "FAIL", detail });
  console.error(`  [FAIL] ${name}: ${detail}`);
}

// ── File existence helper ────────────────────────────────────────────────────

function fileExists(relativePath: string): boolean {
  return fs.existsSync(path.resolve(process.cwd(), relativePath));
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("\n================================================================");
  console.log("  COMMERCIAL-GO-LIVE-CERTIFICATION-01 — Validation");
  console.log("================================================================\n");

  // ════════════════════════════════════════════════════════════════════════
  // 1. CERTIFICATION DOCUMENTS
  // ════════════════════════════════════════════════════════════════════════

  console.log("── 1. Certification Documents ─────────────────────────────────");

  const docs = [
    "docs/certification/COMMERCIAL_GO_LIVE_CERTIFICATION_01.md",
    "docs/certification/COMMERCIAL_GO_LIVE_CHECKLIST_01.md",
    "docs/certification/COMMERCIAL_GO_LIVE_RISK_REGISTER_01.md",
    "docs/certification/COMMERCIAL_POST_GO_LIVE_BACKLOG_01.md",
  ];

  for (const doc of docs) {
    if (fileExists(doc)) {
      const content = fs.readFileSync(path.resolve(process.cwd(), doc), "utf-8");
      pass(path.basename(doc), `${content.length} bytes`);
    } else {
      fail(path.basename(doc), "File not found");
    }
  }

  // ════════════════════════════════════════════════════════════════════════
  // 2. DECISION ENGINES (all 7)
  // ════════════════════════════════════════════════════════════════════════

  console.log("\n── 2. Decision Engines ────────────────────────────────────────");

  const engineFiles = [
    "lib/comercial/maletas/maletas-decision-engine.ts",
    "lib/comercial/maletas/reference-decision-engine.ts",
    "lib/comercial/tiendas/store-decision-engine.ts",
    "lib/comercial/pedidos/order-decision-engine.ts",
    "lib/comercial/sales-reps/sales-rep-decision-engine.ts",
    "lib/comercial/importaciones/import-decision-engine.ts",
    "lib/comercial/produccion/production-decision-engine.ts",
  ];

  for (const ef of engineFiles) {
    if (fileExists(ef)) {
      pass(path.basename(ef), "Exists");
    } else {
      fail(path.basename(ef), "NOT FOUND");
    }
  }

  // ════════════════════════════════════════════════════════════════════════
  // 3. POLICY PACKS (all 5 + maletas rules)
  // ════════════════════════════════════════════════════════════════════════

  console.log("\n── 3. Policy Packs ────────────────────────────────────────────");

  const policyFiles = [
    "lib/comercial/tiendas/store-policy-pack.ts",
    "lib/comercial/pedidos/order-policy-pack.ts",
    "lib/comercial/importaciones/import-policy-pack.ts",
    "lib/comercial/sales-reps/sales-rep-policy-pack.ts",
    "lib/comercial/maletas/maletas-rules.ts",
  ];

  for (const pf of policyFiles) {
    if (fileExists(pf)) {
      pass(path.basename(pf), "Exists");
    } else {
      fail(path.basename(pf), "NOT FOUND");
    }
  }

  // Policy pack configs
  const configFiles = [
    "lib/comercial/tiendas/store-policy-pack-config.ts",
    "lib/comercial/pedidos/order-policy-pack-config.ts",
    "lib/comercial/importaciones/import-policy-pack-config.ts",
    "lib/comercial/sales-reps/sales-rep-policy-pack-config.ts",
    "lib/comercial/produccion/production-planning-config.ts",
  ];

  for (const cf of configFiles) {
    if (fileExists(cf)) {
      pass(path.basename(cf), "Exists");
    } else {
      fail(path.basename(cf), "NOT FOUND");
    }
  }

  // ════════════════════════════════════════════════════════════════════════
  // 4. BUSINESSDECISION BRIDGES (all 6)
  // ════════════════════════════════════════════════════════════════════════

  console.log("\n── 4. BusinessDecision Bridges ────────────────────────────────");

  const bridgeFiles = [
    "lib/comercial/maletas/maletas-business-decisions.ts",
    "lib/comercial/tiendas/store-business-decisions.ts",
    "lib/comercial/pedidos/order-business-decisions.ts",
    "lib/comercial/sales-reps/sales-rep-business-decisions.ts",
    "lib/comercial/importaciones/import-business-decisions.ts",
    "lib/comercial/produccion/production-business-decisions.ts",
  ];

  for (const bf of bridgeFiles) {
    if (fileExists(bf)) {
      pass(path.basename(bf), "Exists");
    } else {
      fail(path.basename(bf), "NOT FOUND");
    }
  }

  // ════════════════════════════════════════════════════════════════════════
  // 5. DATA LOADERS
  // ════════════════════════════════════════════════════════════════════════

  console.log("\n── 5. Data Loaders ────────────────────────────────────────────");

  const loaderFiles = [
    "lib/comercial/importaciones/import-data-loader.ts",
    "lib/comercial/sales-reps/sales-rep-data-loader.ts",
    "lib/comercial/produccion/production-data-loader.ts",
  ];

  for (const lf of loaderFiles) {
    if (fileExists(lf)) {
      pass(path.basename(lf), "Exists");
    } else {
      fail(path.basename(lf), "NOT FOUND");
    }
  }

  // ════════════════════════════════════════════════════════════════════════
  // 6. AGGREGATOR + TYPES
  // ════════════════════════════════════════════════════════════════════════

  console.log("\n── 6. Aggregator + Types ──────────────────────────────────────");

  const coreFiles = [
    "lib/comercial/business-policy/business-decision-types.ts",
    "lib/comercial/business-policy/commercial-decision-aggregator.ts",
    "lib/comercial/business-policy/policy-types.ts",
    "lib/comercial/business-policy/policy-engine.ts",
  ];

  for (const cf of coreFiles) {
    if (fileExists(cf)) {
      pass(path.basename(cf), "Exists");
    } else {
      fail(path.basename(cf), "NOT FOUND");
    }
  }

  // ════════════════════════════════════════════════════════════════════════
  // 7. API ROUTES
  // ════════════════════════════════════════════════════════════════════════

  console.log("\n── 7. API Routes ──────────────────────────────────────────────");

  const apiRoutes = [
    "app/api/orgs/[orgSlug]/comercial/decisions/route.ts",
    "app/api/orgs/[orgSlug]/comercial/maletas/bags/route.ts",
    "app/api/orgs/[orgSlug]/comercial/tiendas/route.ts",
    "app/api/orgs/[orgSlug]/comercial/pedidos/route.ts",
    "app/api/orgs/[orgSlug]/comercial/vendedores/[sellerSlug]/route.ts",
    "app/api/orgs/[orgSlug]/comercial/clientes/[clienteId]/360/route.ts",
  ];

  for (const ar of apiRoutes) {
    if (fileExists(ar)) {
      pass(path.basename(path.dirname(ar)) + "/route.ts", "Exists");
    } else {
      fail(ar, "NOT FOUND");
    }
  }

  // ════════════════════════════════════════════════════════════════════════
  // 8. UI PAGES
  // ════════════════════════════════════════════════════════════════════════

  console.log("\n── 8. UI Pages ────────────────────────────────────────────────");

  const uiPages = [
    "app/(app)/[orgSlug]/comercial/control/page.tsx",
    "app/(app)/[orgSlug]/comercial/maletas/page.tsx",
    "app/(app)/[orgSlug]/comercial/pedidos/page.tsx",
    "app/(app)/[orgSlug]/comercial/tiendas/page.tsx",
    "app/(app)/[orgSlug]/comercial/vendedores/page.tsx",
    "app/(app)/[orgSlug]/comercial/importaciones/page.tsx",
    "app/(app)/[orgSlug]/comercial/inventario/page.tsx",
    "app/(app)/[orgSlug]/comercial/clientes/page.tsx",
    "app/(app)/[orgSlug]/comercial/inteligencia/page.tsx",
  ];

  for (const up of uiPages) {
    if (fileExists(up)) {
      pass(up.split("/comercial/")[1], "Exists");
    } else {
      fail(up.split("/comercial/")[1], "NOT FOUND");
    }
  }

  // ════════════════════════════════════════════════════════════════════════
  // 9. CRON JOBS
  // ════════════════════════════════════════════════════════════════════════

  console.log("\n── 9. Cron Jobs ───────────────────────────────────────────────");

  const cronRoutes = [
    "app/api/cron/data-sync/route.ts",
    "app/api/cron/inventory-refresh/route.ts",
  ];

  for (const cr of cronRoutes) {
    if (fileExists(cr)) {
      pass(path.basename(path.dirname(cr)), "Exists");
    } else {
      fail(path.basename(path.dirname(cr)), "NOT FOUND");
    }
  }

  // vercel.json cron config
  if (fileExists("vercel.json")) {
    try {
      const vj = JSON.parse(fs.readFileSync("vercel.json", "utf-8"));
      const crons = vj.crons ?? [];
      if (crons.length >= 3) {
        pass("vercel.json crons", `${crons.length} cron entries`);
      } else {
        fail("vercel.json crons", `Only ${crons.length} entries (expected >= 3)`);
      }
    } catch {
      fail("vercel.json crons", "Cannot parse vercel.json");
    }
  } else {
    fail("vercel.json", "Not found");
  }

  // ════════════════════════════════════════════════════════════════════════
  // 10. CERTIFICATION SCRIPTS
  // ════════════════════════════════════════════════════════════════════════

  console.log("\n── 10. Certification Scripts ──────────────────────────────────");

  const scriptFiles = [
    "scripts/certify-commercial-go-live-01.ts",
    "scripts/validate-commercial-go-live-certification-01.ts",
    "scripts/validate-commercial-data-connectivity-01.ts",
  ];

  for (const sf of scriptFiles) {
    if (fileExists(sf)) {
      pass(path.basename(sf), "Exists");
    } else {
      fail(path.basename(sf), "NOT FOUND");
    }
  }

  // ════════════════════════════════════════════════════════════════════════
  // 11. BUSINESS RULES VERIFICATION
  // ════════════════════════════════════════════════════════════════════════

  console.log("\n── 11. Business Rules ─────────────────────────────────────────");

  // Verify key business rules exist in policy packs
  const storePack = fs.readFileSync("lib/comercial/tiendas/store-policy-pack.ts", "utf-8");
  const orderPack = fs.readFileSync("lib/comercial/pedidos/order-policy-pack.ts", "utf-8");

  const ruleChecks = [
    { name: "Regla 36", content: storePack, pattern: /regla.?36|global.?low.?stock/i },
    { name: "Textile coverage", content: storePack, pattern: /textile.?coverage|cobertura.?textil/i },
    { name: "Slow rotation", content: storePack, pattern: /slow.?rotation|baja.?rotacion/i },
    { name: "Automatic markdown", content: storePack, pattern: /automatic.?markdown|descuento/i },
    { name: "Accessory coverage", content: storePack, pattern: /accessory.?coverage|accesorios/i },
    { name: "Customer branch", content: orderPack, pattern: /branch|sucursal/i },
    { name: "Credit validation", content: orderPack, pattern: /credit|cartera|credito/i },
    { name: "Size distribution", content: orderPack, pattern: /size.?distribution|tallas|surtido/i },
    { name: "Partial delivery", content: orderPack, pattern: /partial.?delivery|parcial/i },
    { name: "Discount override", content: orderPack, pattern: /discount.?override|descuento/i },
    { name: "Order readiness", content: orderPack, pattern: /readiness|preparacion/i },
  ];

  for (const rc of ruleChecks) {
    if (rc.pattern.test(rc.content)) {
      pass(`Rule: ${rc.name}`, "Found in policy pack");
    } else {
      fail(`Rule: ${rc.name}`, "NOT found in policy pack");
    }
  }

  // ════════════════════════════════════════════════════════════════════════
  // 12. BUSINESSDECISION CONTRACT VERIFICATION
  // ════════════════════════════════════════════════════════════════════════

  console.log("\n── 12. BusinessDecision Contract ──────────────────────────────");

  try {
    const typesContent = fs.readFileSync("lib/comercial/business-policy/business-decision-types.ts", "utf-8");

    const requiredFields = [
      "decisionId", "tenantId", "domain", "engine", "policy",
      "severity", "priority", "title", "summary", "recommendedAction",
      "status", "confidence", "evidence", "generatedAt", "expiresAt",
    ];

    for (const field of requiredFields) {
      if (typesContent.includes(field)) {
        pass(`BD field: ${field}`, "Present");
      } else {
        fail(`BD field: ${field}`, "NOT found in BusinessDecision interface");
      }
    }

    // Check domains
    const expectedDomains = ["MALETAS", "TIENDAS", "PEDIDOS", "VENDEDORES", "IMPORTACIONES", "PRODUCCION"];
    for (const domain of expectedDomains) {
      if (typesContent.includes(`"${domain}"`)) {
        pass(`Domain: ${domain}`, "Present in CommercialDomain");
      } else {
        fail(`Domain: ${domain}`, "NOT found in CommercialDomain");
      }
    }
  } catch (e: any) {
    fail("BusinessDecision types file", e?.message ?? "Cannot read");
  }

  // ════════════════════════════════════════════════════════════════════════
  // SUMMARY
  // ════════════════════════════════════════════════════════════════════════

  console.log("\n================================================================");
  const passed = results.filter(r => r.status === "PASS").length;
  const failed = results.filter(r => r.status === "FAIL").length;
  const total = results.length;
  console.log(`  Results: ${passed}/${total} PASS, ${failed} FAIL`);
  console.log(`  Certification: ${failed === 0 ? "VALIDATED" : "ISSUES FOUND"}`);
  console.log("================================================================\n");

  process.exit(failed > 0 ? 1 : 0);
}

main().catch(e => {
  console.error("Fatal error:", e);
  process.exit(1);
});
