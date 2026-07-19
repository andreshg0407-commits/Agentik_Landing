// AGENTIK-STRATEGIC-PLANNING-01
// Phase 7 — Risk Planning Engine
// NEVER executes. NEVER modifies data.

import type {
  StrategicRisk, StrategicInitiative, PlanningPriority, StrategicDomain,
} from "./strategic-planning-types";
import { riskLevelFromScore, PLANNING_PRIORITY_RANK } from "./strategic-planning-types";
import { generateRiskPlanId } from "./strategic-planning-identity";

// ── Builder ───────────────────────────────────────────────────────────────────

export function buildPlanningRisk(params: {
  orgSlug:     string;
  planId:      string;
  title:       string;
  description: string;
  domain:      StrategicDomain;
  likelihood:  number;
  impact:      number;
  mitigations?: string[];
  evidenceIds?: string[];
  metadata?:   Record<string, unknown>;
}): StrategicRisk {
  const composite = Math.round(params.likelihood * params.impact * 100) / 100;
  return {
    id:            generateRiskPlanId(),
    orgSlug:       params.orgSlug,
    planId:        params.planId,
    title:         params.title,
    description:   params.description,
    domain:        params.domain,
    level:         riskLevelFromScore(composite),
    likelihood:    Math.min(1, Math.max(0, params.likelihood)),
    impact:        Math.min(1, Math.max(0, params.impact)),
    compositeRisk: composite,
    mitigations:   params.mitigations ?? [],
    evidenceIds:   params.evidenceIds ?? [],
    metadata:      params.metadata    ?? {},
  };
}

// ── From initiatives ──────────────────────────────────────────────────────────

export function buildPlanningRisks(params: {
  orgSlug:      string;
  planId:       string;
  domain:       StrategicDomain;
  initiatives:  StrategicInitiative[];
}): StrategicRisk[] {
  const risks: StrategicRisk[] = [];

  const highEffort = params.initiatives.filter((i) => i.effortScore > 0.7);
  if (highEffort.length > 0) {
    risks.push(buildPlanningRisk({
      orgSlug:     params.orgSlug, planId: params.planId,
      title:       "Riesgo de sobrecarga operativa",
      description: `${highEffort.length} iniciativa(s) de alto esfuerzo pueden comprometer la capacidad de ejecución.`,
      domain:      params.domain,
      likelihood:  0.65, impact: 0.60,
      mitigations: ["Priorizar iniciativas de mayor impacto/esfuerzo", "Faseado gradual"],
    }));
  }

  const blocked = params.initiatives.filter((i) => i.status === "BLOCKED");
  if (blocked.length > 0) {
    risks.push(buildPlanningRisk({
      orgSlug:     params.orgSlug, planId: params.planId,
      title:       "Riesgo de bloqueo de iniciativas",
      description: `${blocked.length} iniciativa(s) en estado BLOCKED pueden retrasar el plan.`,
      domain:      params.domain,
      likelihood:  0.80, impact: 0.70,
      mitigations: ["Identificar y resolver bloqueos antes de iniciar"],
    }));
  }

  const lowConf = params.initiatives.filter((i) => i.confidenceScore < 0.4);
  if (lowConf.length > 0) {
    risks.push(buildPlanningRisk({
      orgSlug:     params.orgSlug, planId: params.planId,
      title:       "Riesgo de supuestos débiles",
      description: `${lowConf.length} iniciativa(s) tienen confianza baja — los supuestos pueden no ser válidos.`,
      domain:      params.domain,
      likelihood:  0.55, impact: 0.50,
      mitigations: ["Validar supuestos con datos antes de comprometer recursos"],
    }));
  }

  return risks;
}

// ── Score ─────────────────────────────────────────────────────────────────────

export function scorePlanningRisk(r: StrategicRisk): number {
  return r.compositeRisk;
}

// ── Rank ─────────────────────────────────────────────────────────────────────

export function rankPlanningRisks(risks: StrategicRisk[]): StrategicRisk[] {
  return [...risks].sort((a, b) => b.compositeRisk - a.compositeRisk);
}

// ── Coverage ─────────────────────────────────────────────────────────────────

export function computeRiskCoverage(risks: StrategicRisk[]): number {
  if (risks.length === 0) return 1;
  const mitigated = risks.filter((r) => r.mitigations.length > 0).length;
  return Math.round((mitigated / risks.length) * 100) / 100;
}
