/**
 * lib/copilot/runtime/index.ts
 *
 * Agentik Copilot Runtime — Public API
 * Sprint: AGENTIK-COPILOT-CONTEXT-BRIDGE-01
 *
 * Single import point for the entire Copilot Runtime layer.
 *
 * Usage:
 *   import { buildRuntimeSnapshot, isSnapshotReady } from "@/lib/copilot/runtime"
 *
 * Architecture:
 *   Module path → Domains → Lead Agent → Capabilities → Actions → Snapshot
 *
 * Layer contract:
 *   - Consumes: lib/copilot/knowledge/*
 *   - Produces: CopilotRuntimeSnapshot (serializable, prompt-ready)
 *   - Never calls DB, SAG, or external APIs
 *   - Never imports from app/, components/, or prisma
 */

// ── Module → Domain resolution ────────────────────────────────────────────────
export {
  resolveDomainsForModule,
  getDomainsForModule,
  getPrimaryDomainForModule,
  getRelatedModules,
  type ModuleDomainResolution,
} from "./module-domain-resolver";

// ── Domain → Agent resolution ─────────────────────────────────────────────────
export {
  resolveAgentsForDomain,
  resolveAgentsForDomains,
  getLeadAgent,
  getLeadAgentForDomain,
  getAllRelevantAgents,
  type DomainAgentResolution,
  type MultiDomainAgentResolution,
} from "./domain-agent-resolver";

// ── Context builder ───────────────────────────────────────────────────────────
export {
  buildCopilotContext,
  buildNullCopilotContext,
  updateContextNavigation,
  isContextReady,
  type CopilotRuntimeContext,
  type CopilotContextInput,
} from "./context-builder";

// ── Capability discovery ──────────────────────────────────────────────────────
export {
  discoverCapabilities,
  getCapabilityIds,
  getCapabilitiesForContextDomain,
  getTopCapabilities,
  isCapabilityAvailable,
  type CapabilityDiscoveryResult,
  type RankedCapability,
} from "./capability-discovery";

// ── Action recommendation ─────────────────────────────────────────────────────
export {
  recommendActions,
  getAvailableActionIds,
  isActionRecommended,
  getTopImmediateActions,
  type ActionRecommendationResult,
  type RecommendedAction,
} from "./action-recommendation";

// ── Runtime snapshot ──────────────────────────────────────────────────────────
export {
  buildRuntimeSnapshot,
  buildNullSnapshot,
  isSnapshotReady,
  getSnapshotReadinessLabel,
  type CopilotRuntimeSnapshot,
  type SnapshotReadiness,
} from "./runtime-snapshot";
