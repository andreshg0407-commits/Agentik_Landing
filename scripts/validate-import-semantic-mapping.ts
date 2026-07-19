/**
 * scripts/validate-import-semantic-mapping.ts
 *
 * 25-check validation for IMPORT-SEMANTIC-MAPPING-01 sprint.
 *
 * Run:
 *   npx tsx scripts/validate-import-semantic-mapping.ts
 *
 * Sprint: IMPORT-SEMANTIC-MAPPING-01 — Phase 14
 */

import * as fs from "node:fs";
import * as path from "node:path";

let passed = 0;
let failed = 0;
let total = 0;

function check(label: string, fn: () => boolean): void {
  total++;
  try {
    const ok = fn();
    if (ok) {
      passed++;
      console.log(`  [PASS] ${total.toString().padStart(2)}. ${label}`);
    } else {
      failed++;
      console.log(`  [FAIL] ${total.toString().padStart(2)}. ${label}`);
    }
  } catch (e: unknown) {
    failed++;
    const msg = e instanceof Error ? e.message : String(e);
    console.log(`  [FAIL] ${total.toString().padStart(2)}. ${label} — ${msg}`);
  }
}

const BASE = path.resolve(__dirname, "..");
const SEMANTIC_DIR = path.join(BASE, "lib/comercial/semantic/imports");

console.log("\n=== IMPORT-SEMANTIC-MAPPING-01 VALIDATION ===\n");

// ── 1-5: File existence ──────────────────────────────────────────────────────

check("import-semantic-types.ts exists", () =>
  fs.existsSync(path.join(SEMANTIC_DIR, "import-semantic-types.ts")),
);

check("import-semantic-config.ts exists", () =>
  fs.existsSync(path.join(SEMANTIC_DIR, "import-semantic-config.ts")),
);

check("import-semantic-mapping.ts exists", () =>
  fs.existsSync(path.join(SEMANTIC_DIR, "import-semantic-mapping.ts")),
);

check("import-semantic-classifier.ts exists", () =>
  fs.existsSync(path.join(SEMANTIC_DIR, "import-semantic-classifier.ts")),
);

check("index.ts barrel exists", () =>
  fs.existsSync(path.join(SEMANTIC_DIR, "index.ts")),
);

// ── 6-10: Module imports ─────────────────────────────────────────────────────

// Dynamic import to validate module structure
const mod = require(path.join(SEMANTIC_DIR, "index.ts"));

check("classifyImportDocument is exported", () =>
  typeof mod.classifyImportDocument === "undefined"
    ? (() => {
        // Try direct import
        const classifier = require(path.join(SEMANTIC_DIR, "import-semantic-classifier.ts"));
        return typeof classifier.classifyImportDocument === "function";
      })()
    : typeof mod.classifyImportDocument === "function",
);

// Use direct imports since tsx may not handle barrel re-exports
const { classifyImportDocument } = require(path.join(SEMANTIC_DIR, "import-semantic-classifier.ts"));
const { CASTILLITOS_IMPORT_CONFIG } = require(path.join(SEMANTIC_DIR, "import-semantic-mapping.ts"));
const { registerTenantConfig, getTenantConfig, listRegisteredTenants } = require(path.join(SEMANTIC_DIR, "import-semantic-config.ts"));

check("CASTILLITOS_IMPORT_CONFIG is exported", () =>
  CASTILLITOS_IMPORT_CONFIG != null && typeof CASTILLITOS_IMPORT_CONFIG === "object",
);

check("registerTenantConfig is a function", () =>
  typeof registerTenantConfig === "function",
);

check("getTenantConfig is a function", () =>
  typeof getTenantConfig === "function",
);

check("listRegisteredTenants is a function", () =>
  typeof listRegisteredTenants === "function",
);

// ── 11-15: Config structure ──────────────────────────────────────────────────

check("Config has tenantId = castillitos", () =>
  CASTILLITOS_IMPORT_CONFIG.tenantId === "castillitos",
);

check("Config has erp = SAG", () =>
  CASTILLITOS_IMPORT_CONFIG.erp === "SAG",
);

check("Config has >= 15 document mappings", () =>
  Array.isArray(CASTILLITOS_IMPORT_CONFIG.documentMappings) && CASTILLITOS_IMPORT_CONFIG.documentMappings.length >= 15,
);

check("Config has >= 20 warehouse mappings", () =>
  Array.isArray(CASTILLITOS_IMPORT_CONFIG.warehouseMappings) && CASTILLITOS_IMPORT_CONFIG.warehouseMappings.length >= 20,
);

check("Config has >= 8 price mappings", () =>
  Array.isArray(CASTILLITOS_IMPORT_CONFIG.priceMappings) && CASTILLITOS_IMPORT_CONFIG.priceMappings.length >= 8,
);

// ── 16-20: Classifier behavior ──────────────────────────────────────────────

function makeTestInput(overrides: Record<string, unknown> = {}) {
  return {
    tenantId: "castillitos",
    erp: "SAG",
    sourceId: "182",
    sourceCode: "FI",
    sourceName: "FACTURA DE IMPORTACION NACIONAL",
    documentNumber: "TEST",
    documentDate: "2026-07-10",
    quantity: 100,
    warehouseId: "36",
    providerId: "",
    providerName: "",
    cancelled: false,
    metadata: {},
    ...overrides,
  };
}

check("FI(182) classifies as IMPORT_INVOICE", () => {
  const r = classifyImportDocument(makeTestInput(), CASTILLITOS_IMPORT_CONFIG);
  return r.documentSemanticType === "IMPORT_INVOICE";
});

check("PX(184) classifies as IMPORT_PROVISION", () => {
  const r = classifyImportDocument(
    makeTestInput({ sourceId: "184", sourceCode: "PX", sourceName: "PROVISION IMPORTACION 2" }),
    CASTILLITOS_IMPORT_CONFIG,
  );
  return r.documentSemanticType === "IMPORT_PROVISION";
});

check("Unknown fuente returns UNKNOWN with confidence 0", () => {
  const r = classifyImportDocument(
    makeTestInput({ sourceId: "999", sourceCode: "ZZ", sourceName: "RANDOM" }),
    CASTILLITOS_IMPORT_CONFIG,
  );
  return r.documentSemanticType === "UNKNOWN" && r.confidence === 0;
});

check("Cancelled doc disables all counting", () => {
  const r = classifyImportDocument(makeTestInput({ cancelled: true }), CASTILLITOS_IMPORT_CONFIG);
  return !r.shouldCountAsImportReceipt && !r.shouldCountAsRepurchase && !r.shouldCountInTotalImported;
});

check("No tenant config returns safe UNKNOWN", () => {
  const r = classifyImportDocument(makeTestInput({ tenantId: "nonexistent" }));
  return r.documentSemanticType === "UNKNOWN" && r.confidence === 0;
});

// ── 21-25: Research-aligned checks ──────────────────────────────────────────

check("C1(1) is DOMESTIC_PURCHASE, NOT import receipt", () => {
  const r = classifyImportDocument(
    makeTestInput({ sourceId: "1", sourceCode: "C1", sourceName: "FACTURA DE COMPRA" }),
    CASTILLITOS_IMPORT_CONFIG,
  );
  return r.documentSemanticType === "DOMESTIC_PURCHASE_INVOICE" && !r.shouldCountAsImportReceipt;
});

check("Import warehouse (ka_nl_bodega=36) is IMPORT_STAGING", () => {
  const wh = CASTILLITOS_IMPORT_CONFIG.warehouseMappings.find((w: { externalId: string }) => w.externalId === "36");
  return wh != null && wh.semanticType === "IMPORT_STAGING";
});

check("Import warehouse (ka_nl_bodega=41) is IMPORT_CONTAINER", () => {
  const wh = CASTILLITOS_IMPORT_CONFIG.warehouseMappings.find((w: { externalId: string }) => w.externalId === "41");
  return wh != null && wh.semanticType === "IMPORT_CONTAINER";
});

check("Evidence chain is non-empty for classified docs", () => {
  const r = classifyImportDocument(makeTestInput(), CASTILLITOS_IMPORT_CONFIG);
  return Array.isArray(r.evidence) && r.evidence.length > 0;
});

check("Audit script exists", () =>
  fs.existsSync(path.join(BASE, "scripts/audit-import-semantic-mapping.ts")),
);

// ── Summary ──────────────────────────────────────────────────────────────────

console.log(`\n${"=".repeat(50)}`);
console.log(`TOTAL: ${total} checks`);
console.log(`PASS:  ${passed}`);
console.log(`FAIL:  ${failed}`);
console.log(`${"=".repeat(50)}\n`);

if (failed > 0) {
  process.exit(1);
}
