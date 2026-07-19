/**
 * lib/copilot/capability-resolver.ts
 *
 * Agentik Copilot — Capability Availability Resolver V1
 *
 * Phase B3 of Sprint AGENTIK-STRATEGIC-MEMORY-AND-CAPABILITIES-01
 *
 * Resolves which capabilities are available given the current
 * operational context: runtime state, governance, permissions, and module.
 *
 * V1: deterministic from context — no DB, no role fetching.
 */

import type { AgentCapability }       from "./capability-registry";
import { getCapabilitiesForAgent }    from "./capability-registry";

// ── Types ──────────────────────────────────────────────────────────────────────

export type CapabilityAvailability =
  | "available"          // Fully operational
  | "restricted"         // Available but requires approval or supervision
  | "degraded"           // Runtime issues — reduced functionality
  | "blocked";           // Cannot be used in current context

export interface CapabilityAvailabilityResult {
  capability:     AgentCapability;
  availability:   CapabilityAvailability;
  reason?:        string;
  blockedBy?:     string[];
}

// ── Availability resolution rules ─────────────────────────────────────────────

function resolveAvailabilityForCapability(
  cap:              AgentCapability,
  runtimeState:     string,
  tenantState:      string,
  pendingApprovals: number,
): CapabilityAvailabilityResult {
  const blockers: string[] = [];

  // Tenant critical → execution capabilities blocked
  if (tenantState === "critical" && cap.type === "execution") {
    return {
      capability:   cap,
      availability: "blocked",
      reason:       "Tenant en estado crítico — capacidades de ejecución deshabilitadas",
      blockedBy:    ["tenant_critical"],
    };
  }

  // Runtime DEGRADED → integration capabilities blocked, others degraded
  if (runtimeState === "DEGRADED") {
    if (cap.type === "integration") {
      return {
        capability:   cap,
        availability: "blocked",
        reason:       "Runtime degradado — capacidades de integración no disponibles",
        blockedBy:    ["runtime_degraded"],
      };
    }
    if (cap.type === "execution" || cap.executionModes.includes("supervised")) {
      return {
        capability:   cap,
        availability: "degraded",
        reason:       "Runtime degradado — supervisión adicional requerida",
      };
    }
  }

  // Runtime STALE → integration capabilities degraded
  if (runtimeState === "STALE" && cap.type === "integration") {
    return {
      capability:   cap,
      availability: "degraded",
      reason:       "Sincronización pendiente — datos pueden estar desactualizados",
    };
  }

  // Capabilities requiring approval with no pending approvals → restricted
  if (
    cap.requiredPermissions.includes("ORG_ADMIN") &&
    pendingApprovals === 0 &&
    cap.riskLevel !== "low"
  ) {
    blockers.push("approval_required");
    return {
      capability:   cap,
      availability: "restricted",
      reason:       "Requiere aprobación ORG_ADMIN para activar",
      blockedBy:    blockers,
    };
  }

  return {
    capability:   cap,
    availability: "available",
  };
}

// ── Public API ──────────────────────────────────────────────────────────────────

/**
 * Returns all capabilities for an agent with their availability status.
 */
export function getAgentCapabilities(
  agentId:          string,
  runtimeState:     string,
  tenantState:      string,
  pendingApprovals: number,
): CapabilityAvailabilityResult[] {
  const caps = getCapabilitiesForAgent(agentId);
  return caps.map(cap =>
    resolveAvailabilityForCapability(cap, runtimeState, tenantState, pendingApprovals)
  );
}

/**
 * Filters to capabilities relevant to the current active module.
 */
export function resolveCapabilityAvailability(
  capabilities:     CapabilityAvailabilityResult[],
  activeModule:     string,
): CapabilityAvailabilityResult[] {
  const modulePrefix = activeModule.split("/")[0] ?? activeModule;
  return capabilities.filter(r =>
    r.capability.supportedModules.some(m =>
      m === activeModule || m === modulePrefix || m.startsWith(modulePrefix + "/")
    ) || r.capability.riskLevel === "low" // Always show low-risk capabilities
  );
}

/**
 * Returns the dependency resolution state for a capability.
 */
export function resolveCapabilityDependencies(
  cap:          AgentCapability,
  allResults:   CapabilityAvailabilityResult[],
): { resolved: boolean; missing: string[] } {
  const missing: string[] = [];
  for (const depId of cap.dependencies) {
    const depResult = allResults.find(r => r.capability.id === depId);
    if (!depResult || depResult.availability === "blocked") {
      missing.push(depId);
    }
  }
  return { resolved: missing.length === 0, missing };
}

/**
 * Returns a short summary of capability state for rail display.
 */
export function summarizeCapabilityState(
  results:  CapabilityAvailabilityResult[],
  agentId:  string,
): string {
  if (results.length === 0) return "Sin capacidades activas";

  const blocked    = results.filter(r => r.availability === "blocked").length;
  const restricted = results.filter(r => r.availability === "restricted").length;
  const degraded   = results.filter(r => r.availability === "degraded").length;
  const available  = results.filter(r => r.availability === "available").length;

  const agentName = agentId.charAt(0).toUpperCase() + agentId.slice(1);

  if (blocked > 0 && blocked === results.length) {
    return `${agentName}: todas las capacidades bloqueadas`;
  }
  if (blocked > 0) {
    return `${agentName}: ${blocked} capacidad${blocked > 1 ? "es" : ""} bloqueada${blocked > 1 ? "s" : ""}`;
  }
  if (restricted > 0) {
    return `${agentName}: ${restricted} requieren aprobación`;
  }
  if (degraded > 0) {
    return `${agentName}: ${degraded} degradada${degraded > 1 ? "s" : ""} por runtime`;
  }
  return `${agentName}: ${available} capacidad${available > 1 ? "es" : ""} activa${available > 1 ? "s" : ""}`;
}
