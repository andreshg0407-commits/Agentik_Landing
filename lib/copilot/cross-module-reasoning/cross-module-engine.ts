/**
 * lib/copilot/cross-module-reasoning/cross-module-engine.ts
 *
 * AGENTIK-INTELLIGENCE-CROSS-MODULE-REASONING-01
 * Cross-Module Reasoning Engine — Main Orchestrator
 *
 * Pipeline:
 *   Signals → Evidence → Correlation → Hypotheses →
 *   Risk → Opportunity → Recommendations → Narrative → Result
 *
 * Multi-tenant. Fail-closed. All reasoning explainable and auditable.
 */

import type {
  ReasoningContext,
  ReasoningResult,
  ReasoningChain,
  ReasoningConclusion,
  ExecutiveScenario,
  ExecutiveScenarioType,
  ReasoningSignal,
} from "./cross-module-types";
import {
  generateCmrId,
  REASONING_DEFAULT_CONFIDENCE,
} from "./cross-module-types";
import { normalizeSignals } from "./signal-normalizer";
import { collectEvidence, buildEvidenceSet } from "./evidence-engine";
import { calculateConfidence } from "./confidence-engine";
import { generateHypotheses } from "./hypothesis-engine";
import { correlateSignals, detectPatterns } from "./correlation-engine";
import {
  detectSignalContradictions,
  detectHypothesisContradictions,
  applyContradictions,
} from "./contradiction-engine";
import { buildCausalReasoningResult } from "./causality-engine";
import { detectRisks, detectRisksFromHypotheses, rankRisks } from "./risk-engine";
import { detectOpportunities, detectOpportunitiesFromHypotheses, rankOpportunities } from "./opportunity-engine";
import {
  generateRecommendationsFromHypotheses,
  generateRecommendationsFromRisks,
  generateRecommendationsFromOpportunities,
  rankRecommendations,
} from "./recommendation-engine";
import { buildExecutiveNarrative, buildConclusion } from "./executive-narrative-builder";
import { buildReasoningChain } from "./reasoning-chain-builder";

// ── Engine options ────────────────────────────────────────────────────────────

export interface CrossModuleEngineOptions {
  maxHypotheses?:      number;
  maxRisks?:           number;
  maxOpportunities?:   number;
  maxRecommendations?: number;
  minConfidenceScore?: number;
}

const DEFAULT_OPTIONS: Required<CrossModuleEngineOptions> = {
  maxHypotheses:      10,
  maxRisks:           10,
  maxOpportunities:   10,
  maxRecommendations: 15,
  minConfidenceScore: 0.1,
};

// ── Main reasoning function ───────────────────────────────────────────────────

export function runCrossModuleReasoning(
  ctx: ReasoningContext,
  opts: CrossModuleEngineOptions = {},
): ReasoningResult {
  const start = Date.now();
  const options = { ...DEFAULT_OPTIONS, ...opts };
  const { orgSlug } = ctx;

  try {
    // 1. Normalize signals
    const signals = normalizeSignals(
      ctx.signals.map(s => ({ ...s, orgSlug })),
    );

    // 2. Collect evidence
    const rawEvidence = collectEvidence(orgSlug, signals);
    const evidenceSet = buildEvidenceSet(orgSlug, rawEvidence);
    const evidence    = evidenceSet.items;

    // 3. Correlate signals
    const _correlations = correlateSignals(orgSlug, signals);
    const _patterns     = detectPatterns(orgSlug, signals);

    // 4. Generate hypotheses
    const rawHypotheses = generateHypotheses(orgSlug, signals, evidence);

    // 5. Detect contradictions and apply
    const signalContradictions    = detectSignalContradictions(orgSlug, signals);
    const hypothesisContradictions = detectHypothesisContradictions(orgSlug, rawHypotheses);
    const allContradictions = [...signalContradictions, ...hypothesisContradictions];
    const hypotheses = applyContradictions(rawHypotheses, allContradictions)
      .slice(0, options.maxHypotheses);

    // 6. Calculate confidence
    const confidence = calculateConfidence(evidence);

    // 7. Detect risks
    const rawRisks = [
      ...detectRisks(orgSlug, signals, evidence),
      ...detectRisksFromHypotheses(orgSlug, hypotheses),
    ];
    const risks = rankRisks(_dedupById(rawRisks)).slice(0, options.maxRisks);

    // 8. Detect opportunities
    const rawOpportunities = [
      ...detectOpportunities(orgSlug, signals, evidence),
      ...detectOpportunitiesFromHypotheses(orgSlug, hypotheses),
    ];
    const opportunities = rankOpportunities(_dedupById(rawOpportunities)).slice(0, options.maxOpportunities);

    // 9. Generate recommendations
    const rawRecs = [
      ...generateRecommendationsFromHypotheses(orgSlug, hypotheses),
      ...generateRecommendationsFromRisks(orgSlug, risks),
      ...generateRecommendationsFromOpportunities(orgSlug, opportunities),
    ];
    const recommendations = rankRecommendations(_dedupByTitle(rawRecs)).slice(0, options.maxRecommendations);

    // 10. Build conclusion
    const conclusion = buildConclusion({
      orgSlug, hypotheses, evidence, risks, opportunities, recommendations, confidence,
    });

    // 11. Build narrative
    const narrative = buildExecutiveNarrative({
      orgSlug, signals, evidence, hypotheses, risks, opportunities, recommendations, confidence,
    });

    // 12. Build chain
    const chain = buildReasoningChain({
      orgSlug,
      signals,
      evidence,
      hypotheses,
      conclusions:     [conclusion],
      recommendations,
      risks,
      opportunities,
      confidence,
    });

    // 13. Determine status
    const status = _determineStatus(hypotheses, evidence, confidence.score);

    return {
      id:                  generateCmrId("res"),
      orgSlug,
      status,
      chain,
      narrative:           narrative.text,
      confidence,
      durationMs:          Date.now() - start,
      signalCount:         signals.length,
      evidenceCount:       evidence.length,
      hypothesisCount:     hypotheses.filter(h => h.supported).length,
      riskCount:           risks.length,
      opportunityCount:    opportunities.length,
      recommendationCount: recommendations.length,
      completedAt:         new Date().toISOString(),
    };

  } catch (err) {
    // Fail-closed: return degraded result on unexpected error
    return _buildErrorResult(orgSlug, Date.now() - start, err);
  }
}

// ── Executive scenarios ────────────────────────────────────────────────────────

const SCENARIO_SIGNALS: Record<ExecutiveScenarioType, Partial<ReasoningSignal>[]> = {
  CASH_DROP: [
    { type: "METRIC_DROP", domain: "FINANCE", label: "Caída de caja", severity: "HIGH", direction: "DOWN", confidence: 0.85 },
    { type: "METRIC_RISE", domain: "COLLECTIONS", label: "Incremento cartera vencida", severity: "HIGH", direction: "UP", confidence: 0.8 },
  ],
  AR_INCREASE: [
    { type: "METRIC_RISE", domain: "COLLECTIONS", label: "Cartera vencida creciente", severity: "HIGH", direction: "UP", confidence: 0.85 },
    { type: "METRIC_DROP", domain: "FINANCE", label: "Impacto en liquidez", severity: "MEDIUM", direction: "DOWN", confidence: 0.7 },
  ],
  CAMPAIGN_DROP: [
    { type: "METRIC_DROP", domain: "MARKETING", label: "Caída de efectividad de campañas", severity: "MEDIUM", direction: "DOWN", confidence: 0.8 },
    { type: "METRIC_DROP", domain: "COMMERCIAL", label: "Baja conversión de leads", severity: "MEDIUM", direction: "DOWN", confidence: 0.7 },
  ],
  ORDER_DECREASE: [
    { type: "METRIC_DROP", domain: "COMMERCIAL", label: "Reducción de pedidos", severity: "HIGH", direction: "DOWN", confidence: 0.85 },
    { type: "BEHAVIORAL_SHIFT", domain: "COMMERCIAL", label: "Cambio en comportamiento de compra", severity: "MEDIUM", confidence: 0.7 },
  ],
  CUSTOMER_LOSS: [
    { type: "BEHAVIORAL_SHIFT", domain: "COMMERCIAL", label: "Pérdida de clientes activos", severity: "HIGH", direction: "DOWN", confidence: 0.8 },
    { type: "METRIC_DROP", domain: "COMMERCIAL", label: "Caída en frecuencia de compra", severity: "HIGH", direction: "DOWN", confidence: 0.75 },
  ],
  SALES_INCREASE: [
    { type: "METRIC_RISE", domain: "COMMERCIAL", label: "Incremento de ventas", severity: "LOW", direction: "UP", confidence: 0.85 },
    { type: "TREND", domain: "COMMERCIAL", label: "Tendencia positiva comercial", severity: "LOW", direction: "UP", confidence: 0.8 },
  ],
  COMMERCIAL_RECOVERY: [
    { type: "METRIC_RISE", domain: "COMMERCIAL", label: "Recuperación de pedidos", severity: "LOW", direction: "UP", confidence: 0.8 },
    { type: "TREND", domain: "MARKETING", label: "Mejora de campañas", severity: "LOW", direction: "UP", confidence: 0.75 },
  ],
  FINANCIAL_ANOMALY: [
    { type: "ANOMALY", domain: "FINANCE", label: "Anomalía financiera detectada", severity: "CRITICAL", confidence: 0.9 },
  ],
  OPERATIONAL_ALERT: [
    { type: "ALERT", domain: "EXECUTIVE", label: "Alerta operativa crítica", severity: "HIGH", confidence: 0.85 },
    { type: "ANOMALY", domain: "EXECUTIVE", label: "Comportamiento operativo anómalo", severity: "MEDIUM", confidence: 0.7 },
  ],
  STRATEGIC_RISK: [
    { type: "THRESHOLD_BREACH", domain: "EXECUTIVE", label: "Umbral estratégico superado", severity: "CRITICAL", confidence: 0.85 },
    { type: "METRIC_DROP", domain: "COMMERCIAL", label: "Caída de participación de mercado", severity: "HIGH", direction: "DOWN", confidence: 0.75 },
  ],
};

const SCENARIO_TITLES: Record<ExecutiveScenarioType, string> = {
  CASH_DROP:            "Caída de Caja",
  AR_INCREASE:          "Incremento de Cartera Vencida",
  CAMPAIGN_DROP:        "Caída de Campañas",
  ORDER_DECREASE:       "Disminución de Pedidos",
  CUSTOMER_LOSS:        "Pérdida de Clientes",
  SALES_INCREASE:       "Incremento de Ventas",
  COMMERCIAL_RECOVERY:  "Recuperación Comercial",
  FINANCIAL_ANOMALY:    "Anomalía Financiera",
  OPERATIONAL_ALERT:    "Alerta Operativa",
  STRATEGIC_RISK:       "Riesgo Estratégico",
};

export function runExecutiveScenario(
  orgSlug: string,
  scenarioType: ExecutiveScenarioType,
): ExecutiveScenario {
  const signalTemplates = SCENARIO_SIGNALS[scenarioType] ?? [];

  const signals: ReasoningSignal[] = signalTemplates.map(tmpl => ({
    id:          generateCmrId("sig"),
    orgSlug,
    type:        tmpl.type ?? "EVENT",
    domain:      tmpl.domain ?? "EXECUTIVE",
    label:       tmpl.label ?? "Unknown signal",
    description: tmpl.label ?? "Automatically generated signal for scenario",
    direction:   tmpl.direction,
    severity:    tmpl.severity ?? "MEDIUM",
    confidence:  tmpl.confidence ?? 0.7,
    source:      `scenario-${scenarioType.toLowerCase()}`,
    metadata:    { scenario: scenarioType },
    detectedAt:  new Date().toISOString(),
  }));

  const ctx: ReasoningContext = {
    orgSlug,
    domains:     [...new Set(signals.map(s => s.domain))],
    signals,
    requestedAt: new Date().toISOString(),
  };

  const result = runCrossModuleReasoning(ctx);

  return {
    id:          generateCmrId("scn"),
    orgSlug,
    type:        scenarioType,
    title:       SCENARIO_TITLES[scenarioType],
    description: `Escenario ejecutivo: ${SCENARIO_TITLES[scenarioType]}`,
    signals,
    result,
    createdAt:   new Date().toISOString(),
  };
}

export function runAllExecutiveScenarios(orgSlug: string): ExecutiveScenario[] {
  const types: ExecutiveScenarioType[] = [
    "CASH_DROP", "AR_INCREASE", "CAMPAIGN_DROP", "ORDER_DECREASE", "CUSTOMER_LOSS",
    "SALES_INCREASE", "COMMERCIAL_RECOVERY", "FINANCIAL_ANOMALY", "OPERATIONAL_ALERT", "STRATEGIC_RISK",
  ];
  return types.map(t => runExecutiveScenario(orgSlug, t));
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function _dedupById<T extends { id: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.filter(item => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

function _dedupByTitle<T extends { title: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.filter(item => {
    if (seen.has(item.title)) return false;
    seen.add(item.title);
    return true;
  });
}

function _determineStatus(
  hypotheses: { supported: boolean; contradicted: boolean }[],
  evidence:   { id: string }[],
  confidenceScore: number,
): ReasoningResult["status"] {
  if (hypotheses.length === 0 && evidence.length === 0) return "INSUFFICIENT_EVIDENCE";
  if (confidenceScore < 0.2) return "INSUFFICIENT_EVIDENCE";
  if (hypotheses.filter(h => h.supported && !h.contradicted).length === 0) return "PARTIAL";
  if (confidenceScore >= 0.6) return "SUCCESS";
  return "PARTIAL";
}

function _buildErrorResult(orgSlug: string, durationMs: number, err: unknown): ReasoningResult {
  const emptyChain: ReasoningChain = {
    id:              generateCmrId("chn"),
    orgSlug,
    paths:           [],
    signals:         [],
    evidence:        [],
    hypotheses:      [],
    conclusions:     [],
    recommendations: [],
    risks:           [],
    opportunities:   [],
    builtAt:         new Date().toISOString(),
  };

  const emptyConclusion: ReasoningConclusion = {
    id:                generateCmrId("con"),
    orgSlug,
    summary:           "Error durante el razonamiento",
    explanation:       "Ocurrió un error inesperado durante el proceso de razonamiento.",
    confidence:        REASONING_DEFAULT_CONFIDENCE,
    hypothesisIds:     [],
    evidenceIds:       [],
    riskIds:           [],
    opportunityIds:    [],
    recommendationIds: [],
    generatedAt:       new Date().toISOString(),
  };

  emptyChain.conclusions = [emptyConclusion];

  return {
    id:                  generateCmrId("res"),
    orgSlug,
    status:              "ERROR",
    chain:               emptyChain,
    narrative:           "El proceso de razonamiento encontró un error. Por favor intente nuevamente.",
    confidence:          REASONING_DEFAULT_CONFIDENCE,
    durationMs,
    signalCount:         0,
    evidenceCount:       0,
    hypothesisCount:     0,
    riskCount:           0,
    opportunityCount:    0,
    recommendationCount: 0,
    completedAt:         new Date().toISOString(),
  };
}
