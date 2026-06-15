/**
 * lib/copilot/intent-resolver/intent-resolver.ts
 *
 * AGENTIK-INTENT-RESOLVER-01 — Core resolution engine.
 * SERVER ONLY — no React imports, no AI, no LLM calls.
 * @server-only
 *
 * Responsibilities:
 *   1. Parse user utterance → identify best IntentCandidate
 *   2. Extract structured parameters via deterministic regex rules
 *   3. Enrich with domain action metadata (requiresApproval, automationEligible)
 *   4. Validate the resolved intent
 *   5. Build an IntentExecutionPlan (read-only — never executes)
 *
 * The resolver is DOMAIN-AGNOSTIC. It dispatches metadata lookups by domain.
 * To add a new domain: implement a metadata lookup function and add a case
 * to `lookupActionMeta()`.
 */
import "server-only";

import type {
  ResolvedIntent,
  IntentResolutionResult,
  IntentExecutionPlan,
  IntentCandidate,
} from "./intent-types";

import { INTENT_REGISTRY }             from "./intent-registry";
import { parseIntent, isLowConfidence } from "./intent-parser";
import { validateResolvedIntent }      from "./intent-validator";

// ── Shopify metadata lookup ────────────────────────────────────────────────────

// Lazy import pattern: we import SHOPIFY_ACTION_REGISTRY only when needed
// and cast it to a plain Record to allow dynamic key lookup.
// This avoids importing the full shopify bundle into every module that
// uses the resolver.
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
 * Returns undefined if the action is not registered in any known domain.
 *
 * `actionId` format: "{namespace}.{functionName}"
 * We use the last segment as the registry key.
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

    // Future domains — add cases as sprints complete:
    // case "finance":   return lookupFinanceMeta(key);
    // case "commercial": return lookupCommercialMeta(key);

    default:
      return undefined;
  }
}

// ── Parameter extraction ───────────────────────────────────────────────────────

/**
 * Extract structured parameters from the raw input using deterministic regex rules.
 *
 * Rules are ordered from most-specific to least-specific.
 * No NLP, no AI. Pure pattern matching.
 *
 * Examples:
 *   "Haz una promoción del 20%"        → { discountPercent: 20 }
 *   "Genera 50 códigos"                → { count: 50 }
 *   "Haz una promoción hasta junio 30" → { endDate: "junio 30" }
 *   "Publica categoría juguetes"       → { collection: "juguetes" }
 *   "Envíos retrasados más de 7 días"  → { minDays: 7 }
 *   "Productos con calidad menor de 60"→ { threshold: 60 }
 */
function extractParameters(rawInput: string): Record<string, unknown> {
  const params: Record<string, unknown> = {};

  // ── Discount percentage ────────────────────────────────────────────────────
  // "20%", "del 20 %", "un 15%"
  const pctMatch = rawInput.match(/(\d+(?:\.\d+)?)\s*%/);
  if (pctMatch) {
    params.discountPercent = parseFloat(pctMatch[1]);
  }

  // ── Bulk count ─────────────────────────────────────────────────────────────
  // "genera 50 códigos", "crea 20 cupones", "100 discount codes"
  const countMatch = rawInput.match(/(\d+)\s+(?:códigos?|cupones?|codes?|discount\s+codes?)/i);
  if (countMatch) {
    params.count = parseInt(countMatch[1], 10);
  } else {
    // Fallback: bare number before a relevant keyword
    const countFallback = rawInput.match(/(?:genera|crea|generar)\s+(\d+)/i);
    if (countFallback) {
      params.count = parseInt(countFallback[1], 10);
    }
  }

  // ── End date ───────────────────────────────────────────────────────────────
  // "hasta junio 30", "al 30 de junio", "until June 30"
  const dateMatch = rawInput.match(/(?:hasta|al|until|before)\s+(.{3,40}?)(?:\s+y\s|\s+o\s|$)/i);
  if (dateMatch) {
    params.endDate = dateMatch[1].trim();
  }

  // ── Collection / category name ─────────────────────────────────────────────
  // "categoría juguetes", "colección verano", "la colección de ropa"
  const colMatch = rawInput.match(/(?:categor[íi]a|colecci[oó]n)\s+(?:de\s+)?([a-záéíóúñüa-z\w\s]{2,30})/i);
  if (colMatch) {
    params.collection = colMatch[1].trim();
  }

  // ── Minimum days (for delayed shipments) ──────────────────────────────────
  // "retrasados más de 7 días", "con más de 10 días sin movimiento"
  const daysMatch = rawInput.match(/(?:m[aá]s\s+de\s+)?(\d+)\s+d[íi]as?/i);
  if (daysMatch) {
    params.minDays = parseInt(daysMatch[1], 10);
  }

  // ── Quality threshold ──────────────────────────────────────────────────────
  // "calidad menor de 60", "menos del 70%", "con score menor a 50"
  const thresholdMatch = rawInput.match(
    /(?:menor\s+(?:de|a)|por\s+debajo\s+(?:de|del))\s+(\d+)/i,
  );
  if (thresholdMatch && !params.discountPercent) {
    params.threshold = parseInt(thresholdMatch[1], 10);
  }

  // ── Discount code prefix ───────────────────────────────────────────────────
  // "códigos con prefijo VERANO", "prefix PROMO"
  const prefixMatch = rawInput.match(/(?:prefijo|prefix)\s+([A-Z0-9\-_]{2,20})/i);
  if (prefixMatch) {
    params.prefix = prefixMatch[1].toUpperCase();
  }

  return params;
}

// ── Resolution ────────────────────────────────────────────────────────────────

/**
 * Resolve a raw user utterance to a concrete Agentik action.
 *
 * Steps:
 *   1. Parse input against INTENT_REGISTRY
 *   2. If no match (confidence below threshold) → return matched=false
 *   3. Extract parameters from raw input
 *   4. Look up action metadata from domain registry
 *   5. Validate the resolved intent
 *   6. Return structured IntentResolutionResult
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
      errors:       ["Input is empty"],
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

  if (isLowConfidence(parsed.confidence)) {
    warnings.push(
      `Low confidence match (${(parsed.confidence * 100).toFixed(0)}%) — the intent may be ambiguous`,
    );
  }

  // ── Step 2: Candidate ──────────────────────────────────────────────────────

  const candidate = registry[parsed.candidateId];

  // ── Step 3: Parameters ────────────────────────────────────────────────────

  const parameters = extractParameters(rawInput);

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
        `Action "${candidate.actionId}" not found in domain registry "${candidate.domain}" — is the registry wired correctly?`,
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
      success:       false,
      matched:       true,
      confidence:    parsed.confidence,
      resolvedIntent: resolved,
      rawInput,
      parsedTokens:  parsed.tokens,
      warnings:      [...warnings, ...validation.warnings],
      errors:        validation.errors,
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
 *
 * The plan describes WHAT would happen — it does NOT execute anything.
 * Execution is the responsibility of the domain action layer.
 *
 * @param resolved - A valid ResolvedIntent (success=true, matched=true)
 * @returns IntentExecutionPlan ready for display or approval gating
 */
export function buildExecutionPlan(resolved: ResolvedIntent): IntentExecutionPlan {
  const paramSummary = Object.keys(resolved.parameters).length > 0
    ? Object.entries(resolved.parameters)
        .map(([k, v]) => `${k}: ${String(v)}`)
        .join(", ")
    : "Ninguno";

  const domainLabel = resolved.domain.charAt(0).toUpperCase() + resolved.domain.slice(1);

  const confirmationMessage = resolved.requiresApproval
    ? `Esta acción requiere tu aprobación antes de ejecutarse. ¿Confirmas ejecutar "${resolved.displayName}"?`
    : `Esta acción se ejecutará automáticamente: "${resolved.displayName}".`;

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
