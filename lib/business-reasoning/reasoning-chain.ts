/**
 * reasoning-chain.ts
 *
 * BUSINESS-REASONING-FOUNDATION-01
 * The Reasoning Chain — the most important contract in the engine.
 *
 * A ReasoningChain captures HOW Agentik arrived at a conclusion.
 * It is the complete, reconstructable path from raw data to recommendation.
 *
 * Example:
 *   Inventario = 0 (Observation)
 *     → Referencia agotada (Finding)
 *       → Maleta del vendedor Juan afectada (Insight)
 *         → 4 pedidos bloqueados (Insight)
 *           → Riesgo de perder $2.4M (Risk)
 *             → Produccion termina manana (Opportunity)
 *               → Iniciar despacho inmediato (Decision)
 *                 → Contactar al vendedor Juan (Recommendation)
 *
 * Every step links to the previous. Never black boxes.
 *
 * No Prisma. No React. No AI. Pure domain types.
 */

import type { EntityRef, ReasoningCategory, ReasoningSeverity } from "./reasoning-types";
import type { Observation } from "./observation";
import type { Finding } from "./finding";
import type { Insight } from "./insight";
import type { Risk } from "./risk";
import type { Opportunity } from "./opportunity";
import type { Decision } from "./decision";
import type { Recommendation } from "./recommendation";
import type { Evidence } from "./evidence";
import type { ReasoningConfidence } from "./reasoning-confidence";
import { nextReasoningId } from "./reasoning-types";
import { aggregateConfidence } from "./reasoning-confidence";

// -- Chain Step ------------------------------------------------------------

/** A single step in the reasoning chain. */
export interface ChainStep {
  /** Step order (1-based). */
  order: number;
  /** What kind of reasoning element this step represents. */
  type: ChainStepType;
  /** ID of the reasoning element (observation ID, finding ID, etc.). */
  elementId: string;
  /** Human-readable summary of this step. */
  summary: string;
  /** Entity involved in this step. */
  entity: EntityRef | null;
  /** Confidence at this step. */
  confidence: number;
}

export type ChainStepType =
  | "observation"
  | "finding"
  | "insight"
  | "risk"
  | "opportunity"
  | "decision"
  | "recommendation";

// -- Reasoning Chain -------------------------------------------------------

/**
 * The complete reasoning chain from data to conclusion.
 *
 * This is what makes Agentik's reasoning transparent, auditable,
 * and reproducible. Every step can be traced back to raw data.
 */
export interface ReasoningChain {
  /** Unique chain ID. */
  id: string;
  /** Human-readable title summarizing the chain's conclusion. */
  title: string;
  /** Full narrative of the reasoning (structured, not AI-generated). */
  narrative: string;
  /** Business domain category. */
  category: ReasoningCategory;
  /** Overall severity. */
  severity: ReasoningSeverity;
  /** The primary entity the chain reasons about. */
  primaryEntity: EntityRef;
  /** Ordered steps in the chain. */
  steps: ChainStep[];
  /** Raw observations that started the chain. */
  observations: Observation[];
  /** Findings derived from observations. */
  findings: Finding[];
  /** Insights derived from findings + Knowledge Graph. */
  insights: Insight[];
  /** Risks identified from insights. */
  risks: Risk[];
  /** Opportunities identified from insights. */
  opportunities: Opportunity[];
  /** Decisions suggested from risks + opportunities. */
  decisions: Decision[];
  /** Final recommendations. */
  recommendations: Recommendation[];
  /** Aggregate evidence across the chain. */
  evidence: Evidence;
  /** Aggregate confidence of the entire chain. */
  confidence: ReasoningConfidence;
  /** ISO timestamp when the chain was assembled. */
  assembledAt: string;
  /** Arbitrary metadata. */
  metadata: Record<string, unknown>;
}

// -- Builder ---------------------------------------------------------------

export function buildReasoningChain(opts: {
  title: string;
  narrative: string;
  category: ReasoningCategory;
  severity: ReasoningSeverity;
  primaryEntity: EntityRef;
  observations: Observation[];
  findings: Finding[];
  insights: Insight[];
  risks?: Risk[];
  opportunities?: Opportunity[];
  decisions?: Decision[];
  recommendations?: Recommendation[];
  evidence: Evidence;
  metadata?: Record<string, unknown>;
}): ReasoningChain {
  const steps = buildSteps(opts);
  const confidences = [
    ...opts.findings.map(f => f.confidence),
    ...opts.insights.map(i => i.confidence),
    ...(opts.risks ?? []).map(r => r.confidence),
    ...(opts.opportunities ?? []).map(o => o.confidence),
    ...(opts.decisions ?? []).map(d => d.confidence),
    ...(opts.recommendations ?? []).map(r => r.confidence),
  ];

  return {
    id: nextReasoningId("chain"),
    title: opts.title,
    narrative: opts.narrative,
    category: opts.category,
    severity: opts.severity,
    primaryEntity: opts.primaryEntity,
    steps,
    observations: opts.observations,
    findings: opts.findings,
    insights: opts.insights,
    risks: opts.risks ?? [],
    opportunities: opts.opportunities ?? [],
    decisions: opts.decisions ?? [],
    recommendations: opts.recommendations ?? [],
    evidence: opts.evidence,
    confidence: confidences.length > 0
      ? aggregateConfidence(confidences)
      : { score: 0, level: "unknown", reason: "Sin elementos de razonamiento", missingInformation: [], assumptions: [], evidenceCount: 0, dataComplete: false },
    assembledAt: new Date().toISOString(),
    metadata: opts.metadata ?? {},
  };
}

function buildSteps(opts: {
  observations: Observation[];
  findings: Finding[];
  insights: Insight[];
  risks?: Risk[];
  opportunities?: Opportunity[];
  decisions?: Decision[];
  recommendations?: Recommendation[];
}): ChainStep[] {
  const steps: ChainStep[] = [];
  let order = 0;

  for (const obs of opts.observations) {
    steps.push({
      order: ++order,
      type: "observation",
      elementId: obs.id,
      summary: `${obs.metric} = ${obs.value}`,
      entity: obs.entity,
      confidence: obs.confidence,
    });
  }

  for (const fnd of opts.findings) {
    steps.push({
      order: ++order,
      type: "finding",
      elementId: fnd.id,
      summary: fnd.title,
      entity: fnd.primaryEntity,
      confidence: fnd.confidence.score,
    });
  }

  for (const ins of opts.insights) {
    steps.push({
      order: ++order,
      type: "insight",
      elementId: ins.id,
      summary: ins.title,
      entity: ins.primaryEntity,
      confidence: ins.confidence.score,
    });
  }

  for (const risk of opts.risks ?? []) {
    steps.push({
      order: ++order,
      type: "risk",
      elementId: risk.id,
      summary: risk.title,
      entity: risk.primaryEntity,
      confidence: risk.confidence.score,
    });
  }

  for (const opp of opts.opportunities ?? []) {
    steps.push({
      order: ++order,
      type: "opportunity",
      elementId: opp.id,
      summary: opp.title,
      entity: opp.primaryEntity,
      confidence: opp.confidence.score,
    });
  }

  for (const dec of opts.decisions ?? []) {
    steps.push({
      order: ++order,
      type: "decision",
      elementId: dec.id,
      summary: dec.title,
      entity: dec.primaryEntity,
      confidence: dec.confidence.score,
    });
  }

  for (const rec of opts.recommendations ?? []) {
    steps.push({
      order: ++order,
      type: "recommendation",
      elementId: rec.id,
      summary: rec.title,
      entity: rec.primaryEntity,
      confidence: rec.confidence.score,
    });
  }

  return steps;
}
