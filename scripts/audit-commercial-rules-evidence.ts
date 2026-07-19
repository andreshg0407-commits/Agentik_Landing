/**
 * scripts/audit-commercial-rules-evidence.ts
 *
 * Validates evidence collection across key scenarios.
 *
 * Usage: npx tsx scripts/audit-commercial-rules-evidence.ts
 *
 * Sprint: COMMERCIAL-RULES-EVIDENCE-01
 */

import { evaluateCoverage } from "../lib/comercial/rules/coverage";
import type { CommercialCoverageInput } from "../lib/comercial/rules/coverage";
import type { StorePolicyRule } from "../lib/comercial/tiendas/store-policy-types";

// ── Fixtures ────────────────────────────────────────────────────────────────

function makeRule(overrides: Partial<StorePolicyRule>): StorePolicyRule {
  return {
    id: "r-" + Math.random().toString(36).slice(2, 8),
    storeId: "store-01",
    scope: "line_subgroup",
    productClass: "textile",
    minQty: 2, idealQty: 4, maxQty: 6,
    allowReplacement: false, allowProductionSignal: false,
    allowMainWarehouseTransfer: true, priority: 10, active: true,
    ...overrides,
  };
}

function makeInput(overrides: Partial<CommercialCoverageInput>): CommercialCoverageInput {
  return {
    tenantId: "castillitos", organizationId: "org-01",
    storeId: "store-01", storeName: "Tienda Centro",
    referenceCode: "REF-001", productName: "Producto Test",
    productClass: "textile", businessLine: "castillitos",
    currentUnits: 2, activeRules: [],
    ...overrides,
  };
}

const textileRule = makeRule({ scope: "line_subgroup", productClass: "textile", line: "castillitos", subgroup: "pijama ll", coverageStrategy: "SUBGROUP" });
const sizeRuleMedium = makeRule({ scope: "class_size", productClass: "accessory", sizeClass: "medium", minQty: 4, idealQty: 6, maxQty: 8, coverageStrategy: "SIZE" });
const allRules = [textileRule, sizeRuleMedium];

// ── Test cases ──────────────────────────────────────────────────────────────

interface TestCase {
  name: string;
  input: CommercialCoverageInput;
  checks: ((result: ReturnType<typeof evaluateCoverage>) => boolean)[];
}

const cases: TestCase[] = [
  {
    name: "HIGH confidence — textil con regla",
    input: makeInput({ subgroup: "pijama ll", currentUnits: 1, sourceAvailableUnits: 10, activeRules: allRules }),
    checks: [
      r => r.evidence.items.length >= 7,
      r => r.evidence.items.some(e => e.type === "RULE" && e.confirmed),
      r => r.evidence.items.some(e => e.type === "INVENTORY"),
      r => r.evidence.items.some(e => e.type === "CALCULATION"),
      r => r.evidence.items.some(e => e.type === "STRATEGY"),
      r => r.evidence.items.some(e => e.type === "SOURCE"),
      r => r.evidence.confidenceFactors.length >= 4,
      r => r.evidence.confidenceFactors.filter(f => f.satisfied).length >= 4,
      r => r.dataQuality.confidenceLevel === "HIGH",
    ],
  },
  {
    name: "LOW confidence — sin size, sin regla",
    input: makeInput({ businessLine: "accesorios_importacion", productClass: "accessory", sizeClass: undefined, currentUnits: 2, activeRules: allRules }),
    checks: [
      r => r.evidence.missingData.includes("sizeClass"),
      r => r.evidence.items.some(e => e.type === "MISSING_DATA"),
      r => r.evidence.items.some(e => e.type === "FALLBACK"),
      r => r.evidence.confidenceFactors.some(f => f.label === "Tamano clasificado" && !f.satisfied),
      r => r.dataQuality.confidenceLevel === "LOW",
    ],
  },
  {
    name: "Regla encontrada — evidencia de regla completa",
    input: makeInput({ subgroup: "pijama ll", sourceAvailableUnits: 10, activeRules: allRules }),
    checks: [
      r => {
        const ruleEv = r.evidence.items.find(e => e.type === "RULE");
        if (!ruleEv) return false;
        const d = ruleEv.data as Record<string, unknown>;
        return d.ruleId !== "" && d.scope === "line_subgroup" && d.minQty === 2 && d.idealQty === 4 && d.maxQty === 6;
      },
    ],
  },
  {
    name: "Inventario insuficiente — warning",
    input: makeInput({ businessLine: "accesorios_importacion", productClass: "accessory", sizeClass: "medium", currentUnits: 2, sourceAvailableUnits: 2, activeRules: allRules }),
    checks: [
      r => r.evidence.items.some(e => e.type === "WARNING" && (e.data as Record<string, unknown>).code === "SOURCE_CONSTRAINED"),
      r => r.suggestion.sourceConstrained === true,
    ],
  },
  {
    name: "Textil — estrategia SUBGROUP en evidencia",
    input: makeInput({ subgroup: "pijama ll", sourceAvailableUnits: 10, activeRules: allRules }),
    checks: [
      r => {
        const stratEv = r.evidence.items.find(e => e.type === "STRATEGY");
        return (stratEv?.data as Record<string, unknown>)?.coverageStrategy === "SUBGROUP";
      },
    ],
  },
  {
    name: "Accesorios/Importacion — estrategia SIZE en evidencia",
    input: makeInput({ businessLine: "accesorios_importacion", productClass: "accessory", sizeClass: "medium", currentUnits: 2, sourceAvailableUnits: 10, activeRules: allRules }),
    checks: [
      r => {
        const stratEv = r.evidence.items.find(e => e.type === "STRATEGY");
        return (stratEv?.data as Record<string, unknown>)?.coverageStrategy === "SIZE";
      },
    ],
  },
  {
    name: "Calculo completo en evidencia",
    input: makeInput({ businessLine: "accesorios_importacion", productClass: "accessory", sizeClass: "medium", currentUnits: 2, sourceAvailableUnits: 20, activeRules: allRules }),
    checks: [
      r => {
        const calcEv = r.evidence.items.find(e => e.type === "CALCULATION");
        if (!calcEv) return false;
        const d = calcEv.data as Record<string, unknown>;
        return d.currentCoverage === 2 && d.idealQty === 6 && d.gapToIdeal === 4 && d.finalSuggestedQty === 4;
      },
    ],
  },
  {
    name: "Explicacion consistente con evidencias",
    input: makeInput({ businessLine: "accesorios_importacion", productClass: "accessory", sizeClass: "medium", currentUnits: 2, sourceAvailableUnits: 20, activeRules: allRules }),
    checks: [
      r => {
        // Explanation should mention the suggested qty from calculation evidence
        const calcEv = r.evidence.items.find(e => e.type === "CALCULATION");
        const sugQty = (calcEv?.data as Record<string, unknown>)?.finalSuggestedQty as number;
        return r.explanation.summary.includes(String(sugQty));
      },
    ],
  },
  {
    name: "Sin regla — fallback registrado",
    input: makeInput({ subgroup: "desconocido", currentUnits: 1, activeRules: allRules }),
    checks: [
      r => r.evidence.items.some(e => e.type === "FALLBACK"),
      r => r.evidence.items.find(e => e.type === "RULE")?.confirmed === false,
    ],
  },
  {
    name: "Datos faltantes registrados",
    input: makeInput({ businessLine: "accesorios_importacion", productClass: "accessory", currentUnits: 2, activeRules: allRules }),
    checks: [
      r => r.evidence.missingData.length > 0,
      r => r.evidence.missingData.includes("sizeClass"),
      r => r.evidence.missingData.includes("sourceAvailableUnits"),
    ],
  },
];

// ── Run ─────────────────────────────────────────────────────────────────────

console.log("\n=== Commercial Rules Evidence — Audit ===\n");

let totalChecks = 0;
let passedChecks = 0;

for (const tc of cases) {
  const result = evaluateCoverage(tc.input);
  const results = tc.checks.map(fn => fn(result));
  const allPass = results.every(Boolean);
  totalChecks += results.length;
  passedChecks += results.filter(Boolean).length;

  console.log(`${allPass ? "PASS" : "FAIL"}  ${tc.name} (${results.filter(Boolean).length}/${results.length} checks)`);
  if (!allPass) {
    console.log(`       Evidence items: ${result.evidence.items.map(e => e.type).join(", ")}`);
    console.log(`       Missing data:   ${result.evidence.missingData.join(", ") || "none"}`);
    console.log(`       Confidence:     ${result.dataQuality.confidenceLevel}`);
  }
}

console.log(`\n=== Audit: ${passedChecks}/${totalChecks} checks passed ===\n`);
if (passedChecks < totalChecks) process.exit(1);
