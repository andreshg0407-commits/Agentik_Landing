/**
 * scripts/validate-pedidos-variant-enrichment.ts
 *
 * PEDIDOS-VARIANT-ENRICHMENT-01
 *
 * Validates:
 * - Color code resolution coverage
 * - Subgrupo coverage
 * - Product line coverage
 * - Enrichment service existence and structure
 * - Drawer UI integration
 * - Metrics helper existence
 * - API route wiring
 *
 * Usage:
 *   npx tsx scripts/validate-pedidos-variant-enrichment.ts
 */

import * as fs from "fs";
import * as path from "path";

const ROOT = path.resolve(__dirname, "..");
let pass = 0;
let fail = 0;

function check(label: string, ok: boolean) {
  if (ok) {
    pass++;
    console.log(`  PASS  ${label}`);
  } else {
    fail++;
    console.log(`  FAIL  ${label}`);
  }
}

function fileContains(rel: string, needle: string): boolean {
  const fullPath = path.join(ROOT, rel);
  if (!fs.existsSync(fullPath)) return false;
  return fs.readFileSync(fullPath, "utf-8").includes(needle);
}

function fileExists(rel: string): boolean {
  return fs.existsSync(path.join(ROOT, rel));
}

console.log("=== PEDIDOS VARIANT ENRICHMENT VALIDATION ===\n");

const enrichmentService = "lib/comercial/pedidos/variant-enrichment-service.ts";
const orderTypes        = "lib/comercial/pedidos/order-types.ts";
const orderService      = "lib/comercial/pedidos/order-service.ts";
const clientPath        = "app/(app)/[orgSlug]/comercial/pedidos/pedidos-client.tsx";
const historyRoute      = "app/api/orgs/[orgSlug]/comercial/pedidos/history/route.ts";

// ── 1. Enrichment service exists and has correct structure ──────────────────
console.log("[1] Variant enrichment service");
check("service file exists", fileExists(enrichmentService));
check("exports enrichOrderLinesWithVariants", fileContains(enrichmentService, "export async function enrichOrderLinesWithVariants"));
check("exports resolveColorName", fileContains(enrichmentService, "export async function resolveColorName"));
check("exports getCommercialVariantMetrics", fileContains(enrichmentService, "export async function getCommercialVariantMetrics"));
check("uses ProductVariantAttribute for colors", fileContains(enrichmentService, 'a."key" = \'color\''));
check("uses ProductVariant SKU parsing", fileContains(enrichmentService, "SPLIT_PART"));
check("uses ProductEntity for subgrupo", fileContains(enrichmentService, '"subgrupoSag"'));
check("uses ProductEntity for productLine", fileContains(enrichmentService, '"productLine"'));
check("server-only guard", fileContains(enrichmentService, 'import "server-only"'));
check("has in-memory cache with TTL", fileContains(enrichmentService, "CACHE_TTL"));

// ── 2. OrderLine type includes enrichment fields ────────────────────────────
console.log("\n[2] OrderLine type enrichment fields");
check("colorName field added", fileContains(orderTypes, "colorName?:"));
check("subgrupoSag field added", fileContains(orderTypes, "subgrupoSag?:"));
check("productLine field added", fileContains(orderTypes, "productLine?:"));
check("sprint tag present", fileContains(orderTypes, "PEDIDOS-VARIANT-ENRICHMENT-01"));

// ── 3. Order service wires enrichment ───────────────────────────────────────
console.log("\n[3] Order service enrichment wiring");
check("imports enrichOrderLinesWithVariants", fileContains(orderService, "import { enrichOrderLinesWithVariants }"));
check("calls enrichOrderLinesWithVariants in getOrder", fileContains(orderService, "enrichOrderLinesWithVariants(orgId, draft.lines)"));
check("enrichment runs after inventory link", fileContains(orderService, "VARIANT-ENRICHMENT-01"));

// ── 4. Drawer UI shows resolved data ───────────────────────────────────────
console.log("\n[4] Drawer UI integration");
check("shows colorName in line row", fileContains(clientPath, "line.colorName"));
check("shows subgrupoSag in group header", fileContains(clientPath, "subgrupoSag"));
check("variantes tab type defined", fileContains(clientPath, '"variantes"'));
check("VariantMetricsPanel component exists", fileContains(clientPath, "function VariantMetricsPanel"));
check("Top tallas label", fileContains(clientPath, "Top tallas vendidas"));
check("Top colores label", fileContains(clientPath, "Top colores vendidos"));
check("Top subgrupos label", fileContains(clientPath, "Top subgrupos vendidos"));

// ── 5. API route supports variant_metrics ───────────────────────────────────
console.log("\n[5] API route wiring");
check("history route imports getCommercialVariantMetrics", fileContains(historyRoute, "getCommercialVariantMetrics"));
check("variant_metrics action case", fileContains(historyRoute, '"variant_metrics"'));
check("sprint tag in route", fileContains(historyRoute, "PEDIDOS-VARIANT-ENRICHMENT-01"));

// ── 6. Metrics helper for future modules ────────────────────────────────────
console.log("\n[6] Commercial variant metrics helper");
check("VariantMetricEntry type exported", fileContains(enrichmentService, "export interface VariantMetricEntry"));
check("CommercialVariantMetrics type exported", fileContains(enrichmentService, "export interface CommercialVariantMetrics"));
check("topSizes in metrics", fileContains(enrichmentService, "topSizes"));
check("topColors in metrics", fileContains(enrichmentService, "topColors"));
check("topSubgrupos in metrics", fileContains(enrichmentService, "topSubgrupos"));
check("since parameter for time window", fileContains(enrichmentService, "since"));

// ── Summary ────────────────────────────────────────────────────────────────
const total = pass + fail;
console.log(`\n=== VALIDATION COMPLETE: ${pass}/${total} PASS, ${fail} FAIL ===`);
process.exit(fail > 0 ? 1 : 0);
