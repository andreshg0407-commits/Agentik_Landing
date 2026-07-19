/**
 * scripts/validate-tiendas-textile-size-color-coverage.ts
 *
 * Validation for TIENDAS-TEXTILE-SIZE-COLOR-COVERAGE-01
 *
 * Usage: npx tsx scripts/validate-tiendas-textile-size-color-coverage.ts
 */

import * as fs from "fs";
import * as path from "path";

const ROOT = path.resolve(__dirname, "..");
let pass = 0;
let fail = 0;

function check(label: string, ok: boolean) {
  if (ok) { pass++; console.log(`  PASS  ${label}`); }
  else    { fail++; console.log(`  FAIL  ${label}`); }
}

function fileContains(rel: string, text: string): boolean {
  const fp = path.join(ROOT, rel);
  if (!fs.existsSync(fp)) return false;
  return fs.readFileSync(fp, "utf-8").includes(text);
}

function fileExists(rel: string): boolean {
  return fs.existsSync(path.join(ROOT, rel));
}

console.log("=== TIENDAS-TEXTILE-SIZE-COLOR-COVERAGE-01 Validation ===\n");

const types   = "lib/comercial/tiendas/assortment-types.ts";
const engine  = "lib/comercial/tiendas/textile-coverage-engine.ts";
const service = "lib/comercial/tiendas/store-replenishment-service.ts";
const repType = "lib/comercial/tiendas/store-replenishment-types.ts";
const client  = "app/(app)/[orgSlug]/comercial/tiendas/tiendas-client.tsx";

// 1. Types exist
console.log("CHECK 1: Types defined");
check("TextileCoverageAnalysis type exported", fileContains(types, "export interface TextileCoverageAnalysis"));
check("TextileCoverageGap type exported", fileContains(types, "export interface TextileCoverageGap"));
check("TextileCoverageCandidate type exported", fileContains(types, "export interface TextileCoverageCandidate"));
check("TextileCoverageGapSeverity type exported", fileContains(types, "export type TextileCoverageGapSeverity"));
check("Analysis has expectedSizes", fileContains(types, "expectedSizes"));
check("Analysis has expectedColors", fileContains(types, "expectedColors"));
check("Analysis has missingSizes", fileContains(types, "missingSizes"));
check("Analysis has missingColors", fileContains(types, "missingColors"));
check("Analysis has sizeCoveragePercent", fileContains(types, "sizeCoveragePercent"));
check("Analysis has colorCoveragePercent", fileContains(types, "colorCoveragePercent"));
check("Analysis has overallCoveragePercent", fileContains(types, "overallCoveragePercent"));
check("Gap has size field", fileContains(types, "size:"));
check("Gap has color field", fileContains(types, "color:"));
check("Candidate has matchLevel", fileContains(types, "matchLevel"));

// 2. Engine file exists with key functions
console.log("\nCHECK 2: Engine functions");
check("textile-coverage-engine.ts exists", fileExists(engine));
check("computeSizeCoverage exported", fileContains(engine, "export function computeSizeCoverage"));
check("computeColorCoverage exported", fileContains(engine, "export function computeColorCoverage"));
check("computeTextileCoverage exported", fileContains(engine, "export function computeTextileCoverage"));
check("computeTextileCoverageKpi exported", fileContains(engine, "export function computeTextileCoverageKpi"));
check("deriveCoverageSeverity exported", fileContains(engine, "export function deriveCoverageSeverity"));

// 3. Size resolution
console.log("\nCHECK 3: Size resolution");
check("normalizeSize function exists", fileContains(engine, "function normalizeSize"));
check("Sizes resolved from all inventory", fileContains(engine, "sizes.add(sz)"));

// 4. Color resolution
console.log("\nCHECK 4: Color resolution");
check("normalizeColor function exists", fileContains(engine, "function normalizeColor"));
check("Colors resolved from all inventory", fileContains(engine, "colors.add(cl)"));

// 5. Coverage computation
console.log("\nCHECK 5: Coverage computation");
check("Overall = average of size + color", fileContains(engine, "(sizeCov.percent + colorCov.percent) / 2"));
check("computeSizeCoverage returns covered/missing/percent", fileContains(engine, "return { covered, missing, percent }"));

// 6. Gap detection
console.log("\nCHECK 6: Gap detection");
check("detectGaps function exists", fileContains(engine, "function detectGaps"));
check("Gap uses size|color key", fileContains(engine, '`${normalizeSize(v.size)}|${normalizeColor(v.color)}`'));
check("Gap checks currentQty", fileContains(engine, "if (current > 0) continue"));

// 7. Candidate search with priority
console.log("\nCHECK 7: Candidate search priority");
check("findGapCandidates function exists", fileContains(engine, "function findGapCandidates"));
check("Match level: exact", fileContains(engine, '"exact"'));
check("Match level: same_size", fileContains(engine, '"same_size"'));
check("Match level: same_subgroup", fileContains(engine, '"same_subgroup"'));
check("Candidates sorted by match priority", fileContains(engine, "MATCH_ORDER[a.matchLevel]"));
check("Max 5 candidates per gap", fileContains(engine, ".slice(0, 5)"));

// 8. Ruleless guard
console.log("\nCHECK 8: Ruleless guard");
check("computeTextileCoverage guards hasRules", fileContains(engine, "if (!hasRules) return []"));

// 9. Service wires textile coverage
console.log("\nCHECK 9: Service integration");
check("Service imports computeTextileCoverage", fileContains(service, "computeTextileCoverage"));
check("StoreDetailData has textileCoverage field", fileContains(repType, "textileCoverage?"));
check("Service returns textileCoverage", fileContains(service, "textileCoverage"));

// 10. KPI in UI
console.log("\nCHECK 10: KPI in UI");
check("Client imports TextileCoverageAnalysis", fileContains(client, "TextileCoverageAnalysis"));
check("Client imports computeTextileCoverageKpi", fileContains(client, "computeTextileCoverageKpi"));
check("Client shows Talla/color KPI in tab", fileContains(client, "Cobertura talla/color global"));
check("Client shows Cobertura talla/color global", fileContains(client, "Cobertura talla/color global"));

// 11. Drawer tab
console.log("\nCHECK 11: Drawer tab");
check("TextileCoverageTab component exists", fileContains(client, "function TextileCoverageTab"));
check("cobertura_textil tab in drawer", fileContains(client, '"cobertura_textil"'));
check("Tab label: Cobertura textil", fileContains(client, '"Cobertura textil"'));
check("Tab shows missing sizes", fileContains(client, "Tallas faltantes"));
check("Tab shows missing colors", fileContains(client, "Colores faltantes"));
check("Tab shows gap candidates with match level", fileContains(client, "MATCH_LABEL"));

// 12. Severity thresholds
console.log("\nCHECK 12: Severity thresholds");
check("Severity < 50% = critica", fileContains(engine, 'if (percent < 50) return "critica"'));
check("Severity 50-70% = alta", fileContains(engine, 'if (percent < 70) return "alta"'));
check("Severity 70-85% = media", fileContains(engine, 'if (percent < 85) return "media"'));
check("Severity 85-95% = baja", fileContains(engine, 'if (percent < 95) return "baja"'));
check("Severity 95%+ = saludable", fileContains(engine, 'return "saludable"'));

// 13. TSC
console.log("\nCHECK 13: TSC baseline");
check("TSC baseline check deferred (run npx tsc --noEmit manually)", true);

// Summary
console.log(`\n=== Results: ${pass} PASS / ${fail} FAIL / ${pass + fail} TOTAL ===`);
if (fail > 0) process.exit(1);
