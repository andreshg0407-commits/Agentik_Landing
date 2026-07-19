/**
 * lib/copilot/intent-resolver/validate.ts
 *
 * AGENTIK-INTENT-RESOLVER-02 — Smoke check (v2, expanded).
 * SERVER ONLY — no React imports, no AI, no LLM calls.
 * @server-only
 *
 * Tests the full resolution pipeline including:
 *   - Synonym normalization ("rebaja" → "descuento")
 *   - Phrase alias matching ("sube los faltantes" → publish_pending_products)
 *   - Entity extraction (discountPercent, count, collection)
 *   - Ambiguity detection (warns but does not reject)
 *   - Registry integrity
 *
 * Safe to import at startup for health checks.
 * Does NOT execute any business logic or make external calls.
 */
import "server-only";

import { intentResolver }         from "./index";
import { validateIntentRegistry } from "./intent-validator";

// ── Test case definition ───────────────────────────────────────────────────────

interface SmokeTestCase {
  input:               string;
  expectedCandidateId: string;
  minConfidence:       number;
  expectedParams?:     Record<string, unknown>;
  description:         string;
}

// ── Test suite ────────────────────────────────────────────────────────────────

const SMOKE_TEST_CASES: SmokeTestCase[] = [

  // ── v1 baseline cases (must still pass with v2 engine) ────────────────────

  {
    description:         "Direct publish keyword match",
    input:               "Publica productos pendientes",
    expectedCandidateId: "publish_pending_products",
    minConfidence:       0.30,
  },
  {
    description:         "Find failed payments",
    input:               "Muéstrame pagos fallidos",
    expectedCandidateId: "find_failed_payments",
    minConfidence:       0.25,
  },
  {
    description:         "Generate discount codes with count entity",
    input:               "Genera 20 códigos de descuento",
    expectedCandidateId: "generate_discount_codes",
    minConfidence:       0.25,
    expectedParams:      { count: 20 },
  },
  {
    description:         "Create promotion with percentage entity",
    input:               "Haz una promoción del 15%",
    expectedCandidateId: "create_discount",
    minConfidence:       0.20,
    expectedParams:      { discountPercent: 15 },
  },
  {
    description:         "Complete SEO keywords",
    input:               "Optimiza el SEO de los productos",
    expectedCandidateId: "complete_seo",
    minConfidence:       0.25,
  },
  {
    description:         "Find delayed shipments",
    input:               "Envíos retrasados más de 7 días",
    expectedCandidateId: "find_delayed_shipments",
    minConfidence:       0.20,
    expectedParams:      { minDays: 7 },
  },
  {
    description:         "Find active promotions",
    input:               "Ver promociones activas",
    expectedCandidateId: "find_active_promotions",
    minConfidence:       0.25,
  },
  {
    description:         "Find pending refunds",
    input:               "¿Cuántos reembolsos están pendientes?",
    expectedCandidateId: "find_pending_refunds",
    minConfidence:       0.20,
  },
  {
    description:         "Complete alt text",
    input:               "Completar alt text de las imágenes",
    expectedCandidateId: "complete_alt_text",
    minConfidence:       0.25,
  },
  {
    description:         "Sales overview",
    input:               "Resumen de ventas de esta semana",
    expectedCandidateId: "get_sales_overview",
    minConfidence:       0.20,
  },

  // ── v2 new cases — synonym normalization ──────────────────────────────────

  {
    description:         "Synonym: 'sube' → publicar (phrase alias match)",
    input:               "Sube los productos faltantes",
    expectedCandidateId: "publish_pending_products",
    minConfidence:       0.20,
  },
  {
    description:         "Synonym: 'rebaja' → descuento with collection entity",
    input:               "Haz una rebaja del 15% en juguetes",
    expectedCandidateId: "create_discount",
    minConfidence:       0.18,
    expectedParams:      { discountPercent: 15, collection: "juguetes" },
  },
  {
    description:         "Synonym: 'cupones' → codigos with count entity",
    input:               "Genera 50 cupones",
    expectedCandidateId: "generate_discount_codes",
    minConfidence:       0.18,
    expectedParams:      { count: 50 },
  },
  {
    description:         "SEO optimization for unpublished products (targetScope)",
    input:               "Optimiza el SEO de los productos sin publicar",
    expectedCandidateId: "complete_seo",
    minConfidence:       0.20,
  },
  {
    description:         "Failed payments via phrase alias",
    input:               "Muéstrame los pedidos con pagos fallidos",
    expectedCandidateId: "find_failed_payments",
    minConfidence:       0.20,
  },
  {
    description:         "Delayed shipments via phrase alias ('Enséñame')",
    input:               "Enséñame los envíos retrasados",
    expectedCandidateId: "find_delayed_shipments",
    minConfidence:       0.18,
  },
  {
    description:         "Synonym: 'referencias' → productos, 'sincroniza' → publicar",
    input:               "Sincroniza las referencias pendientes",
    expectedCandidateId: "publish_pending_products",
    minConfidence:       0.15,
  },

  // ── v2 new cases — entity extraction ─────────────────────────────────────

  {
    description:         "Discount + collection + date extraction",
    input:               "Haz una promoción del 20% en ropa hasta el 30 de junio",
    expectedCandidateId: "create_discount",
    minConfidence:       0.18,
    expectedParams:      { discountPercent: 20, collection: "ropa" },
  },
  {
    description:         "Bulk code generation with prefix",
    input:               "Genera 100 códigos SAVE2026",
    expectedCandidateId: "generate_discount_codes",
    minConfidence:       0.18,
    expectedParams:      { count: 100, prefix: "SAVE2026" },
  },

];

// ── Smoke check result ────────────────────────────────────────────────────────

export interface SmokeCheckResult {
  ok:           boolean;
  passed:       number;
  failed:       number;
  errors:       string[];
  warnings:     string[];
  registryOk:   boolean;
  totalIntents: number;
}

// ── Runner ────────────────────────────────────────────────────────────────────

/**
 * Run the full Intent Resolver smoke check (v2 suite).
 * Returns a structured report. Never throws.
 * All operations are synchronous — no I/O, no API calls.
 */
export function runIntentResolverSmokeCheck(): SmokeCheckResult {
  const errors:   string[] = [];
  const warnings: string[] = [];
  let passed = 0;
  let failed = 0;

  // ── 1. Registry integrity ──────────────────────────────────────────────────

  const registryReport = validateIntentRegistry();
  for (const e of registryReport.errors)   errors.push(`[registry] ${e}`);
  for (const w of registryReport.warnings) warnings.push(`[registry] ${w}`);

  // ── 2. Resolution smoke tests ──────────────────────────────────────────────

  for (const tc of SMOKE_TEST_CASES) {
    const result = intentResolver.resolve(tc.input);

    if (!result.matched) {
      errors.push(
        `[smoke] "${tc.input}" → NOT MATCHED (expected: ${tc.expectedCandidateId}) [${tc.description}]`,
      );
      failed++;
      continue;
    }

    if (!result.resolvedIntent) {
      errors.push(`[smoke] "${tc.input}" → matched=true but resolvedIntent is missing`);
      failed++;
      continue;
    }

    if (result.resolvedIntent.candidateId !== tc.expectedCandidateId) {
      errors.push(
        `[smoke] "${tc.input}" [${tc.description}] ` +
        `→ got "${result.resolvedIntent.candidateId}", expected "${tc.expectedCandidateId}" ` +
        `(confidence: ${(result.confidence * 100).toFixed(0)}%)`,
      );
      failed++;
      continue;
    }

    if (result.confidence < tc.minConfidence) {
      errors.push(
        `[smoke] "${tc.input}" → confidence ${(result.confidence * 100).toFixed(0)}% ` +
        `< min ${(tc.minConfidence * 100).toFixed(0)}% [${tc.description}]`,
      );
      failed++;
      continue;
    }

    // Parameter checks
    if (tc.expectedParams) {
      let paramOk = true;
      for (const [k, expected] of Object.entries(tc.expectedParams)) {
        const actual = result.resolvedIntent.parameters[k];
        if (actual !== expected) {
          errors.push(
            `[smoke] "${tc.input}" [${tc.description}] ` +
            `→ param "${k}" is ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`,
          );
          failed++;
          paramOk = false;
          break;
        }
      }
      if (paramOk) passed++;
      continue;
    }

    passed++;
  }

  // ── 3. listSupportedActions check ─────────────────────────────────────────

  const byDomain = intentResolver.listSupportedActions();
  if (!byDomain["shopify"] || byDomain["shopify"].length === 0) {
    errors.push("[smoke] listSupportedActions() returned no shopify intents");
  }

  // ── 4. explainIntentResolution sanity check ────────────────────────────────

  const explain = intentResolver.explain("Haz una rebaja del 20% en juguetes");
  if (!explain.selectedCandidate) {
    warnings.push("[smoke] explain() returned no selectedCandidate for a known-good input");
  }
  if (Object.keys(explain.synonymsApplied).length === 0) {
    warnings.push("[smoke] explain() returned no synonymsApplied — synonym map may not be working");
  }

  // ── 5. extractEntities sanity check ───────────────────────────────────────

  const entities = intentResolver.extractEntities("Haz una rebaja del 20% en juguetes");
  if (entities.discountPercent !== 20) {
    errors.push(`[smoke] extractEntities: discountPercent is ${entities.discountPercent}, expected 20`);
  }
  if (entities.collection !== "juguetes") {
    errors.push(`[smoke] extractEntities: collection is "${entities.collection}", expected "juguetes"`);
  }

  return {
    ok:           errors.length === 0,
    passed,
    failed,
    errors,
    warnings,
    registryOk:   registryReport.ok,
    totalIntents: registryReport.totalIntents,
  };
}
