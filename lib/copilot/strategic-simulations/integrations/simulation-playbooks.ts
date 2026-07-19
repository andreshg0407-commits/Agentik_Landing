// AGENTIK-STRATEGIC-SIMULATIONS-01
// Phase 20 — Playbooks Integration

import type { Playbook } from "../../playbooks/playbook-types";
import type { SimulationRecommendation } from "../strategic-simulation-types";
import type { StrategicDomain } from "../../strategic-advisor/strategic-advisor-types";
import { generateSimRecId } from "../strategic-simulation-identity";
import { simulationConfidenceFromScore } from "../strategic-simulation-types";

export function buildSimulationRecommendationsFromPlaybooks(
  orgSlug:   string,
  playbooks: Playbook[],
  domain:    StrategicDomain
): SimulationRecommendation[] {
  return playbooks
    .filter((p) => p.orgSlug === orgSlug && p.status === "ACTIVE")
    .slice(0, 4)
    .map((p) => ({
      id:              generateSimRecId(),
      orgSlug,
      title:           `Aplicar playbook en simulación: ${p.title}`,
      description:     p.description,
      rationale:       `Playbook activo con prioridad ${p.priority}`,
      domain,
      priority:        (p.priority === "CRITICAL" ? "CRITICAL" : p.priority === "HIGH" ? "HIGH" : "MEDIUM") as SimulationRecommendation["priority"],
      confidence:      simulationConfidenceFromScore(0.65),
      confidenceScore: 0.65,
      expectedImpact:  `Aplicación del playbook "${p.title}" en el escenario simulado.`,
      associatedRisks: [],
      evidenceIds:     [],
      scenarioId:      "",
      suggestedOnly:   true as const,
      metadata:        { playbookId: p.id, source: "PLAYBOOK" },
    }));
}

export function getActivePlaybooksForDomain(
  orgSlug:   string,
  domain:    StrategicDomain,
  playbooks: Playbook[]
): Playbook[] {
  return playbooks.filter((p) =>
    p.orgSlug === orgSlug &&
    p.status === "ACTIVE" &&
    (p.category ?? "").toUpperCase() === domain
  ).slice(0, 5);
}
