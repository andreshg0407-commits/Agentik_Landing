// AGENTIK-EXECUTIVE-BRAIN-02
// Phase 4 — Executive Situation Engine
// Builds a current executive photograph from all available context

import type { StrategicMemoryEntry } from "../strategic-memory/strategic-memory-types";
import type { LearningPattern, LearningOutcome } from "../learning/learning-types";
import type { ReasoningSignal } from "../cross-module-reasoning/cross-module-types";
import type {
  ExecutiveSituation,
  ExecutiveRisk,
  ExecutiveOpportunity,
  ExecutiveConflict,
  ExecutivePriority,
  ExecutiveBrainV2Input,
  ExecutiveDomain,
} from "./executive-brain-types";
import {
  generateEbv2Id,
  confidenceFromScore,
  riskLevelFromScore,
  opportunityMagnitudeFromScore,
} from "./executive-brain-types";
import type { StrategicExecutiveContext } from "./strategic-context-engine";
import type { LearningExecutiveContext } from "./learning-context-engine";

// ── Executive Situation Engine ────────────────────────────────────────────────

export interface SituationEngineInput {
  readonly orgSlug: string;
  readonly brainInput: ExecutiveBrainV2Input;
  readonly strategicContext: StrategicExecutiveContext;
  readonly learningContext: LearningExecutiveContext;
  readonly reasoningSignals?: ReasoningSignal[];
  readonly strategicEntries?: StrategicMemoryEntry[];
  readonly patterns?: LearningPattern[];
  readonly outcomes?: LearningOutcome[];
}

export function buildExecutiveSituation(input: SituationEngineInput): ExecutiveSituation {
  const { orgSlug } = input;

  const risks = _detectRisks(input);
  const opportunities = _detectOpportunities(input);
  const conflicts = _detectSituationalConflicts(input);
  const priorities = _deriveSituationalPriorities(orgSlug, risks, opportunities, conflicts, input);
  const executiveScore = _computeSituationScore(risks, opportunities, input.strategicContext);
  const confidence = confidenceFromScore(
    input.strategicContext.strategicScore * 0.6 + (1 - input.learningContext.historicalRiskScore) * 0.4
  );

  const headline = _buildHeadline(risks, opportunities, conflicts, executiveScore);

  return {
    orgSlug,
    headline,
    risks,
    opportunities,
    conflicts,
    priorities,
    executiveScore,
    confidence,
    assessedAt: new Date().toISOString(),
  };
}

// ── Private risk detection ────────────────────────────────────────────────────

function _detectRisks(input: SituationEngineInput): ExecutiveRisk[] {
  const risks: ExecutiveRisk[] = [];
  const { orgSlug, strategicContext, learningContext, reasoningSignals, strategicEntries } = input;

  // From strategic memory critical risks
  for (const concern of strategicContext.concerns) {
    const likelihood = concern.confidenceScore;
    const impact = concern.severity === "CRITICAL" ? 0.95 : concern.severity === "HIGH" ? 0.75 : 0.5;
    const compositeRisk = Math.round((likelihood * 0.4 + impact * 0.6) * 100) / 100;

    risks.push({
      id: generateEbv2Id("risk"),
      orgSlug,
      title: concern.title,
      description: concern.description,
      domain: concern.domain,
      level: riskLevelFromScore(compositeRisk),
      confidence: concern.confidence,
      confidenceScore: concern.confidenceScore,
      likelihood,
      impact,
      compositeRisk,
      rationale: `Strategic memory risk: ${concern.title}`,
      evidenceIds: concern.evidenceIds,
      mitigationSuggestions: [],
      metadata: { source: "STRATEGIC_MEMORY" },
    });
  }

  // From strategic entries (non-active risks)
  for (const entry of (strategicEntries ?? []).filter(
    (e) => e.orgSlug === orgSlug && e.type === "RISK" && e.status === "ACTIVE"
  )) {
    if (risks.some((r) => r.title === entry.title)) continue;
    const impact = entry.priority === "CRITICAL" ? 0.9 : entry.priority === "HIGH" ? 0.7 : 0.45;
    const compositeRisk = Math.round((entry.confidenceScore * 0.4 + impact * 0.6) * 100) / 100;

    risks.push({
      id: generateEbv2Id("risk"),
      orgSlug,
      title: entry.title,
      description: entry.description,
      domain: entry.domain as typeof risks[number]["domain"],
      level: riskLevelFromScore(compositeRisk),
      confidence: confidenceFromScore(entry.confidenceScore),
      confidenceScore: entry.confidenceScore,
      likelihood: entry.confidenceScore,
      impact,
      compositeRisk,
      rationale: entry.rationale,
      evidenceIds: entry.evidenceIds,
      mitigationSuggestions: [],
      metadata: { source: "STRATEGIC_ENTRY", entryId: entry.id },
    });
  }

  // From reasoning signals (ANOMALY / THRESHOLD_BREACH)
  for (const sig of (reasoningSignals ?? []).filter(
    (s) => s.orgSlug === orgSlug && (s.type === "ANOMALY" || s.type === "THRESHOLD_BREACH")
  )) {
    const impact = sig.severity === "CRITICAL" ? 0.9 : sig.severity === "HIGH" ? 0.7 : 0.45;
    const compositeRisk = Math.round((sig.confidence * 0.4 + impact * 0.6) * 100) / 100;

    risks.push({
      id: generateEbv2Id("risk"),
      orgSlug,
      title: sig.label,
      description: sig.description,
      domain: _mapSignalDomain(sig.domain),
      level: riskLevelFromScore(compositeRisk),
      confidence: confidenceFromScore(sig.confidence),
      confidenceScore: sig.confidence,
      likelihood: sig.confidence,
      impact,
      compositeRisk,
      rationale: `Cross-module signal: ${sig.type}`,
      evidenceIds: [sig.id],
      mitigationSuggestions: [],
      metadata: { source: "REASONING_SIGNAL", signalId: sig.id },
    });
  }

  // Boost risk from historical learning
  if (learningContext.historicalRiskScore > 0.5 && risks.length === 0) {
    risks.push({
      id: generateEbv2Id("risk"),
      orgSlug,
      title: "Riesgo histórico elevado",
      description: "Los patrones de aprendizaje histórico muestran una tasa de resultados negativos por encima del umbral.",
      domain: "CROSS_DOMAIN",
      level: riskLevelFromScore(learningContext.historicalRiskScore),
      confidence: "MEDIUM",
      confidenceScore: learningContext.historicalRiskScore,
      likelihood: learningContext.historicalRiskScore,
      impact: 0.6,
      compositeRisk: Math.round((learningContext.historicalRiskScore * 0.4 + 0.6 * 0.6) * 100) / 100,
      rationale: "Derivado del aprendizaje histórico del framework",
      evidenceIds: [],
      mitigationSuggestions: ["Revisar patrones rechazados", "Ajustar confianza en recomendaciones"],
      metadata: { source: "LEARNING_FRAMEWORK" },
    });
  }

  return risks.sort((a, b) => b.compositeRisk - a.compositeRisk);
}

// ── Private opportunity detection ─────────────────────────────────────────────

function _detectOpportunities(input: SituationEngineInput): ExecutiveOpportunity[] {
  const opportunities: ExecutiveOpportunity[] = [];
  const { orgSlug, strategicEntries, learningContext, reasoningSignals } = input;

  for (const entry of (strategicEntries ?? []).filter(
    (e) => e.orgSlug === orgSlug && e.type === "OPPORTUNITY" && e.status === "ACTIVE"
  )) {
    const captureScore = Math.round((entry.confidenceScore * 0.5 + entry.strategicScore * 0.5) * 100) / 100;
    opportunities.push({
      id: generateEbv2Id("opp"),
      orgSlug,
      title: entry.title,
      description: entry.description,
      domain: entry.domain as typeof opportunities[number]["domain"],
      magnitude: opportunityMagnitudeFromScore(entry.strategicScore),
      confidence: confidenceFromScore(entry.confidenceScore),
      confidenceScore: entry.confidenceScore,
      captureScore,
      rationale: entry.rationale,
      evidenceIds: entry.evidenceIds,
      metadata: { source: "STRATEGIC_MEMORY", entryId: entry.id },
    });
  }

  // From confirmed learning patterns
  for (const pattern of learningContext.confirmedPatterns.slice(0, 3)) {
    opportunities.push({
      id: generateEbv2Id("opp"),
      orgSlug,
      title: `Patrón confirmado: ${pattern.name}`,
      description: pattern.description,
      domain: _mapLearningDomain(pattern.domain),
      magnitude: pattern.netScore >= 5 ? "LARGE" : "MEDIUM",
      confidence: confidenceFromScore(pattern.confidenceScore),
      confidenceScore: pattern.confidenceScore,
      captureScore: Math.round(pattern.confidenceScore * 0.7 * 100) / 100,
      rationale: `Patrón de aprendizaje reforzado ${pattern.reinforcementCount} veces`,
      evidenceIds: pattern.evidenceEventIds,
      metadata: { source: "LEARNING_FRAMEWORK", patternId: pattern.id },
    });
  }

  // From reasoning signals (METRIC_RISE / TREND positive)
  for (const sig of (reasoningSignals ?? []).filter(
    (s) => s.orgSlug === orgSlug && s.type === "METRIC_RISE" && s.direction === "UP"
  )) {
    opportunities.push({
      id: generateEbv2Id("opp"),
      orgSlug,
      title: `Señal positiva: ${sig.label}`,
      description: sig.description,
      domain: _mapSignalDomain(sig.domain),
      magnitude: "MEDIUM",
      confidence: confidenceFromScore(sig.confidence),
      confidenceScore: sig.confidence,
      captureScore: Math.round(sig.confidence * 0.6 * 100) / 100,
      rationale: `Señal cross-module: ${sig.type}`,
      evidenceIds: [sig.id],
      metadata: { source: "REASONING_SIGNAL", signalId: sig.id },
    });
  }

  return opportunities.sort((a, b) => b.captureScore - a.captureScore);
}

// ── Private conflict detection ────────────────────────────────────────────────

function _detectSituationalConflicts(input: SituationEngineInput): ExecutiveConflict[] {
  const conflicts: ExecutiveConflict[] = [];
  const { orgSlug, strategicContext } = input;

  const objectives = strategicContext.objectives;
  const concerns = strategicContext.concerns;

  for (const obj of objectives) {
    for (const concern of concerns) {
      if (obj.domain === concern.domain && concern.severity === "CRITICAL") {
        conflicts.push({
          id: generateEbv2Id("conflict"),
          orgSlug,
          type: "RISK_OPPORTUNITY_TENSION",
          title: `Tensión: ${obj.title} vs ${concern.title}`,
          description: `El objetivo '${obj.title}' puede verse bloqueado por el riesgo crítico '${concern.title}' en el dominio ${obj.domain}.`,
          domain: obj.domain,
          severity: "HIGH",
          confidence: "MEDIUM",
          elementAId: obj.id,
          elementATitle: obj.title,
          elementBId: concern.id,
          elementBTitle: concern.title,
          rationale: `Conflicto detectado por solapamiento de dominio y nivel de riesgo crítico`,
          metadata: { source: "SITUATION_ENGINE" },
          detectedAt: new Date().toISOString(),
        });
      }
    }
  }

  return conflicts;
}

// ── Private priority derivation ────────────────────────────────────────────────

function _deriveSituationalPriorities(
  orgSlug: string,
  risks: ExecutiveRisk[],
  opportunities: ExecutiveOpportunity[],
  conflicts: ExecutiveConflict[],
  input: SituationEngineInput
): ExecutivePriority[] {
  const priorities: ExecutivePriority[] = [];
  let rank = 1;

  for (const risk of risks.filter((r) => r.level === "CRITICAL" || r.level === "HIGH").slice(0, 3)) {
    priorities.push({
      id: generateEbv2Id("pri"),
      orgSlug,
      rank: rank++,
      title: `Mitigar: ${risk.title}`,
      description: risk.description,
      domain: risk.domain,
      level: risk.level === "CRITICAL" ? "CRITICAL" : "HIGH",
      confidence: risk.confidence,
      confidenceScore: risk.confidenceScore,
      impactScore: risk.impact,
      urgencyScore: risk.likelihood,
      strategicAlignmentScore: 0.7,
      historicalRiskScore: input.learningContext.historicalRiskScore,
      priorityScore: Math.round((risk.compositeRisk * 0.8 + 0.7 * 0.2) * 100) / 100,
      rationale: `Riesgo crítico que requiere atención inmediata`,
      evidenceIds: risk.evidenceIds,
      metadata: { source: "RISK", riskId: risk.id },
      computedAt: new Date().toISOString(),
    });
  }

  for (const opp of opportunities.filter((o) => o.magnitude === "LARGE" || o.magnitude === "TRANSFORMATIONAL").slice(0, 2)) {
    priorities.push({
      id: generateEbv2Id("pri"),
      orgSlug,
      rank: rank++,
      title: `Capturar: ${opp.title}`,
      description: opp.description,
      domain: opp.domain,
      level: "HIGH",
      confidence: opp.confidence,
      confidenceScore: opp.confidenceScore,
      impactScore: opp.captureScore,
      urgencyScore: 0.6,
      strategicAlignmentScore: 0.75,
      historicalRiskScore: 0,
      priorityScore: Math.round((opp.captureScore * 0.7 + 0.75 * 0.3) * 100) / 100,
      rationale: `Oportunidad de alta magnitud identificada`,
      evidenceIds: opp.evidenceIds,
      metadata: { source: "OPPORTUNITY", opportunityId: opp.id },
      computedAt: new Date().toISOString(),
    });
  }

  for (const conflict of conflicts.filter((c) => c.severity === "CRITICAL").slice(0, 1)) {
    priorities.push({
      id: generateEbv2Id("pri"),
      orgSlug,
      rank: rank++,
      title: `Resolver conflicto: ${conflict.title}`,
      description: conflict.description,
      domain: conflict.domain,
      level: "HIGH",
      confidence: conflict.confidence,
      confidenceScore: 0.6,
      impactScore: 0.8,
      urgencyScore: 0.7,
      strategicAlignmentScore: 0.65,
      historicalRiskScore: 0,
      priorityScore: 0.72,
      rationale: `Conflicto estratégico detectado entre ${conflict.elementATitle} y ${conflict.elementBTitle}`,
      evidenceIds: [],
      metadata: { source: "CONFLICT", conflictId: conflict.id },
      computedAt: new Date().toISOString(),
    });
  }

  return priorities;
}

// ── Private score/headline helpers ────────────────────────────────────────────

function _computeSituationScore(
  risks: ExecutiveRisk[],
  opportunities: ExecutiveOpportunity[],
  strategicContext: StrategicExecutiveContext
): number {
  const criticalRisks = risks.filter((r) => r.level === "CRITICAL").length;
  const highRisks = risks.filter((r) => r.level === "HIGH").length;
  const riskPenalty = Math.min(criticalRisks * 0.2 + highRisks * 0.1, 0.6);
  const opportunityBoost = Math.min(opportunities.length * 0.05, 0.2);
  const base = Math.max(0.3, strategicContext.strategicScore);
  return Math.round(Math.max(0, Math.min(1, base - riskPenalty + opportunityBoost)) * 100) / 100;
}

function _buildHeadline(
  risks: ExecutiveRisk[],
  opportunities: ExecutiveOpportunity[],
  conflicts: ExecutiveConflict[],
  score: number
): string {
  if (risks.some((r) => r.level === "CRITICAL")) {
    return `Situación crítica: ${risks.find((r) => r.level === "CRITICAL")?.title ?? "Riesgo crítico activo"}.`;
  }
  if (conflicts.length > 0) {
    return `Tensión estratégica detectada: ${conflicts[0].title}.`;
  }
  if (opportunities.some((o) => o.magnitude === "TRANSFORMATIONAL")) {
    return `Oportunidad transformacional identificada: ${opportunities.find((o) => o.magnitude === "TRANSFORMATIONAL")?.title}.`;
  }
  if (score >= 0.7) return "Situación ejecutiva estable con señales favorables.";
  if (score >= 0.5) return "Situación ejecutiva moderada — atención recomendada en áreas clave.";
  return "Situación ejecutiva bajo presión — acción ejecutiva requerida.";
}

// ── Domain mapping helpers ────────────────────────────────────────────────────

function _mapSignalDomain(domain: string): ExecutiveDomain {
  const map: Record<string, ExecutiveDomain> = {
    FINANCE: "FINANCE", COMMERCIAL: "COMMERCIAL", COLLECTIONS: "FINANCE",
    MARKETING: "MARKETING", EXECUTIVE: "EXECUTIVE", PLAYBOOKS: "CROSS_DOMAIN",
    MEMORY: "CROSS_DOMAIN", GRAPH: "CROSS_DOMAIN",
  };
  return map[domain] ?? "CROSS_DOMAIN";
}

function _mapLearningDomain(domain: string): ExecutiveDomain {
  const map: Record<string, ExecutiveDomain> = {
    FINANCE: "FINANCE", COMMERCIAL: "COMMERCIAL", MARKETING: "MARKETING",
    OPERATIONS: "OPERATIONS", EXECUTIVE: "EXECUTIVE", COMPLIANCE: "COMPLIANCE",
    MEMORY: "CROSS_DOMAIN", CROSS_MODULE: "CROSS_DOMAIN",
  };
  return map[domain] ?? "CROSS_DOMAIN";
}
