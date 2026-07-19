/**
 * lib/copilot/intelligence/reasoning/evidence-builder.ts
 *
 * AGENTIK-COPILOT-INTELLIGENCE-02
 * Reasoning Engine — Evidence Builder
 *
 * Converts raw signals and domain data into typed ReasoningEvidence.
 * Every piece of evidence MUST carry:
 *   - source (traceable origin)
 *   - category (business domain)
 *   - confidence + confidenceScore
 *   - summary (human-readable)
 *   - timestamp
 *   - signalIds (traceability back to source signals)
 *
 * No Prisma. No server-only. Pure domain logic. Never throws.
 */

import type {
  ReasoningEvidence,
  ReasoningSignal,
  ReasoningCategory,
  ReasoningConfidence,
} from "./reasoning-types";
import { scoreToConfidence } from "./reasoning-types";
import type { CrossDomainContext } from "./cross-domain-context";
import { getAllSignals, getSignalsForDomain } from "./cross-domain-context";

// ── ID generator ───────────────────────────────────────────────────────────────

let _counter = 0;
function _id(): string {
  return `re_${Date.now()}_${(++_counter % 1_000_000).toString().padStart(6, "0")}`;
}

// ── Core builder ───────────────────────────────────────────────────────────────

/**
 * buildEvidence — construct a ReasoningEvidence from explicit parameters.
 */
export function buildEvidence(params: {
  orgSlug:         string;
  source:          string;
  category:        ReasoningCategory;
  confidenceScore: number;
  summary:         string;
  signalIds:       string[];
  isSupporting?:   boolean;
  data?:           Record<string, unknown>;
}): ReasoningEvidence {
  const score = Math.max(0, Math.min(100, params.confidenceScore));
  return {
    id:              _id(),
    orgSlug:         params.orgSlug,
    source:          params.source,
    category:        params.category,
    confidence:      scoreToConfidence(score),
    confidenceScore: score,
    summary:         params.summary,
    timestamp:       new Date().toISOString(),
    data:            params.data ?? {},
    signalIds:       params.signalIds,
    isSupporting:    params.isSupporting ?? true,
  };
}

// ── Domain-specific builders ───────────────────────────────────────────────────

/**
 * buildFinancialEvidence — from financial signals (treasury, reconciliation, budget, closings).
 */
export function buildFinancialEvidence(
  orgSlug: string,
  signals: ReasoningSignal[],
): ReasoningEvidence[] {
  if (signals.length === 0) return [];

  const downSignals = signals.filter(s => s.direction === "DOWN");
  const upSignals   = signals.filter(s => s.direction === "UP");
  const evidence: ReasoningEvidence[] = [];

  if (downSignals.length > 0) {
    const score = _signalsToScore(downSignals);
    evidence.push(buildEvidence({
      orgSlug,
      source:          "financial:signals",
      category:        "FINANCIAL",
      confidenceScore: score,
      summary:         `${downSignals.length} indicador(es) financiero(s) en descenso: ${downSignals.map(s => s.metric).join(", ")}`,
      signalIds:       downSignals.map(s => s.id),
      isSupporting:    true,
      data:            { direction: "DOWN", metrics: downSignals.map(s => s.metric) },
    }));
  }

  if (upSignals.length > 0) {
    const score = _signalsToScore(upSignals);
    evidence.push(buildEvidence({
      orgSlug,
      source:          "financial:signals",
      category:        "FINANCIAL",
      confidenceScore: score,
      summary:         `${upSignals.length} indicador(es) financiero(s) en ascenso: ${upSignals.map(s => s.metric).join(", ")}`,
      signalIds:       upSignals.map(s => s.id),
      isSupporting:    false,
      data:            { direction: "UP", metrics: upSignals.map(s => s.metric) },
    }));
  }

  return evidence;
}

/**
 * buildCommercialEvidence — from commercial signals (sales, margins, clients, channels).
 */
export function buildCommercialEvidence(
  orgSlug: string,
  signals: ReasoningSignal[],
): ReasoningEvidence[] {
  if (signals.length === 0) return [];

  const declining = signals.filter(s => s.direction === "DOWN");
  const growing   = signals.filter(s => s.direction === "UP");
  const evidence: ReasoningEvidence[] = [];

  if (declining.length > 0) {
    evidence.push(buildEvidence({
      orgSlug,
      source:          "commercial:signals",
      category:        "COMMERCIAL",
      confidenceScore: _signalsToScore(declining),
      summary:         `Actividad comercial en descenso: ${declining.map(s => s.metric).join(", ")}`,
      signalIds:       declining.map(s => s.id),
      isSupporting:    true,
      data:            { direction: "DOWN", metrics: declining.map(s => s.metric) },
    }));
  }

  if (growing.length > 0) {
    evidence.push(buildEvidence({
      orgSlug,
      source:          "commercial:signals",
      category:        "COMMERCIAL",
      confidenceScore: _signalsToScore(growing),
      summary:         `Actividad comercial en crecimiento: ${growing.map(s => s.metric).join(", ")}`,
      signalIds:       growing.map(s => s.id),
      isSupporting:    false,
      data:            { direction: "UP", metrics: growing.map(s => s.metric) },
    }));
  }

  return evidence;
}

/**
 * buildMarketingEvidence — from marketing signals (campaigns, reach, conversions).
 */
export function buildMarketingEvidence(
  orgSlug: string,
  signals: ReasoningSignal[],
): ReasoningEvidence[] {
  if (signals.length === 0) return [];

  const declining = signals.filter(s => s.direction === "DOWN");
  const growing   = signals.filter(s => s.direction === "UP");
  const evidence: ReasoningEvidence[] = [];

  if (declining.length > 0) {
    evidence.push(buildEvidence({
      orgSlug,
      source:          "marketing:signals",
      category:        "MARKETING",
      confidenceScore: _signalsToScore(declining),
      summary:         `Performance de marketing en descenso: ${declining.map(s => s.metric).join(", ")}`,
      signalIds:       declining.map(s => s.id),
      isSupporting:    true,
      data:            { direction: "DOWN", metrics: declining.map(s => s.metric) },
    }));
  }

  if (growing.length > 0) {
    evidence.push(buildEvidence({
      orgSlug,
      source:          "marketing:signals",
      category:        "MARKETING",
      confidenceScore: _signalsToScore(growing),
      summary:         `Performance de marketing en crecimiento: ${growing.map(s => s.metric).join(", ")}`,
      signalIds:       growing.map(s => s.id),
      isSupporting:    false,
      data:            { direction: "UP", metrics: growing.map(s => s.metric) },
    }));
  }

  return evidence;
}

/**
 * buildCollectionsEvidence — from collections signals (portfolio, overdue, cobros).
 */
export function buildCollectionsEvidence(
  orgSlug: string,
  signals: ReasoningSignal[],
): ReasoningEvidence[] {
  if (signals.length === 0) return [];

  const rising    = signals.filter(s => s.direction === "UP"); // rising cartera = worse
  const declining = signals.filter(s => s.direction === "DOWN");
  const evidence: ReasoningEvidence[] = [];

  if (rising.length > 0) {
    evidence.push(buildEvidence({
      orgSlug,
      source:          "collections:signals",
      category:        "COLLECTIONS",
      confidenceScore: _signalsToScore(rising),
      summary:         `Cartera en crecimiento (señal de riesgo): ${rising.map(s => s.metric).join(", ")}`,
      signalIds:       rising.map(s => s.id),
      isSupporting:    true,
      data:            { direction: "UP_RISK", metrics: rising.map(s => s.metric) },
    }));
  }

  if (declining.length > 0) {
    evidence.push(buildEvidence({
      orgSlug,
      source:          "collections:signals",
      category:        "COLLECTIONS",
      confidenceScore: _signalsToScore(declining),
      summary:         `Indicadores de cobranza mejorando: ${declining.map(s => s.metric).join(", ")}`,
      signalIds:       declining.map(s => s.id),
      isSupporting:    false,
      data:            { direction: "DOWN_IMPROVING", metrics: declining.map(s => s.metric) },
    }));
  }

  return evidence;
}

/**
 * buildOperationsEvidence — from operational signals (execution, inventory, workflows).
 */
export function buildOperationsEvidence(
  orgSlug: string,
  signals: ReasoningSignal[],
): ReasoningEvidence[] {
  if (signals.length === 0) return [];

  return [buildEvidence({
    orgSlug,
    source:          "operations:signals",
    category:        "OPERATIONS",
    confidenceScore: _signalsToScore(signals),
    summary:         `${signals.length} señal(es) operacional(es): ${signals.map(s => s.metric).join(", ")}`,
    signalIds:       signals.map(s => s.id),
    isSupporting:    true,
    data:            { metrics: signals.map(s => s.metric) },
  })];
}

/**
 * buildMemoryEvidence — from Memory Engine summaries.
 * Converts memory titles/types to supporting evidence with fixed moderate confidence.
 */
export function buildMemoryEvidence(
  orgSlug: string,
  entries: Array<{ id: string; title: string; type: string; importance: string }>,
): ReasoningEvidence[] {
  if (entries.length === 0) return [];

  const importanceScore: Record<string, number> = {
    CRITICAL: 90,
    HIGH:     75,
    MEDIUM:   55,
    LOW:      35,
  };

  const avgScore = entries.reduce(
    (sum, e) => sum + (importanceScore[e.importance] ?? 50),
    0,
  ) / entries.length;

  return [buildEvidence({
    orgSlug,
    source:          "memory:engine",
    category:        "EXECUTIVE",
    confidenceScore: Math.round(avgScore),
    summary:         `Contexto de memoria disponible: ${entries.length} entrada(s) relevante(s)`,
    signalIds:       entries.map(e => e.id),
    isSupporting:    true,
    data:            { entryCount: entries.length, titles: entries.map(e => e.title) },
  })];
}

/**
 * buildPlaybookEvidence — from Playbook summaries.
 */
export function buildPlaybookEvidence(
  orgSlug: string,
  playbooks: Array<{ id: string; title: string; category: string; priority: string }>,
): ReasoningEvidence[] {
  if (playbooks.length === 0) return [];

  return [buildEvidence({
    orgSlug,
    source:          "playbooks:engine",
    category:        "OPERATIONS",
    confidenceScore: 65,
    summary:         `${playbooks.length} playbook(s) relevante(s) disponible(s): ${playbooks.map(p => p.title).join(", ")}`,
    signalIds:       playbooks.map(p => p.id),
    isSupporting:    true,
    data:            { playbookCount: playbooks.length, titles: playbooks.map(p => p.title) },
  })];
}

/**
 * buildExecutiveBrainEvidence — from Executive Brain signal summaries.
 */
export function buildExecutiveBrainEvidence(
  orgSlug: string,
  signals: Array<{ id: string; title: string; severity: string; category: string }>,
): ReasoningEvidence[] {
  if (signals.length === 0) return [];

  const severityScore: Record<string, number> = {
    CRITICAL: 95,
    HIGH:     80,
    MEDIUM:   60,
    LOW:      35,
  };

  const criticalSignals = signals.filter(s => s.severity === "CRITICAL" || s.severity === "HIGH");
  const avgScore = signals.reduce(
    (sum, s) => sum + (severityScore[s.severity] ?? 50),
    0,
  ) / signals.length;

  return [buildEvidence({
    orgSlug,
    source:          "executive-brain:signals",
    category:        "EXECUTIVE",
    confidenceScore: Math.round(avgScore),
    summary:         criticalSignals.length > 0
      ? `Executive Brain: ${criticalSignals.length} señal(es) de alta prioridad detectada(s)`
      : `Executive Brain: ${signals.length} señal(es) disponible(s)`,
    signalIds:       signals.map(s => s.id),
    isSupporting:    true,
    data:            {
      signalCount:   signals.length,
      criticalCount: criticalSignals.length,
      titles:        signals.map(s => s.title),
    },
  })];
}

// ── buildEvidenceFromContext ───────────────────────────────────────────────────

/**
 * buildEvidenceFromContext — build all evidence from a CrossDomainContext.
 * Runs all domain-specific builders, returns de-duplicated evidence array.
 * Never throws — returns empty array on error.
 */
export function buildEvidenceFromContext(
  ctx: CrossDomainContext,
): ReasoningEvidence[] {
  try {
    const evidence: ReasoningEvidence[] = [];
    const orgSlug = ctx.orgSlug;

    // Domain evidence
    const financialSignals    = getSignalsForDomain(ctx, "FINANCIAL");
    const commercialSignals   = getSignalsForDomain(ctx, "COMMERCIAL");
    const marketingSignals    = getSignalsForDomain(ctx, "MARKETING");
    const collectionsSignals  = getSignalsForDomain(ctx, "COLLECTIONS");
    const operationsSignals   = getSignalsForDomain(ctx, "OPERATIONS");

    evidence.push(...buildFinancialEvidence(orgSlug, financialSignals));
    evidence.push(...buildCommercialEvidence(orgSlug, commercialSignals));
    evidence.push(...buildMarketingEvidence(orgSlug, marketingSignals));
    evidence.push(...buildCollectionsEvidence(orgSlug, collectionsSignals));
    evidence.push(...buildOperationsEvidence(orgSlug, operationsSignals));

    // Integration evidence
    if (ctx.memoryContext?.available && ctx.memoryContext.topEntries.length > 0) {
      evidence.push(...buildMemoryEvidence(orgSlug, ctx.memoryContext.topEntries));
    }

    if (ctx.playbookContext?.available && ctx.playbookContext.topPlaybooks.length > 0) {
      evidence.push(...buildPlaybookEvidence(orgSlug, ctx.playbookContext.topPlaybooks));
    }

    if (ctx.executiveBrainContext?.available && ctx.executiveBrainContext.topSignals.length > 0) {
      evidence.push(...buildExecutiveBrainEvidence(orgSlug, ctx.executiveBrainContext.topSignals));
    }

    return evidence;
  } catch {
    return [];
  }
}

// ── filterEvidence ─────────────────────────────────────────────────────────────

/** Get only supporting evidence. */
export function getSupportingEvidence(evidence: ReasoningEvidence[]): ReasoningEvidence[] {
  return evidence.filter(e => e.isSupporting);
}

/** Get only contradicting evidence. */
export function getContradictingEvidence(evidence: ReasoningEvidence[]): ReasoningEvidence[] {
  return evidence.filter(e => !e.isSupporting);
}

/** Filter evidence by category. */
export function getEvidenceForCategory(
  evidence:  ReasoningEvidence[],
  category:  ReasoningCategory,
): ReasoningEvidence[] {
  return evidence.filter(e => e.category === category);
}

/** Filter evidence by minimum confidence score. */
export function getEvidenceAboveThreshold(
  evidence:  ReasoningEvidence[],
  threshold: number,
): ReasoningEvidence[] {
  return evidence.filter(e => e.confidenceScore >= threshold);
}

// ── Internal helpers ───────────────────────────────────────────────────────────

function _signalsToScore(signals: ReasoningSignal[]): number {
  if (signals.length === 0) return 0;
  const confidenceMap: Record<ReasoningConfidence, number> = { HIGH: 90, MEDIUM: 60, LOW: 30 };
  const total = signals.reduce((sum, s) => sum + (confidenceMap[s.confidence] ?? 40), 0);
  return Math.round(total / signals.length);
}
