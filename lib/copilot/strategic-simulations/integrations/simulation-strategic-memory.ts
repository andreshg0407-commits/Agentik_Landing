// AGENTIK-STRATEGIC-SIMULATIONS-01
// Phase 15 — Strategic Memory Integration

import type { StrategicMemoryEntry } from "../../strategic-memory/strategic-memory-types";
import type { SimulationAssumption, SimulationConstraint } from "../strategic-simulation-types";
import { buildAssumption } from "../assumption-engine";
import { buildConstraint } from "../constraint-engine";

export function buildAssumptionsFromMemory(
  orgSlug: string,
  entries: StrategicMemoryEntry[]
): SimulationAssumption[] {
  return entries
    .filter((e) => e.orgSlug === orgSlug && (e.type === "ASSUMPTION" || e.type === "GOAL") && e.status === "ACTIVE")
    .slice(0, 8)
    .map((e) =>
      buildAssumption({
        label:           e.title,
        description:     e.description,
        domain:          e.domain as SimulationAssumption["domain"],
        confidenceScore: e.confidenceScore ?? 0.5,
        isKeyAssumption: e.priority === "CRITICAL" || e.priority === "HIGH",
        source:          "EXPERT",
        metadata:        { memoryEntryId: e.id },
      })
    );
}

export function buildConstraintsFromMemory(
  orgSlug: string,
  entries: StrategicMemoryEntry[]
): SimulationConstraint[] {
  return entries
    .filter((e) => e.orgSlug === orgSlug && (e.type === "CONSTRAINT" || e.type === "POLICY") && e.status === "ACTIVE")
    .slice(0, 6)
    .map((e) =>
      buildConstraint({
        label:       e.title,
        description: e.description,
        domain:      e.domain as SimulationConstraint["domain"],
        type:        e.priority === "CRITICAL" ? "HARD" : "SOFT",
        origin:      "STRATEGIC",
        impact:      e.priority === "CRITICAL" ? "CRITICAL" : e.priority === "HIGH" ? "HIGH" : "MODERATE",
        isViolated:  false,
        metadata:    { memoryEntryId: e.id },
      })
    );
}

export function extractSimulationGoalContext(orgSlug: string, entries: StrategicMemoryEntry[]): string {
  const goals = entries.filter((e) => e.orgSlug === orgSlug && e.type === "GOAL" && e.status === "ACTIVE");
  if (goals.length === 0) return "Sin objetivos estratégicos activos para contextualizar la simulación.";
  return `${goals.length} objetivo(s) estratégico(s) activos: ${goals.map((g) => g.title).slice(0, 3).join(", ")}.`;
}
