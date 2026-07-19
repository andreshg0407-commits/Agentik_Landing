// AGENTIK-STRATEGIC-PLANNING-01
// Phase 6 — Milestone Engine
// NEVER executes. NEVER modifies data.

import type {
  StrategicMilestone, PlanningPriority, PlanningHorizon,
  PlanningStatus, StrategicInitiative,
} from "./strategic-planning-types";
import { PLANNING_PRIORITY_RANK } from "./strategic-planning-types";
import { generateMilestoneId } from "./strategic-planning-identity";

// ── Builder ───────────────────────────────────────────────────────────────────

export function createMilestone(params: {
  orgSlug:          string;
  initiativeId:     string;
  title:            string;
  description:      string;
  successCriteria:  string;
  estimatedDate?:   PlanningHorizon;
  priority?:        PlanningPriority;
  status?:          PlanningStatus;
  dependencyIds?:   string[];
  evidenceIds?:     string[];
  metadata?:        Record<string, unknown>;
}): StrategicMilestone {
  return {
    id:              generateMilestoneId(),
    orgSlug:         params.orgSlug,
    initiativeId:    params.initiativeId,
    title:           params.title,
    description:     params.description,
    successCriteria: params.successCriteria,
    estimatedDate:   params.estimatedDate ?? "MEDIUM_TERM",
    priority:        params.priority      ?? "MEDIUM",
    status:          params.status        ?? "DRAFT",
    dependencyIds:   params.dependencyIds ?? [],
    evidenceIds:     params.evidenceIds   ?? [],
    metadata:        params.metadata      ?? {},
    createdAt:       new Date().toISOString(),
  };
}

// ── Validation ────────────────────────────────────────────────────────────────

export interface MilestoneValidationResult {
  readonly valid:    boolean;
  readonly warnings: string[];
  readonly errors:   string[];
}

export function validateMilestone(m: StrategicMilestone): MilestoneValidationResult {
  const errors:   string[] = [];
  const warnings: string[] = [];
  if (!m.title || m.title.trim().length === 0)          errors.push("Milestone title required");
  if (!m.initiativeId)                                   errors.push("Milestone must have a parent initiativeId");
  if (!m.successCriteria || m.successCriteria.trim().length === 0) warnings.push(`Milestone "${m.title}" has no success criteria`);
  if (!m.id.startsWith("milestone_"))                    errors.push("Invalid milestone ID prefix");
  return { valid: errors.length === 0, warnings, errors };
}

// ── Score ─────────────────────────────────────────────────────────────────────

export function scoreMilestone(m: StrategicMilestone): number {
  const hasSuccessCriteria = m.successCriteria.trim().length > 0 ? 0.30 : 0;
  const hasEvidence        = m.evidenceIds.length > 0 ? 0.20 : 0;
  const priorityBonus      = PLANNING_PRIORITY_RANK[m.priority] * 0.10;
  return Math.min(1, Math.round((0.40 + hasSuccessCriteria + hasEvidence + priorityBonus) * 100) / 100);
}

// ── Group ─────────────────────────────────────────────────────────────────────

export function groupMilestones(
  milestones: StrategicMilestone[]
): Record<PlanningHorizon, StrategicMilestone[]> {
  const groups: Record<PlanningHorizon, StrategicMilestone[]> = {
    IMMEDIATE: [], SHORT_TERM: [], MEDIUM_TERM: [], LONG_TERM: [],
  };
  for (const m of milestones) {
    groups[m.estimatedDate].push(m);
  }
  return groups;
}

// ── Derive from initiative ────────────────────────────────────────────────────

export function buildDefaultMilestonesForInitiative(
  initiative: StrategicInitiative
): StrategicMilestone[] {
  const horizonSeq: PlanningHorizon[] = ["SHORT_TERM", "MEDIUM_TERM", "LONG_TERM"];

  return [
    createMilestone({
      orgSlug:         initiative.orgSlug,
      initiativeId:    initiative.id,
      title:           `Inicio: ${initiative.title}`,
      description:     `Arranque formal de la iniciativa "${initiative.title}".`,
      successCriteria: "Equipo asignado, alcance definido, herramientas disponibles.",
      estimatedDate:   "SHORT_TERM",
      priority:        initiative.priority,
      evidenceIds:     initiative.evidenceIds,
    }),
    createMilestone({
      orgSlug:         initiative.orgSlug,
      initiativeId:    initiative.id,
      title:           `Implementación: ${initiative.title}`,
      description:     `Ejecución de las acciones principales de la iniciativa.`,
      successCriteria: "Acciones clave completadas según plan.",
      estimatedDate:   initiative.horizon,
      priority:        initiative.priority,
      evidenceIds:     initiative.evidenceIds,
    }),
    createMilestone({
      orgSlug:         initiative.orgSlug,
      initiativeId:    initiative.id,
      title:           `Revisión y cierre: ${initiative.title}`,
      description:     `Evaluación de resultados y captura de aprendizajes.`,
      successCriteria: "Resultados medidos, aprendizajes documentados.",
      estimatedDate:   "LONG_TERM",
      priority:        "MEDIUM",
    }),
  ];
}
