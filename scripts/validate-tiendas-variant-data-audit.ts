/**
 * scripts/validate-tiendas-variant-data-audit.ts
 *
 * Structural validation for TIENDAS-VARIANT-DATA-AUDIT-01
 *
 * Usage: npx tsx scripts/validate-tiendas-variant-data-audit.ts
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

console.log("=== TIENDAS-VARIANT-DATA-AUDIT-01 Validation ===\n");

const auditScript = "scripts/audit-tiendas-variant-data.ts";
const report = "TIENDAS_VARIANT_DATA_AUDIT_01.md";

// 1. Audit script
console.log("CHECK 1: Audit script");
check("audit script exists", fileExists(auditScript));
check("Script is read-only (no create/update/delete)",
  !fileContains(auditScript, ".create(") &&
  !fileContains(auditScript, ".update(") &&
  !fileContains(auditScript, ".delete(") &&
  !fileContains(auditScript, ".upsert(")
);
check("Analyzes line 1", fileContains(auditScript, '"1"'));
check("Analyzes line 2", fileContains(auditScript, '"2"'));
check("Reads ProductVariant", fileContains(auditScript, "ProductVariant"));
check("Reads ProductVariantAttribute", fileContains(auditScript, "ProductVariantAttribute"));
check("Reads ProductInventoryLevel", fileContains(auditScript, "ProductInventoryLevel"));
check("Analyzes variant.name", fileContains(auditScript, "v.name"));
check("Analyzes variant.sku", fileContains(auditScript, "v.sku"));

// 2. Report
console.log("\nCHECK 2: Report");
check("Report exists", fileExists(report));
check("Report covers Line 1", fileContains(report, "Line 1"));
check("Report covers Line 2", fileContains(report, "Line 2"));
check("Report identifies JSON attributes", fileContains(report, "attributes Json"));
check("Report identifies root cause", fileContains(report, "variantAttributes"));
check("Report has coverage matrix", fileContains(report, "Cobertura"));
check("Report has recommendation", fileContains(report, "Recomendacion"));
check("Report compares Pedidos vs Tiendas", fileContains(report, "Pedidos"));

// 3. No code changes
console.log("\nCHECK 3: No production code changes");
check("Audit script does NOT import store-business-lines",
  !fileContains(auditScript, "store-business-lines")
);
check("Audit script reads adapter for analysis only (no write)",
  !fileContains(auditScript, "writeFileSync") &&
  !fileContains(auditScript, "Edit") &&
  !fileContains(auditScript, ".create(") &&
  !fileContains(auditScript, ".update(")
);

// Summary
console.log(`\n=== Results: ${pass} PASS / ${fail} FAIL / ${pass + fail} TOTAL ===`);
if (fail > 0) process.exit(1);
