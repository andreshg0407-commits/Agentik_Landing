/**
 * lib/copilot/intent-resolver/index.ts
 *
 * AGENTIK-INTENT-RESOLVER-01 — Public facade.
 * SERVER ONLY — no React imports, no AI, no LLM calls.
 * @server-only
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT IS THE INTENT RESOLVER?
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The Intent Resolver is Agentik's central orchestration layer for translating
 * user utterances into structured, executable action plans.
 *
 * It is NOT a language model. It is NOT AI. It is a deterministic, rule-based,
 * auditable enterprise orchestration engine.
 *
 * Future architecture:
 *   User
 *     │
 *     ▼
 *   Agentik Copilot
 *     │
 *     ▼
 *   Intent Resolver          ← THIS MODULE
 *     │
 *     ├──────► Shopify Actions (SHOPIFY-COPILOT-ACTIONS-01C)
 *     ├──────► Finance Actions (future: AGENTIK-INTENT-FINANCE-01)
 *     ├──────► Commercial Actions (future: AGENTIK-INTENT-COMMERCIAL-01)
 *     ├──────► Marketing Actions (future: AGENTIK-INTENT-MARKETING-01)
 *     └──────► Cobranza / Inventario / Others
 *
 * The resolver:
 *   ✓ Interprets intent
 *   ✓ Identifies domain + action
 *   ✓ Extracts parameters
 *   ✓ Validates
 *   ✓ Generates plan
 *   ✓ Verifies approval policy
 *   ✗ Never executes business logic
 *   ✗ Never calls AI/LLM
 *   ✗ Never calls Prisma directly
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * USAGE
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *   import { intentResolver } from "@/lib/copilot/intent-resolver";
 *
 *   // Resolve a user utterance
 *   const result = intentResolver.resolve("Publica los productos pendientes");
 *   if (result.matched && result.resolvedIntent) {
 *     const plan = intentResolver.buildExecutionPlan(result.resolvedIntent);
 *     // plan.requiresApproval, plan.domain, plan.actionId, plan.parameters, ...
 *   }
 *
 *   // List all supported intents
 *   const actions = intentResolver.listSupportedActions();
 *
 *   // Validate the registry at startup
 *   const report = intentResolver.validateRegistry();
 *   if (!report.ok) console.error(report.errors);
 *
 * ─────────────────────────────────────────────────────────────────────────────
 */
import "server-only";

// ── Public type exports ────────────────────────────────────────────────────────

export type {
  AgentikDomain,
  IntentCandidate,
  ResolvedIntent,
  IntentResolutionResult,
  IntentParseResult,
  IntentValidationReport,
  IntentExecutionPlan,
} from "./intent-types";

export type { IntentRegistryReport } from "./intent-validator";

// ── Registry exports ───────────────────────────────────────────────────────────

export {
  INTENT_REGISTRY,
  SHOPIFY_INTENT_REGISTRY,
  FINANCE_INTENT_REGISTRY,
  COMMERCIAL_INTENT_REGISTRY,
  MARKETING_INTENT_REGISTRY,
  COBRANZA_INTENT_REGISTRY,
  INVENTORY_INTENT_REGISTRY,
} from "./intent-registry";

// ── Validation exports ─────────────────────────────────────────────────────────

export { validateResolvedIntent, validateIntentRegistry } from "./intent-validator";

// ── Parser exports (for testing / observability) ──────────────────────────────

export { normalizeText, tokenize } from "./intent-parser";

// ── Core resolver exports ──────────────────────────────────────────────────────

export { resolveIntent, buildExecutionPlan } from "./intent-resolver";

// ── Internal imports for facade ────────────────────────────────────────────────

import { INTENT_REGISTRY }                  from "./intent-registry";
import { resolveIntent, buildExecutionPlan } from "./intent-resolver";
import { validateResolvedIntent, validateIntentRegistry } from "./intent-validator";
import type { ResolvedIntent, IntentCandidate } from "./intent-types";

// ── Public facade ──────────────────────────────────────────────────────────────

/**
 * `intentResolver` — stable public API for the Agentik Intent Resolver.
 *
 * This object provides a clean, discoverable surface for Copilot agents
 * and orchestration layers to interact with the resolver.
 */
export const intentResolver = {
  /**
   * Resolve a raw user utterance to a structured intent.
   *
   * @param input  - The raw user text, e.g. "Publica los productos pendientes"
   * @returns IntentResolutionResult with matched intent, confidence, and parameters.
   *
   * @example
   *   const result = intentResolver.resolve("Muéstrame pagos fallidos");
   *   // result.matched === true
   *   // result.resolvedIntent.actionId === "operations.findFailedPayments"
   */
  resolve: (input: string) => resolveIntent(input, INTENT_REGISTRY),

  /**
   * Validate a previously resolved intent for structural and semantic correctness.
   *
   * @param resolved - A ResolvedIntent returned by `resolve()`
   * @returns IntentValidationReport with ok, errors, warnings.
   */
  validate: (resolved: ResolvedIntent) => validateResolvedIntent(resolved),

  /**
   * Build a human-readable, structured execution plan from a resolved intent.
   * The plan is read-only — it DOES NOT execute the action.
   *
   * @param resolved - A valid ResolvedIntent (success=true, matched=true)
   * @returns IntentExecutionPlan with title, summary, approval gate, and parameters.
   */
  buildExecutionPlan: (resolved: ResolvedIntent) => buildExecutionPlan(resolved),

  /**
   * Validate the structural integrity of the entire INTENT_REGISTRY.
   * Run at startup or in CI to catch registration mistakes.
   *
   * @returns IntentRegistryReport with ok, errors, warnings, totalIntents, domainsPresent.
   */
  validateRegistry: () => validateIntentRegistry(),

  /**
   * The full unified intent registry — all domains, all intents.
   * Read-only. Useful for observability and UI listing.
   */
  registry: INTENT_REGISTRY as Readonly<Record<string, IntentCandidate>>,

  /**
   * List all supported intents grouped by domain.
   *
   * @returns A map of domain → array of intent candidates.
   *
   * @example
   *   const byDomain = intentResolver.listSupportedActions();
   *   byDomain.shopify.forEach(intent => console.log(intent.displayName));
   */
  listSupportedActions(): Record<string, IntentCandidate[]> {
    const result: Record<string, IntentCandidate[]> = {};
    for (const candidate of Object.values(INTENT_REGISTRY)) {
      if (!result[candidate.domain]) result[candidate.domain] = [];
      result[candidate.domain].push(candidate);
    }
    return result;
  },
} as const;
