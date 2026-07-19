/**
 * scripts/validate-tiendas-line-mapping-audit.ts
 *
 * Structural validation for TIENDAS-LINE-MAPPING-AUDIT-01
 *
 * Usage: npx tsx scripts/validate-tiendas-line-mapping-audit.ts
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

function fileExists(rel: string): boolean {
  return fs.existsSync(path.join(ROOT, rel));
}

function fileContains(rel: string, text: string): boolean {
  const fp = path.join(ROOT, rel);
  if (!fs.existsSync(fp)) return false;
  return fs.readFileSync(fp, "utf-8").includes(text);
}

console.log("=== TIENDAS-LINE-MAPPING-AUDIT-01 Validation ===\n");

const auditScript = "scripts/audit-tiendas-line-mapping.ts";
const report = "TIENDAS_LINE_MAPPING_AUDIT_01.md";
const blFile = "lib/comercial/tiendas/store-business-lines.ts";

// 1. Audit script exists and is read-only
console.log("CHECK 1: Audit script");
check("audit-tiendas-line-mapping.ts exists", fileExists(auditScript));
check("Script is read-only (no prisma.create/update/delete)",
  !fileContains(auditScript, ".create(") &&
  !fileContains(auditScript, ".update(") &&
  !fileContains(auditScript, ".delete(") &&
  !fileContains(auditScript, ".upsert(")
);
check("Script reads ProductEntity", fileContains(auditScript, "productEntity.findMany"));
check("Script groups by productLine", fileContains(auditScript, "productLine"));
check("Script reports subgrupoSag", fileContains(auditScript, "subgrupoSag"));
check("Script reports references/SKU", fileContains(auditScript, "sku"));
check("Script reports prefix analysis", fileContains(auditScript, "prefixFreq"));
check("Script generates matrix", fileContains(auditScript, "MATRIZ RESUMEN"));

// 2. Report exists
console.log("\nCHECK 2: Report");
check("Report file exists", fileExists(report));
check("Report contains productLine 1", fileContains(report, "productLine = 1"));
check("Report contains productLine 2", fileContains(report, "productLine = 2"));
check("Report contains productLine 3", fileContains(report, "productLine = 3"));
check("Report contains productLine 4", fileContains(report, "productLine = 4"));
check("Report contains productLine 5", fileContains(report, "productLine = 5"));
check("Report contains NULL analysis", fileContains(report, "NULL"));
check("Report contains confidence matrix", fileContains(report, "Confianza"));
check("Report contains recommendation", fileContains(report, "Parcialmente correcto"));

// 3. Business line model consistency
console.log("\nCHECK 3: Business line model");
check("castillitos maps SAG 1", fileContains(blFile, '"1": "castillitos"'));
check("latin_kids maps SAG 2", fileContains(blFile, '"2": "latin_kids"'));
check("accesorios maps SAG 5", fileContains(blFile, '"5": "accesorios_importacion"'));

// 4. TSC baseline
console.log("\nCHECK 4: No code changes");
check("Audit script does NOT modify production code",
  !fileContains(auditScript, "import { resolveBusinessLineId") &&
  !fileContains(auditScript, "store-business-lines")
);

// Summary
console.log(`\n=== Results: ${pass} PASS / ${fail} FAIL / ${pass + fail} TOTAL ===`);
if (fail > 0) process.exit(1);
