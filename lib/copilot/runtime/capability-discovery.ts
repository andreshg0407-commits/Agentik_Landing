/**
 * lib/copilot/runtime/capability-discovery.ts
 *
 * Agentik Copilot Runtime — Capability Discovery
 * Sprint: AGENTIK-COPILOT-CONTEXT-BRIDGE-01
 *
 * Given a CopilotRuntimeContext, discovers and ranks capabilities
 * relevant to the current module/screen combination.
 *
 * Discovery algorithm:
 *   1. Start from lead agent's declared capabilities
 *   2. Score each capability by domain relevance
 *   3. Filter against tenant active capabilities
 *   4. Return ranked, deduplicated list
 *
 * No DB calls. No I/O. Pure computation over registry data.
 */

import type { CapabilityId } from "../knowledge/capability-registry";
import type { DomainId } from "../knowledge/domain-registry";
import {
  BUSINESS_CAPABILITY_REGISTRY,
  getCapabilitiesForDomain,
  type BusinessCapability,
} from "../knowledge/capability-registry";
import type { CopilotRuntimeContext } from "./context-builder";

// ── Discovery result ────────────────────────────────────────────────────────

export interface CapabilityDiscoveryResult {
  /** Capabilities owned by the lead agent AND relevant to active domains */
  primary:    RankedCapability[];
  /** Capabilities from supporting agents relevant to active domains */
  secondary:  RankedCapability[];
  /** All relevant capabilities flattened, ranked */
  all:        RankedCapability[];
}

export interface RankedCapability {
  capability:   BusinessCapability;
  score:        number;
  relevantDomains: DomainId[];
  fromAgent:    "lead" | "support" | "domain";
}

// ── Discovery ────────────────────────────────────────────────────────────────

/**
 * Discovers and ranks capabilities from the runtime context.
 *
 * Scoring:
 *   - +3  capability domain is in active domains (core relevance)
 *   - +2  capability is declared by lead agent
 *   - +1  capability is declared by a supporting agent
 *   - +1  per additional active domain the capability touches
 */
export function discoverCapabilities(
  ctx: CopilotRuntimeContext,
): CapabilityDiscoveryResult {
  if (!ctx.isResolved || ctx.domains.length === 0) {
    return { primary: [], secondary: [], all: [] };
  }

  // Collect all capability IDs from domain registry
  const domainCapabilityIds = new Set<CapabilityId>();
  for (const domain of ctx.domains) {
    const caps = getCapabilitiesForDomain(domain);
    for (const cap of caps) {
      domainCapabilityIds.add(cap.id);
    }
  }

  const leadCapabilitySet   = new Set(ctx.leadAgent?.capabilities ?? []);
  const supportCapabilitySet = new Set(
    ctx.supportingAgents.flatMap(a => a.capabilities)
  );

  const ranked: RankedCapability[] = [];

  for (const capId of domainCapabilityIds) {
    const capability = BUSINESS_CAPABILITY_REGISTRY[capId];
    if (!capability) continue;

    // Skip if tenant has active capability filter and this isn't in it
    if (
      ctx.tenant.activeCapabilities.length > 0 &&
      !ctx.tenant.activeCapabilities.includes(capId)
    ) {
      continue;
    }

    // Count how many active domains this capability touches
    const relevantDomains = ctx.domains.filter(d => d === capability.domain);

    let score = 0;
    let fromAgent: RankedCapability["fromAgent"] = "domain";

    // Core domain relevance
    if (relevantDomains.length > 0) score += 3;

    // Agent declaration bonus
    if (leadCapabilitySet.has(capId)) {
      score += 2;
      fromAgent = "lead";
    } else if (supportCapabilitySet.has(capId)) {
      score += 1;
      fromAgent = "support";
    }

    // Multi-domain touch bonus
    score += relevantDomains.length - 1;

    ranked.push({ capability, score, relevantDomains, fromAgent });
  }

  // Sort by score descending
  ranked.sort((a, b) => b.score - a.score);

  const primary   = ranked.filter(r => r.fromAgent === "lead");
  const secondary = ranked.filter(r => r.fromAgent !== "lead");

  return { primary, secondary, all: ranked };
}

// ── Targeted queries ─────────────────────────────────────────────────────────

/**
 * Returns just the capability IDs for the current context, ranked.
 */
export function getCapabilityIds(ctx: CopilotRuntimeContext): CapabilityId[] {
  return discoverCapabilities(ctx).all.map(r => r.capability.id);
}

/**
 * Returns capabilities for a specific domain within the context.
 */
export function getCapabilitiesForContextDomain(
  ctx: CopilotRuntimeContext,
  domain: DomainId,
): RankedCapability[] {
  return discoverCapabilities(ctx).all.filter(
    r => r.capability.domain === domain
  );
}

/**
 * Returns the top N capabilities by score.
 */
export function getTopCapabilities(
  ctx: CopilotRuntimeContext,
  n: number = 5,
): RankedCapability[] {
  return discoverCapabilities(ctx).all.slice(0, n);
}

/**
 * Returns true if a specific capability is available in the context.
 */
export function isCapabilityAvailable(
  ctx: CopilotRuntimeContext,
  capabilityId: CapabilityId,
): boolean {
  return ctx.availableCapabilities.includes(capabilityId);
}
