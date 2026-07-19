/**
 * lib/agent-memory/agent-observation-log.ts
 *
 * Agentik Agent Runtime — Structured Agent Observation Helpers
 *
 * Provides typed helpers for recording, retrieving, and summarizing
 * agent observations. Observations are lightweight operational notes —
 * not full memory nodes — used to enrich context without requiring
 * a full action lifecycle event.
 *
 * Sprint: AGENTIK-AGENT-CONTEXT-MEMORY-GRAPH-01
 */

import type { AgentObservation, MemoryNodeSeverity } from "./runtime-memory-types";
import {
  memObsId,
  appendObservation,
  queryObservations as storeQueryObservations,
} from "./runtime-memory-store";
import type { ObservationFilter } from "./runtime-memory-store";

// ── Observation builder ───────────────────────────────────────────────────────

export interface ObservationInput {
  orgId:       string;
  agentId:     string;
  moduleId:    string;
  observation: string;
  trigger?:    string;
  nodeId?:     string;
  severity?:   MemoryNodeSeverity;
  metadata?:   Record<string, unknown>;
}

/**
 * Records a structured agent observation into the memory store.
 * Returns the persisted observation.
 */
export async function recordObservation(
  input: ObservationInput,
): Promise<AgentObservation> {
  const obs: AgentObservation = {
    id:          memObsId(),
    timestamp:   new Date().toISOString(),
    orgId:       input.orgId,
    agentId:     input.agentId,
    moduleId:    input.moduleId,
    observation: input.observation,
    trigger:     input.trigger ?? null,
    nodeId:      input.nodeId ?? null,
    severity:    input.severity ?? "info",
    metadata:    input.metadata ?? {},
  };
  return appendObservation(obs);
}

// ── Quick observation factories ───────────────────────────────────────────────

export async function recordCriticalObservation(
  orgId:       string,
  agentId:     string,
  moduleId:    string,
  observation: string,
  trigger?:    string,
  metadata?:   Record<string, unknown>,
): Promise<AgentObservation> {
  return recordObservation({ orgId, agentId, moduleId, observation, trigger, severity: "critical", metadata });
}

export async function recordHighObservation(
  orgId:       string,
  agentId:     string,
  moduleId:    string,
  observation: string,
  trigger?:    string,
  metadata?:   Record<string, unknown>,
): Promise<AgentObservation> {
  return recordObservation({ orgId, agentId, moduleId, observation, trigger, severity: "high", metadata });
}

export async function recordInfoObservation(
  orgId:       string,
  agentId:     string,
  moduleId:    string,
  observation: string,
  trigger?:    string,
): Promise<AgentObservation> {
  return recordObservation({ orgId, agentId, moduleId, observation, trigger, severity: "info" });
}

// ── Query helpers ─────────────────────────────────────────────────────────────

/**
 * Returns recent observations for a specific agent.
 */
export async function getRecentObservations(
  agentId: string,
  orgId:   string,
  limit = 10,
): Promise<AgentObservation[]> {
  return storeQueryObservations({ agentId, orgId, limit });
}

/**
 * Returns recent observations for a specific module.
 */
export async function getModuleObservations(
  moduleId: string,
  orgId:    string,
  limit = 20,
): Promise<AgentObservation[]> {
  return storeQueryObservations({ moduleId, orgId, limit });
}

/**
 * Returns observations since a given ISO timestamp.
 */
export async function getObservationsSince(
  orgId: string,
  since: string,
  limit = 50,
): Promise<AgentObservation[]> {
  return storeQueryObservations({ orgId, since, limit });
}

// ── Observation summary ───────────────────────────────────────────────────────

export interface ObservationSummary {
  total:     number;
  critical:  number;
  high:      number;
  medium:    number;
  low:       number;
  info:      number;
  recent:    AgentObservation[];
}

/**
 * Summarizes an observation list by severity for display in dev panels.
 */
export function summarizeObservations(
  observations: AgentObservation[],
  recentLimit = 5,
): ObservationSummary {
  const counts = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
  for (const obs of observations) {
    counts[obs.severity] = (counts[obs.severity] ?? 0) + 1;
  }
  return {
    total:    observations.length,
    ...counts,
    recent:   observations.slice(0, recentLimit),
  };
}

// ── Observation formatting ────────────────────────────────────────────────────

const SEVERITY_LABEL: Record<MemoryNodeSeverity, string> = {
  critical: "[CRITICO]",
  high:     "[ALTO]",
  medium:   "[MEDIO]",
  low:      "[BAJO]",
  info:     "[INFO]",
};

export function formatObservation(obs: AgentObservation): string {
  const label = SEVERITY_LABEL[obs.severity] ?? "[?]";
  const ts    = obs.timestamp.slice(11, 19); // HH:MM:SS
  return `${ts} ${label} ${obs.agentId} — ${obs.observation}`;
}

export function formatObservationList(observations: AgentObservation[]): string[] {
  return observations.map(formatObservation);
}
