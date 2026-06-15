/**
 * lib/copilot/intent-resolver/intent-resolver.ts
 *
 * AGENTIK-INTENT-RESOLVER-02 — Core resolution engine (v2).
 * SERVER ONLY — no React imports, no AI, no LLM calls.
 * @server-only
 *
 * v2 enhancements:
 *   - Parameter extraction delegates to `extractEntities()` (intent-entities.ts)
 *   - Ambiguity warnings surfaced in IntentResolutionResult
 *   - New `explainIntentResolution()` for development / observability
 *   - All backward-compatible: existing resolve/validate/buildExecutionPlan API unchanged
 *
 * NOTE: This engine is permanently deterministic.
 * Future hybrid layer (AGENTIK-INTENT-HYBRID-01) will be able to propose
 * additional candidates via LLM embeddings, but this engine will remain the
 * authoritative validator and execution planner — never replaced.
 */
import "server-only";

import type {
  ResolvedIntent,
  IntentResolutionResult,
  IntentExecutionPlan,
  IntentCandidate,
  IntentResolutionExplanation,
} from "./intent-types";

import { INTENT_REGISTRY }                from "./intent-registry";
import { parseIntent, isLowConfidence }   from "./intent-parser";
import { validateResolvedIntent }         from "./intent-validator";
import { extractEntities, getEntitySignals } from "./intent-entities";

// ── Shopify metadata lookup ────────────────────────────────────────────────────

import {
  SHOPIFY_ACTION_REGISTRY,
} from "@/lib/marketing-studio/commerce/shopify-actions";
import type { ShopifyActionMeta } from "@/lib/marketing-studio/commerce/shopify-actions";

const shopifyRegistry = SHOPIFY_ACTION_REGISTRY as unknown as Record<string, ShopifyActionMeta>;

// ── Domain metadata router ─────────────────────────────────────────────────────

interface ActionMetaSlim {
  requiresApproval:   boolean;
  automationEligible: boolean;
  displayName:        string;
  description:        string;
}

/**
 * Look up action metadata from the appropriate domain registry.
 * `actionId` format: "{namespace}.{functionName}" — we use the last segment.
 *
 * To add a new domain: add a case here.
 */
function lookupActionMeta(
  domain:   string,
  actionId: string,
): ActionMetaSlim | undefined {
  const key = actionId.split(".").at(-1) ?? "";

  switch (domain) {
    case "shopify": {
      const meta = shopifyRegistry[key];
      if (!meta) return undefined;
      return {
        requiresApproval:   meta.requiresApproval,
        automationEligible: meta.automationEligible,
        displayName:        meta.displayName,
        description:        meta.description,
      };
    }
    // Future: case "finance":     return lookupFinanceMeta(key);
    // Future: case "commercial":  return lookupCommercialMeta(key);
    default:
      return undefined;
  }
}

// ── Parameter extraction ───────────────────────────────────────────────────────

/**
 * Convert extracted entities to a flat parameters map for the ResolvedIntent.
 *
 * This function is the adapter between the entity extractor (rich typed object)
 * and the generic parameters contract (Record<string, unknown>).
 * Only non-empty/non-undefined fields are included.
 */
function buildParametersFromEntities(rawInput: string): Record<string, unknown> {
  const entities = extractEntities(rawInput);
  const params: Record<string, unknown> = {};

  if (entities.discountPercent !== undefined) params.discountPercent = entities.discountPercent;
  if (entities.count           !== undefined) params.count           = entities.count;
  if (entities.collection)                    params.collection      = entities.collection;
  if (entities.endDate)                       params.endDate         = entities.endDate;
  if (entities.prefix)                        params.prefix          = entities.prefix;
  if (entities.minDays         !== undefined) params.minDays         = entities.minDays;
  if (entities.threshold       !== undefined) params.threshold       = entities.threshold;
  if (entities.productName)                   params.productName     = entities.productName;
  if (entities.sku)                           params.sku             = entities.sku;
  if (entities.statusKeywords.length > 0)     params.statusKeywords  = entities.statusKeywords;
  if (entities.targetScope)                   params.targetScope     = entities.targetScope;

  return params;
}

// ── Resolution ────────────────────────────────────────────────────────────────

/**
 * Resolve a raw user utterance to a concrete Agentik action.
 *
 * Steps:
 *   1. Parse input against INTENT_REGISTRY (enhanced v2 scorer)
 *   2. If no match → return matched=false
 *   3. Build parameters from entity extractor
 *   4. Look up action metadata from domain registry
 *   5. Validate the resolved intent
 *   6. Return IntentResolutionResult
 *
 * This function NEVER executes the action.
 */
export function resolveIntent(
  rawInput: string,
  registry: Record<string, IntentCandidate> = INTENT_REGISTRY,
): IntentResolutionResult {
  const warnings: string[] = [];
  const errors:   string[] = [];

  if (!rawInput || rawInput.trim().length === 0) {
    return {
      success:      false,
      matched:      false,
      confidence:   0,
      rawInput:     rawInput ?? "",
      parsedTokens: [],
      warnings,
      errors: ["Input is empty"],
    };
  }

  // ── Step 1: Parse ──────────────────────────────────────────────────────────

  const parsed = parseIntent(rawInput, registry);

  if (!parsed.candidateId) {
    return {
      success:      true,
      matched:      false,
      confidence:   parsed.confidence,
      rawInput,
      parsedTokens: parsed.tokens,
      warnings:     ["No intent matched with sufficient confidence — try rephrasing"],
      errors:       [],
    };
  }

  // Ambiguity warning
  if (parsed.ambiguous) {
    const alts = parsed.alternativeCandidates?.slice(0, 2).join(", ") ?? "";
    warnings.push(
      `Ambiguous intent (confidence gap < 8%) — also matched: ${alts}. ` +
      `Confidence reduced. Consider asking the user to clarify.`,
    );
  }

  if (isLowConfidence(parsed.confidence)) {
    warnings.push(
      `Low confidence match (${(parsed.confidence * 100).toFixed(0)}%) — the intent may be ambiguous`,
    );
  }

  // ── Step 2: Candidate ──────────────────────────────────────────────────────

  const candidate = registry[parsed.candidateId];

  // ── Step 3: Parameters ────────────────────────────────────────────────────

  const parameters = buildParametersFromEntities(rawInput);

  // ── Step 4: Domain metadata ───────────────────────────────────────────────

  const meta = lookupActionMeta(candidate.domain, candidate.actionId);

  if (!meta) {
    return {
      success:      false,
      matched:      true,
      confidence:   parsed.confidence,
      rawInput,
      parsedTokens: parsed.tokens,
      warnings,
      errors: [
        `Action "${candidate.actionId}" not found in domain registry "${candidate.domain}"`,
      ],
    };
  }

  // ── Step 5: Build ResolvedIntent ──────────────────────────────────────────

  const resolved: ResolvedIntent = {
    domain:             candidate.domain,
    actionId:           candidate.actionId,
    candidateId:        candidate.id,
    displayName:        meta.displayName,
    description:        meta.description,
    confidence:         parsed.confidence,
    parameters,
    requiresApproval:   meta.requiresApproval,
    automationEligible: meta.automationEligible,
  };

  // ── Step 6: Validate ──────────────────────────────────────────────────────

  const validation = validateResolvedIntent(resolved);
  if (!validation.ok) {
    return {
      success:        false,
      matched:        true,
      confidence:     parsed.confidence,
      resolvedIntent: resolved,
      rawInput,
      parsedTokens:   parsed.tokens,
      warnings:       [...warnings, ...validation.warnings],
      errors:         validation.errors,
    };
  }

  warnings.push(...validation.warnings);

  return {
    success:        true,
    matched:        true,
    confidence:     parsed.confidence,
    resolvedIntent: resolved,
    rawInput,
    parsedTokens:   parsed.tokens,
    warnings,
    errors:         [],
  };
}

// ── Execution plan builder ─────────────────────────────────────────────────────

/**
 * Build a human-readable, structured execution plan from a ResolvedIntent.
 * Read-only — does NOT execute anything.
 */
export function buildExecutionPlan(resolved: ResolvedIntent): IntentExecutionPlan {
  const paramSummary = Object.keys(resolved.parameters).length > 0
    ? Object.entries(resolved.parameters)
        .map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
        .join(", ")
    : "Ninguno";

  const domainLabel = resolved.domain.charAt(0).toUpperCase() + resolved.domain.slice(1);

  const confirmationMessage = resolved.requiresApproval
    ? `Esta acción requiere tu aprobación antes de ejecutarse. ¿Confirmas ejecutar "${resolved.displayName}"?`
    : `Esta acción se ejecutará automáticamente: "${resolved.displayName}".`;

  void paramSummary; // included in plan for future use

  return {
    title:              resolved.displayName,
    summary:            resolved.description,
    requiresApproval:   resolved.requiresApproval,
    automationEligible: resolved.automationEligible,
    domain:             domainLabel,
    actionId:           resolved.actionId,
    parameters:         resolved.parameters,
    confidence:         resolved.confidence,
    confirmationMessage,
  };
}

// ── Explanation (observability) ───────────────────────────────────────────────

/**
 * Returns a full debug explanation of the resolution process.
 *
 * FOR DEVELOPMENT / OBSERVABILITY ONLY — not intended for production display.
 * Shows which aliases matched, which keywords matched, entity signals detected,
 * and how the final confidence was calculated for each candidate.
 *
 * @param rawInput  - The raw user utterance
 * @param registry  - Optional override (defaults to INTENT_REGISTRY)
 */
export function explainIntentResolution(
  rawInput:  string,
  registry:  Record<string, IntentCandidate> = INTENT_REGISTRY,
): IntentResolutionExplanation {
  // Re-run parser with debug info (v2 returns debug fields always)
  const parsed = parseIntent(rawInput, registry);

  // Extract entities independently for the explanation
  const entities     = extractEntities(rawInput);
  const signalsList  = getEntitySignals(entities).map(String);

  return {
    rawInput,
    normalizedInput:   parsed.normalizedInput,
    synonymsApplied:   parsed.synonymsApplied  ?? {},
    tokens:            parsed.tokens,
    keywordScores:     parsed.keywordScores    ?? {},
    phraseAliasScores: parsed.phraseAliasScores ?? {},
    aliasMatches:      parsed.aliasMatches     ?? {},
    keywordsMatched:   parsed.keywordsMatched  ?? {},
    finalScores:       parsed.allScores,
    entitySignals:     signalsList,
    selectedCandidate: parsed.candidateId,
    confidence:        parsed.confidence,
    ambiguous:         parsed.ambiguous        ?? false,
    alternativeCandidates: parsed.alternativeCandidates ?? [],
  };
}
