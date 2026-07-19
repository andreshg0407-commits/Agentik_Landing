/**
 * lib/copilot/knowledge/index.ts
 *
 * Agentik Knowledge Foundation — Public API
 * Sprint: AGENTIK-COPILOT-KNOWLEDGE-FOUNDATION-01
 *
 * Single import point for the entire knowledge foundation layer.
 *
 * Usage:
 *   import { getDomain, getCapability, getAgentsForDomain } from "@/lib/copilot/knowledge"
 *
 * Architecture:
 *   Domain → Entity → Capability → Action → Context → Agent
 *
 * All agents, workflows, and runtime modules should consume
 * this layer — never implement their own domain logic.
 */

export * from "./domain-registry";
export * from "./entity-registry";
export * from "./capability-registry";
export * from "./action-registry";
export * from "./context-resolver";
export * from "./agent-definition";
