/**
 * lib/copilot/capability-sharing.ts
 *
 * Agentik Copilot — Multi-Agent Capability Sharing V1
 *
 * Phase B5 of Sprint AGENTIK-STRATEGIC-MEMORY-AND-CAPABILITIES-01
 *
 * Resolves how agents share and delegate capabilities to each other.
 * Example: Diego uses Mila's cobranza capability to activate recovery actions.
 * Example: Luca uses Sofi's ecommerce capability for Shopify publication.
 *
 * V1: static delegation map — no DB, no runtime negotiation.
 */

import type { AgentCapability }              from "./capability-registry";
import { CAPABILITY_REGISTRY }               from "./capability-registry";
import type { CapabilityAvailabilityResult } from "./capability-resolver";

// ── Types ──────────────────────────────────────────────────────────────────────

export type CapabilityDelegationReason =
  | "cross_domain"       // Requester operates outside target domain
  | "risk_reduction"     // Delegate is more appropriate for risk profile
  | "specialization"     // Target agent has specialized capability
  | "operational_need";  // Operational context requires cross-agent support

export interface SharedCapability {
  id:              string;
  sourceAgentId:   string;           // Agent requesting access
  targetAgentId:   string;           // Agent providing the capability
  capabilityId:    string;           // The shared capability
  reason:          CapabilityDelegationReason;
  description:     string;           // Why this sharing makes sense
  active:          boolean;          // Whether sharing is currently active
  requiresHandoff: boolean;          // Whether a collaboration handoff is needed
}

export interface CapabilityDelegation {
  delegatingAgentId: string;         // Agent delegating a capability TO another
  receivingAgentId:  string;         // Agent receiving the delegation
  capabilityId:      string;
  contextSummary:    string;
  estimatedImpact:   "low" | "medium" | "high";
}

export interface CapabilityCollaboration {
  id:                string;
  participants:      string[];        // All involved agent IDs
  sharedCapabilities: SharedCapability[];
  delegations:       CapabilityDelegation[];
  summary:           string;
  priority:          "low" | "medium" | "high";
}

// ── Static delegation map (V1) ─────────────────────────────────────────────────
// Defines permanent cross-agent capability sharing relationships.

const DELEGATION_MAP: Array<{
  sourceAgentId:   string;
  targetAgentId:   string;
  capabilityId:    string;
  reason:          CapabilityDelegationReason;
  description:     string;
  requiresHandoff: boolean;
}> = [
  // Diego → Mila: uses Mila's cobranza capability for recovery operations
  {
    sourceAgentId:   "diego",
    targetAgentId:   "mila",
    capabilityId:    "mila-whatsapp-workflows",
    reason:          "specialization",
    description:     "Diego activa el seguimiento comercial de Mila para cartera vencida detectada",
    requiresHandoff: true,
  },
  {
    sourceAgentId:   "diego",
    targetAgentId:   "mila",
    capabilityId:    "mila-seguimiento-comercial",
    reason:          "operational_need",
    description:     "Diego delega el seguimiento activo de cobros a Mila cuando se detectan vencimientos",
    requiresHandoff: true,
  },

  // Luca → Sofi: uses Sofi's ecommerce capability for Shopify publishing
  {
    sourceAgentId:   "luca",
    targetAgentId:   "sofi",
    capabilityId:    "sofi-ecommerce-systems",
    reason:          "specialization",
    description:     "Luca delega la publicación en Shopify a Sofi para ejecutar campañas de ecommerce",
    requiresHandoff: true,
  },

  // Luca → Sofi: uses runtime review to validate campaign publishing status
  {
    sourceAgentId:   "luca",
    targetAgentId:   "sofi",
    capabilityId:    "sofi-runtime-review",
    reason:          "risk_reduction",
    description:     "Luca consulta a Sofi el estado del runtime antes de activar campañas en producción",
    requiresHandoff: false,
  },

  // Diego → Sofi: uses connector validation before financial operations
  {
    sourceAgentId:   "diego",
    targetAgentId:   "sofi",
    capabilityId:    "sofi-connector-validation",
    reason:          "operational_need",
    description:     "Diego verifica la validez de conectores SAG antes de operaciones de cierre financiero",
    requiresHandoff: false,
  },

  // Mila → Luca: uses marketing intelligence for commercial personalization
  {
    sourceAgentId:   "mila",
    targetAgentId:   "luca",
    capabilityId:    "luca-marketing-intelligence",
    reason:          "cross_domain",
    description:     "Mila consulta el intelligence de campañas de Luca para personalizar seguimiento comercial",
    requiresHandoff: false,
  },
];

// ── Public API ──────────────────────────────────────────────────────────────────

/**
 * Returns all shared capabilities for a given requesting agent.
 * Filters by capabilities that are currently available in the resolved set.
 */
export function resolveSharedCapabilities(
  requestingAgentId:  string,
  availableResults:   CapabilityAvailabilityResult[],
): SharedCapability[] {
  const availableIds = new Set(
    availableResults
      .filter(r => r.availability !== "blocked")
      .map(r => r.capability.id)
  );

  return DELEGATION_MAP
    .filter(d =>
      d.sourceAgentId === requestingAgentId &&
      availableIds.has(d.capabilityId)
    )
    .map((d, idx) => ({
      id:              `shared-${d.sourceAgentId}-${d.targetAgentId}-${idx}`,
      sourceAgentId:   d.sourceAgentId,
      targetAgentId:   d.targetAgentId,
      capabilityId:    d.capabilityId,
      reason:          d.reason,
      description:     d.description,
      active:          true,
      requiresHandoff: d.requiresHandoff,
    }));
}

/**
 * Returns all capability delegations FROM a given agent.
 * Represents capabilities the agent can offer to others.
 */
export function resolveCapabilityDelegation(
  delegatingAgentId: string,
  availableResults:  CapabilityAvailabilityResult[],
): CapabilityDelegation[] {
  const availableIds = new Set(
    availableResults
      .filter(r => r.availability !== "blocked")
      .map(r => r.capability.id)
  );

  return DELEGATION_MAP
    .filter(d =>
      d.targetAgentId === delegatingAgentId &&
      availableIds.has(d.capabilityId)
    )
    .map(d => {
      const cap = CAPABILITY_REGISTRY.find(c => c.id === d.capabilityId);
      return {
        delegatingAgentId: d.targetAgentId,
        receivingAgentId:  d.sourceAgentId,
        capabilityId:      d.capabilityId,
        contextSummary:    d.description,
        estimatedImpact:   (cap?.riskLevel === "high" || cap?.riskLevel === "critical")
          ? "high"
          : cap?.riskLevel === "medium"
          ? "medium"
          : "low",
      } as CapabilityDelegation;
    });
}

/**
 * Builds a capability collaboration object for the current agent context.
 * Aggregates all relevant sharing relationships into a single structure.
 */
export function buildCapabilityCollaboration(
  activeAgentId:     string,
  allResults:        CapabilityAvailabilityResult[],
): CapabilityCollaboration | null {
  const shared     = resolveSharedCapabilities(activeAgentId, allResults);
  const delegated  = resolveCapabilityDelegation(activeAgentId, allResults);

  if (shared.length === 0 && delegated.length === 0) return null;

  const participantSet = new Set<string>([activeAgentId]);
  shared.forEach(s => participantSet.add(s.targetAgentId));
  delegated.forEach(d => participantSet.add(d.receivingAgentId));

  const handoffsRequired = shared.filter(s => s.requiresHandoff).length;
  const priority: CapabilityCollaboration["priority"] =
    handoffsRequired >= 2 ? "high" :
    handoffsRequired === 1 ? "medium" : "low";

  const agentName = activeAgentId.charAt(0).toUpperCase() + activeAgentId.slice(1);
  const summary = shared.length > 0
    ? `${agentName} comparte ${shared.length} capacidad${shared.length > 1 ? "es" : ""} con ${[...participantSet].filter(a => a !== activeAgentId).join(", ")}`
    : `${agentName} delega capacidades a ${[...participantSet].filter(a => a !== activeAgentId).join(", ")}`;

  return {
    id:                  `collab-cap-${activeAgentId}`,
    participants:        [...participantSet],
    sharedCapabilities:  shared,
    delegations:         delegated,
    summary,
    priority,
  };
}

/**
 * Returns a 1-line summary for rail display.
 */
export function summarizeCapabilitySharing(
  collaboration: CapabilityCollaboration | null,
): string {
  if (!collaboration) return "Sin compartición activa de capacidades";
  const handoffs = collaboration.sharedCapabilities.filter(s => s.requiresHandoff).length;
  if (handoffs > 0) {
    return `${handoffs} traspaso${handoffs > 1 ? "s" : ""} de capacidad requerido${handoffs > 1 ? "s" : ""}`;
  }
  return collaboration.summary;
}
