/**
 * lib/copilot/intent-resolver/validate.ts
 *
 * AGENTIK-INTENT-RESOLVER-01 — Smoke check for the Intent Resolver.
 * SERVER ONLY — no React imports, no AI, no LLM calls.
 * @server-only
 *
 * Runs deterministic tests against the resolver to verify:
 *   - Each test input matches the expected intent
 *   - Confidence is above the minimum threshold
 *   - Parameters are extracted correctly when present
 *   - The registry has no structural errors
 *
 * This file is safe to import at startup for health checks.
 * It does NOT execute any business logic or make external calls.
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
}

// ── Test suite (FASE 11) ───────────────────────────────────────────────────────

const SMOKE_TEST_CASES: SmokeTestCase[] = [
  {
    input:               "Publica productos pendientes",
    expectedCandidateId: "publish_pending_products",
    minConfidence:       0.30,
  },
  {
    input:               "Muéstrame pagos fallidos",
    expectedCandidateId: "find_failed_payments",
    minConfidence:       0.30,
  },
  {
    input:               "Genera 20 códigos de descuento",
    expectedCandidateId: "generate_discount_codes",
    minConfidence:       0.30,
    expectedParams:      { count: 20 },
  },
  {
    input:               "Haz una promoción del 15%",
    expectedCandidateId: "create_discount",
    minConfidence:       0.20,
    expectedParams:      { discountPercent: 15 },
  },
  {
    input:               "Optimiza el SEO de los productos",
    expectedCandidateId: "complete_seo",
    minConfidence:       0.30,
  },
  {
    input:               "Envíos retrasados más de 7 días",
    expectedCandidateId: "find_delayed_shipments",
    minConfidence:       0.25,
    expectedParams:      { minDays: 7 },
  },
  {
    input:               "Ver promociones activas",
    expectedCandidateId: "find_active_promotions",
    minConfidence:       0.30,
  },
  {
    input:               "¿Cuántos reembolsos están pendientes?",
    expectedCandidateId: "find_pending_refunds",
    minConfidence:       0.25,
  },
  {
    input:               "Completar alt text de las imágenes",
    expectedCandidateId: "complete_alt_text",
    minConfidence:       0.30,
  },
  {
    input:               "Resumen de ventas de esta semana",
    expectedCandidateId: "get_sales_overview",
    minConfidence:       0.20,
  },
];

// ── Smoke check result ────────────────────────────────────────────────────────

export interface SmokeCheckResult {
  ok:            boolean;
  passed:        number;
  failed:        number;
  errors:        string[];
  warnings:      string[];
  registryOk:    boolean;
  totalIntents:  number;
}

// ── Runner ────────────────────────────────────────────────────────────────────

/**
 * Run the full Intent Resolver smoke check.
 *
 * Returns a structured report. Never throws.
 * All operations are synchronous (no I/O, no API calls).
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

  // ── 2. Intent resolution smoke tests ──────────────────────────────────────

  for (const tc of SMOKE_TEST_CASES) {
    const result = intentResolver.resolve(tc.input);

    if (!result.matched) {
      errors.push(
        `[smoke] "${tc.input}" → NOT MATCHED (expected: ${tc.expectedCandidateId})`,
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
        `[smoke] "${tc.input}" → got "${result.resolvedIntent.candidateId}", expected "${tc.expectedCandidateId}"`,
      );
      failed++;
      continue;
    }

    if (result.confidence < tc.minConfidence) {
      errors.push(
        `[smoke] "${tc.input}" → confidence ${(result.confidence * 100).toFixed(0)}% < min ${(tc.minConfidence * 100).toFixed(0)}%`,
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
            `[smoke] "${tc.input}" → param "${k}" is ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`,
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
