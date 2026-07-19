// AGENTIK-ENTERPRISE-DIRECTION-SYSTEM-01 — Phase 46: Enterprise Alignment Engine

import type {
  DirectionObjective,
  DirectionInitiative,
  StrategicPillar,
  NorthStar,
} from "./enterprise-direction-types";

export interface EnterpriseAlignmentResult {
  readonly orgSlug:         string;
  readonly overallAlignment: number; // 0–1
  readonly northStarWeight:  number;
  readonly pillarWeight:     number;
  readonly objectiveWeight:  number;
  readonly initiativeWeight: number;
  readonly isAligned:        boolean;
}

export interface DepartmentAlignmentResult {
  readonly orgSlug:     string;
  readonly department:  string;
  readonly alignment:   number; // 0–1
  readonly objectiveIds: string[];
  readonly gaps:        string[];
}

export interface InitiativeAlignmentResult {
  readonly orgSlug:          string;
  readonly initiativeId:     string;
  readonly alignmentScore:   number; // 0–1
  readonly northStarFit:     number;
  readonly pillarFit:        number;
  readonly objectiveCoverage: number;
}

export function calculateEnterpriseAlignment(
  orgSlug: string,
  northStar: NorthStar | null,
  objectives: DirectionObjective[],
  initiatives: DirectionInitiative[],
  pillars: StrategicPillar[]
): EnterpriseAlignmentResult {
  try {
    const northStarWeight   = northStar?.score ?? 0;
    const objectiveWeight   = objectives.length > 0
      ? objectives.reduce((s, o) => s + o.score, 0) / objectives.length
      : 0;
    const initiativeWeight  = initiatives.length > 0
      ? initiatives.reduce((s, i) => s + i.alignmentScore, 0) / initiatives.length
      : 0;
    const totalPillarWeight = pillars.reduce((s, p) => s + p.weight, 0);
    const pillarWeight      = pillars.length > 0 && totalPillarWeight > 0
      ? pillars.reduce((s, p) => s + p.score * p.weight, 0) / totalPillarWeight
      : 0;

    const overallAlignment = Math.min(1,
      northStarWeight   * 0.30 +
      objectiveWeight   * 0.25 +
      initiativeWeight  * 0.25 +
      pillarWeight      * 0.20
    );

    return {
      orgSlug,
      overallAlignment,
      northStarWeight,
      pillarWeight,
      objectiveWeight,
      initiativeWeight,
      isAligned: overallAlignment >= 0.60,
    };
  } catch {
    return {
      orgSlug,
      overallAlignment:  0,
      northStarWeight:   0,
      pillarWeight:      0,
      objectiveWeight:   0,
      initiativeWeight:  0,
      isAligned:         false,
    };
  }
}

export function calculateDepartmentAlignment(
  orgSlug: string,
  department: string,
  objectives: DirectionObjective[]
): DepartmentAlignmentResult {
  try {
    if (objectives.length === 0) {
      return { orgSlug, department, alignment: 0, objectiveIds: [], gaps: ["Sin objetivos asociados"] };
    }
    const avgScore    = objectives.reduce((s, o) => s + o.score, 0) / objectives.length;
    const objectiveIds = objectives.map((o) => o.id);
    const gaps: string[] = [];
    if (avgScore < 0.40) gaps.push("Alineamiento bajo — revisar prioridades del departamento");
    const criticalMissed = objectives.filter((o) => o.priority === "CRITICAL" && o.score < 0.50);
    if (criticalMissed.length > 0) gaps.push(`${criticalMissed.length} objetivo(s) crítico(s) con progreso insuficiente`);
    return { orgSlug, department, alignment: avgScore, objectiveIds, gaps };
  } catch {
    return { orgSlug, department, alignment: 0, objectiveIds: [], gaps: ["Error al calcular alineamiento"] };
  }
}

export function calculateInitiativeAlignment(
  orgSlug: string,
  initiative: DirectionInitiative,
  northStar: NorthStar | null,
  pillars: StrategicPillar[],
  objectives: DirectionObjective[]
): InitiativeAlignmentResult {
  try {
    const northStarFit = northStar
      ? initiative.alignmentScore * 0.8 + (northStar.score * 0.2)
      : initiative.alignmentScore;

    const relatedPillars = pillars.filter((p) => p.domain === initiative.domain);
    const pillarFit      = relatedPillars.length > 0
      ? relatedPillars.reduce((s, p) => s + p.score, 0) / relatedPillars.length
      : 0.5;

    const relatedObjectives = initiative.objectiveId
      ? objectives.filter((o) => o.id === initiative.objectiveId)
      : [];
    const objectiveCoverage = relatedObjectives.length > 0 ? 1 : 0.3;

    const alignmentScore = Math.min(1,
      northStarFit      * 0.45 +
      pillarFit         * 0.30 +
      objectiveCoverage * 0.25
    );

    return {
      orgSlug,
      initiativeId:       initiative.id,
      alignmentScore,
      northStarFit:       Math.min(1, northStarFit),
      pillarFit:          Math.min(1, pillarFit),
      objectiveCoverage,
    };
  } catch {
    return {
      orgSlug,
      initiativeId:       initiative.id,
      alignmentScore:     0,
      northStarFit:       0,
      pillarFit:          0,
      objectiveCoverage:  0,
    };
  }
}
