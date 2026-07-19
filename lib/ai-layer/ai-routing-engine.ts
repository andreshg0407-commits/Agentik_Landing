/**
 * lib/ai-layer/ai-routing-engine.ts
 *
 * Agentik — AI Layer Foundation — Routing Engine
 * Sprint: AGENTIK-AI-LAYER-FOUNDATION-01
 *
 * Pure domain. No Prisma. No React. No server-only. Client-safe.
 *
 * Selects the best model for a given AIRequest given:
 *   - Required capabilities
 *   - Routing strategy
 *   - Tenant preferences
 *   - Estimated credit costs (injected — no pricing calls from here)
 *
 * Never throws — always returns a structured result.
 */

import type {
  AIRequest,
  AIModelDefinition,
  AIRoutingStrategy,
  AITenantPreferences,
  AIRoutingCandidate,
  AIProviderId,
} from "./ai-layer-types";
import { satisfiesCapabilities } from "./ai-capabilities";

// ── Routing result ────────────────────────────────────────────────────────────

export interface AIRoutingResult {
  selected?: AIModelDefinition;
  estimatedCredits: number;
  routingStrategy: AIRoutingStrategy;
  reason: string;
  error?: string;
  candidatesConsidered: number;
}

// ── Round-robin state (module-level, reset-able for tests) ────────────────────
//
// NOTE: _rrIndex is module-level state shared across all tenants and all
// capability pools. This means tenant A's calls affect tenant B's round-robin
// position. This is intentional and acceptable for Phase 1 (mock adapters only).
// Per-tenant or per-capability RR state will be addressed in
// AGENTIK-AI-LAYER-RESILIENCE-01 when real provider failover is needed.
//
// The counter is unbounded (never wraps at write time). Modulo is applied
// only when reading idx, so that variable pool sizes across calls don't
// cause index drift or repeated selections.

let _rrIndex = 0;

export function _resetRoundRobin(): void {
  _rrIndex = 0;
}

// ── Core routing function ─────────────────────────────────────────────────────

/**
 * Select the best model from a list of pre-scored candidates.
 *
 * @param request       - The incoming AI request
 * @param candidates    - Available models with estimated credits
 * @param prefs         - Tenant preferences (optional)
 * @returns             AIRoutingResult — never throws
 */
export function routeAIRequest(
  request: AIRequest,
  candidates: AIRoutingCandidate[],
  prefs?: AITenantPreferences,
): AIRoutingResult {
  const strategy = resolveStrategy(request, prefs);

  // Filter by required capabilities
  const capable = candidates.filter(c =>
    satisfiesCapabilities(c.model.capabilities, request.requiredCapabilities),
  );

  // Apply tenant provider allowlist then blocklist
  const allowed = applyBlocklist(applyAllowlist(capable, prefs), prefs);

  if (allowed.length === 0) {
    return {
      estimatedCredits: 0,
      routingStrategy: strategy,
      reason: "No capable models available after applying tenant constraints.",
      error: `No model satisfies capabilities: ${request.requiredCapabilities.join(", ")}`,
      candidatesConsidered: candidates.length,
    };
  }

  // Apply credit limit guard
  const withinBudget = applyBudgetGuard(allowed, prefs);
  const pool = withinBudget.length > 0 ? withinBudget : allowed;

  // Apply tenant_pinned shortcut
  if (strategy === "TENANT_PINNED") {
    const pinned = resolvePinnedModel(pool, request, prefs);
    if (pinned) {
      return makeResult(pinned, strategy, "Tenant-pinned model selected.", candidates.length);
    }
    // Pinned model not available — either capability mismatch, blocked, or allowlist exclusion.
    // Fall through to BEST_QUALITY. The routing reason will note the override.
    const pinnedId = request.preferredModelId ?? prefs?.preferredModelId ?? prefs?.preferredProviderId ?? "unknown";
    const selected = selectByStrategy(pool, "BEST_QUALITY");
    if (!selected) {
      return {
        estimatedCredits:     0,
        routingStrategy:      strategy,
        reason:               `Pinned model/provider (${pinnedId}) not available. BEST_QUALITY fallback also failed.`,
        error:                `No capable model after TENANT_PINNED fallback for ${pinnedId}.`,
        candidatesConsidered: candidates.length,
      };
    }
    const reason = `Pinned model/provider (${pinnedId}) unavailable or blocked. Fell back to BEST_QUALITY: ${selected.model.id}.`;
    return makeResult(selected, strategy, reason, candidates.length);
  }

  // Apply preferred model hint (non-pinned)
  const hinted = resolveHint(pool, request);
  if (hinted) {
    return makeResult(hinted, strategy, `Preferred model ${hinted.model.id} available.`, candidates.length);
  }

  // Apply routing strategy
  const selected = selectByStrategy(pool, strategy);

  if (!selected) {
    return {
      estimatedCredits: 0,
      routingStrategy: strategy,
      reason: "Strategy selection returned no model.",
      error: "Routing failed: empty pool after strategy application.",
      candidatesConsidered: candidates.length,
    };
  }

  const reason = buildReason(selected, strategy);
  return makeResult(selected, strategy, reason, candidates.length);
}

// ── Strategy resolution ───────────────────────────────────────────────────────

function resolveStrategy(request: AIRequest, prefs?: AITenantPreferences): AIRoutingStrategy {
  if (prefs?.preferredModelId || prefs?.preferredProviderId) return "TENANT_PINNED";
  return request.routingStrategy ?? "BEST_QUALITY";
}

// ── Allowlist filter ──────────────────────────────────────────────────────────

function applyAllowlist(
  candidates: AIRoutingCandidate[],
  prefs?: AITenantPreferences,
): AIRoutingCandidate[] {
  if (!prefs?.allowedProviderIds || prefs.allowedProviderIds.length === 0) return candidates;
  return candidates.filter(c => (prefs.allowedProviderIds as AIProviderId[]).includes(c.model.providerId));
}

// ── Blocklist filter ──────────────────────────────────────────────────────────

function applyBlocklist(
  candidates: AIRoutingCandidate[],
  prefs?: AITenantPreferences,
): AIRoutingCandidate[] {
  if (
    (!prefs?.blockedProviderIds || prefs.blockedProviderIds.length === 0) &&
    (!prefs?.blockedModelIds    || prefs.blockedModelIds.length === 0)
  ) return candidates;

  return candidates.filter(c => {
    if (prefs?.blockedProviderIds?.includes(c.model.providerId)) return false;
    if (prefs?.blockedModelIds?.includes(c.model.id))            return false;
    return true;
  });
}

// ── Budget guard ──────────────────────────────────────────────────────────────

function applyBudgetGuard(
  candidates: AIRoutingCandidate[],
  prefs?: AITenantPreferences,
): AIRoutingCandidate[] {
  if (!prefs?.maxCreditsPerCall || prefs.maxCreditsPerCall === 0) return candidates;
  return candidates.filter(c => c.estimatedCredits <= prefs.maxCreditsPerCall!);
}

// ── Pinned model resolution ───────────────────────────────────────────────────

function resolvePinnedModel(
  pool: AIRoutingCandidate[],
  request: AIRequest,
  prefs?: AITenantPreferences,
): AIRoutingCandidate | undefined {
  const modelId = request.preferredModelId ?? prefs?.preferredModelId;
  const providerId = request.preferredProviderId ?? prefs?.preferredProviderId;

  if (modelId) {
    const exact = pool.find(c => c.model.id === modelId);
    if (exact) return exact;
  }

  if (providerId) {
    const providerMatch = pool.find(c => c.model.providerId === providerId);
    if (providerMatch) return providerMatch;
  }

  return undefined;
}

// ── Hint resolution (non-pinned) ──────────────────────────────────────────────

function resolveHint(
  pool: AIRoutingCandidate[],
  request: AIRequest,
): AIRoutingCandidate | undefined {
  if (request.preferredModelId) {
    return pool.find(c => c.model.id === request.preferredModelId);
  }
  if (request.preferredProviderId) {
    return pool.find(c => c.model.providerId === request.preferredProviderId);
  }
  return undefined;
}

// ── Strategy selection ────────────────────────────────────────────────────────

function selectByStrategy(
  pool: AIRoutingCandidate[],
  strategy: AIRoutingStrategy,
): AIRoutingCandidate | undefined {
  if (pool.length === 0) return undefined;

  switch (strategy) {
    case "CHEAPEST":
      return [...pool].sort((a, b) => a.estimatedCredits - b.estimatedCredits)[0];

    case "FASTEST":
      return [...pool].sort((a, b) => b.model.latencyScore - a.model.latencyScore)[0];

    case "BEST_QUALITY":
      return [...pool].sort((a, b) => b.model.qualityScore - a.model.qualityScore)[0];

    case "ROUND_ROBIN": {
      // Increment first (unbounded), read modulo pool.length.
      // This ensures correct distribution even when pool sizes differ across calls.
      const idx = _rrIndex % pool.length;
      _rrIndex += 1;
      return pool[idx];
    }

    case "TENANT_PINNED":
      // Already handled before this function; fall back to BEST_QUALITY
      return [...pool].sort((a, b) => b.model.qualityScore - a.model.qualityScore)[0];

    default:
      return pool[0];
  }
}

// ── Result builders ───────────────────────────────────────────────────────────

function makeResult(
  candidate: AIRoutingCandidate,
  strategy: AIRoutingStrategy,
  reason: string,
  candidatesConsidered: number,
): AIRoutingResult {
  return {
    selected: candidate.model,
    estimatedCredits: candidate.estimatedCredits,
    routingStrategy: strategy,
    reason,
    candidatesConsidered,
  };
}

function buildReason(candidate: AIRoutingCandidate, strategy: AIRoutingStrategy): string {
  switch (strategy) {
    case "CHEAPEST":   return `Selected ${candidate.model.id} (cheapest: ${candidate.estimatedCredits} credits).`;
    case "FASTEST":    return `Selected ${candidate.model.id} (latency score: ${candidate.model.latencyScore}).`;
    case "BEST_QUALITY": return `Selected ${candidate.model.id} (quality score: ${candidate.model.qualityScore}).`;
    case "ROUND_ROBIN":  return `Selected ${candidate.model.id} (round-robin).`;
    default:           return `Selected ${candidate.model.id} via ${strategy}.`;
  }
}
