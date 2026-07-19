/**
 * lib/copilot/intent-resolver/index.ts
 *
 * AGENTIK-INTENT-RESOLVER-02 — Public facade (v2).
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
 *   Intent Resolver              ← THIS MODULE
 *     │
 *     ├────► Synonym & Alias Layer   (intent-aliases.ts)
 *     ├────► Entity Extractor        (intent-entities.ts)
 *     ├────► Keyword Scorer          (intent-parser.ts)
 *     ├────► Domain Metadata Lookup  (SHOPIFY_ACTION_REGISTRY, ...)
 *     ├────► Validator               (intent-validator.ts)
 *     │
 *     ├──────► Shopify Actions  (SHOPIFY-COPILOT-ACTIONS-01C)
 *     ├──────► Finance Actions  (future: AGENTIK-INTENT-FINANCE-01)
 *     ├──────► Commercial       (future: AGENTIK-INTENT-COMMERCIAL-01)
 *     └──────► Others
 *
 * This engine is PERMANENTLY deterministic. A future hybrid layer
 * (AGENTIK-INTENT-HYBRID-01) may use LLM embeddings to propose candidate
 * intents, but this engine will remain the authoritative validator and
 * execution planner — never replaced, only augmented.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * USAGE
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *   import { intentResolver } from "@/lib/copilot/intent-resolver";
 *
 *   const result = intentResolver.resolve("Haz una rebaja del 20% en juguetes");
 *   if (result.matched && result.resolvedIntent) {
 *     // resolvedIntent.parameters → { discountPercent: 20, collection: "juguetes" }
 *     const plan = intentResolver.buildExecutionPlan(result.resolvedIntent);
 *   }
 *
 *   // For development / observability:
 *   const debug = intentResolver.explain("Sube los productos faltantes");
 *   // debug.synonymsApplied, debug.aliasMatches, debug.finalScores, ...
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
  IntentResolutionExplanation,
} from "./intent-types";

export type { IntentRegistryReport }   from "./intent-validator";
export type { ExtractedEntities, EntitySignal } from "./intent-entities";

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

// ── Alias / synonym exports ────────────────────────────────────────────────────

export {
  SYNONYM_MAP,
  INTENT_PHRASE_ALIASES,
  normalizeWithSynonyms,
  normalizeWithSynonymsTracked,
  getMatchingAliases,
} from "./intent-aliases";

// ── Entity exports ─────────────────────────────────────────────────────────────

export { extractEntities, getEntitySignals } from "./intent-entities";

// ── Validation exports ─────────────────────────────────────────────────────────

export { validateResolvedIntent, validateIntentRegistry } from "./intent-validator";

// ── Parser exports ────────────────────────────────────────────────────────────

export { normalizeText, tokenize } from "./intent-parser";

// ── Core resolver exports ──────────────────────────────────────────────────────

export {
  resolveIntent,
  buildExecutionPlan,
  explainIntentResolution,
} from "./intent-resolver";

// ── Internal imports for facade ────────────────────────────────────────────────

import { INTENT_REGISTRY }                             from "./intent-registry";
import { resolveIntent, buildExecutionPlan,
         explainIntentResolution }                     from "./intent-resolver";
import { validateResolvedIntent, validateIntentRegistry } from "./intent-validator";
import { extractEntities }                             from "./intent-entities";
import type { ResolvedIntent, IntentCandidate }        from "./intent-types";

// ── Public facade ──────────────────────────────────────────────────────────────

/**
 * `intentResolver` — stable public API for the Agentik Intent Resolver.
 *
 * All methods are backward-compatible with AGENTIK-INTENT-RESOLVER-01.
 * v2 additions: `explain()`, `extractEntities()`.
 */
export const intentResolver = {
  /**
   * Resolve a raw user utterance to a structured intent.
   * v2: uses synonym normalization, phrase aliases, entity signals, ambiguity detection.
   */
  resolve: (input: string) => resolveIntent(input, INTENT_REGISTRY),

  /**
   * Validate a previously resolved intent for structural correctness.
   */
  validate: (resolved: ResolvedIntent) => validateResolvedIntent(resolved),

  /**
   * Build a human-readable execution plan from a resolved intent.
   * Does NOT execute the action.
   */
  buildExecutionPlan: (resolved: ResolvedIntent) => buildExecutionPlan(resolved),

  /**
   * Return a full debug explanation of the resolution process.
   * FOR DEVELOPMENT / OBSERVABILITY ONLY.
   *
   * Shows: synonymsApplied, aliasMatches, keywordsMatched, entitySignals,
   *        allScores, ambiguity status, alternativeCandidates.
   */
  explain: (input: string) => explainIntentResolution(input, INTENT_REGISTRY),

  /**
   * Extract structured entities from a raw utterance.
   * Standalone — does not require intent resolution.
   *
   * @example
   *   const { discountPercent, collection } = intentResolver.extractEntities(
   *     "Haz una rebaja del 20% en juguetes"
   *   );
   *   // { discountPercent: 20, collection: "juguetes", statusKeywords: [] }
   */
  extractEntities: (input: string) => extractEntities(input),

  /**
   * Validate the structural integrity of the entire INTENT_REGISTRY.
   */
  validateRegistry: () => validateIntentRegistry(),

  /**
   * The full unified intent registry — all domains, all intents.
   */
  registry: INTENT_REGISTRY as Readonly<Record<string, IntentCandidate>>,

  /**
   * List all supported intents grouped by domain.
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
