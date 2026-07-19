/**
 * lib/copilot/intelligence/reasoning/integrations/reasoning-executive-brain.ts
 *
 * AGENTIK-COPILOT-INTELLIGENCE-02
 * Reasoning Integration — Executive Brain
 *
 * Converts Executive Brain signals into reasoning signals and evidence,
 * and sends high-impact reasoning insights back to the Executive Brain layer.
 *
 * Contract:
 *   - Receives ExecutiveContext (from lib/copilot/executive-brain/executive-brain-types.ts)
 *   - Returns ReasoningSignal[] — one signal per HIGH/CRITICAL executive signal
 *   - Returns ExecutiveBrainContextSummary for CrossDomainContext
 *   - Provides buildExecutiveFeedback() to package insights for Executive Brain
 *
 * No Prisma. No DB calls. Pure adapter logic. Never throws.
 */

import type { ReasoningSignal, ReasoningCategory, ReasoningInsight, ExecutiveImpactLevel } from "../reasoning-types";
import type { ExecutiveBrainContextSummary } from "../cross-domain-context";

// ── Input contract ─────────────────────────────────────────────────────────────

export interface ExecutiveBrainIntegrationInput {
  orgSlug:  string;
  queryId:  string;
  signals:  Array<{
    id:          string;
    title:       string;
    description: string;
    category:    string;
    severity:    string;
    direction:   string;
    confidence:  number;
    source:      string;
  }>;
}

// ── Executive Brain feedback contract ─────────────────────────────────────────

export interface ExecutiveBrainFeedback {
  orgSlug:        string;
  queryId:        string;
  highImpactCount: number;
  insights:       Array<{
    id:            string;
    title:         string;
    summary:       string;
    impact:        ExecutiveImpactLevel;
    confidence:    string;
    domains:       string[];
    actionable:    boolean;
  }>;
  generatedAt:    string;
}

// ── executiveBrainToReasoningSignals ──────────────────────────────────────────

/**
 * executiveBrainToReasoningSignals — convert Executive Brain signals to reasoning signals.
 *
 * CRITICAL and HIGH severity signals generate reasoning signals.
 * These become evidence in the reasoning pipeline.
 *
 * Never throws.
 */
export function executiveBrainToReasoningSignals(
  input: ExecutiveBrainIntegrationInput,
): ReasoningSignal[] {
  try {
    const signals: ReasoningSignal[] = [];

    for (const eb of input.signals) {
      if (eb.severity !== "CRITICAL" && eb.severity !== "HIGH") continue;
      if (eb.confidence < 0.3) continue; // too low confidence to be useful

      const category = _executiveCategoryToReasoning(eb.category);

      signals.push({
        id:         `ebsig_${eb.id}`,
        orgSlug:    input.orgSlug,
        source:     `executive-brain:${eb.source}`,
        category,
        metric:     `executive_signal:${eb.category}`,
        value:      eb.title,
        direction:  _executiveDirectionToReasoning(eb.direction),
        confidence: eb.confidence >= 0.75 ? "HIGH" : eb.confidence >= 0.4 ? "MEDIUM" : "LOW",
        timestamp:  new Date().toISOString(),
        tags:       ["executive-brain", eb.category.toLowerCase(), eb.severity.toLowerCase()],
      });
    }

    return signals;
  } catch {
    return [];
  }
}

// ── executiveBrainToContextSummary ────────────────────────────────────────────

/**
 * executiveBrainToContextSummary — build a summary for CrossDomainContext.
 */
export function executiveBrainToContextSummary(
  input: ExecutiveBrainIntegrationInput,
): ExecutiveBrainContextSummary {
  const critical = input.signals.filter(s => s.severity === "CRITICAL").length;
  return {
    available:           input.signals.length > 0,
    signalCount:         input.signals.length,
    criticalSignalCount: critical,
    topSignals:          input.signals
      .filter(s => s.severity === "CRITICAL" || s.severity === "HIGH")
      .slice(0, 5)
      .map(s => ({
        id:       s.id,
        title:    s.title,
        severity: s.severity,
        category: s.category,
      })),
  };
}

// ── buildExecutiveFeedback ────────────────────────────────────────────────────

/**
 * buildExecutiveFeedback — package reasoning insights for Executive Brain consumption.
 *
 * Only sends HIGH and CRITICAL insights back to the Executive Brain.
 * This prevents signal noise — only meaningful findings escalate.
 *
 * Never throws.
 */
export function buildExecutiveFeedback(
  orgSlug:  string,
  queryId:  string,
  insights: ReasoningInsight[],
): ExecutiveBrainFeedback {
  try {
    const highImpact = insights.filter(
      i => i.executiveImpact === "HIGH" || i.executiveImpact === "CRITICAL",
    );

    return {
      orgSlug,
      queryId,
      highImpactCount: highImpact.length,
      insights:        highImpact.map(i => ({
        id:         i.id,
        title:      i.title,
        summary:    i.summary,
        impact:     i.executiveImpact,
        confidence: i.confidence,
        domains:    i.domains,
        actionable: i.actionable,
      })),
      generatedAt: new Date().toISOString(),
    };
  } catch {
    return {
      orgSlug,
      queryId,
      highImpactCount: 0,
      insights:        [],
      generatedAt:     new Date().toISOString(),
    };
  }
}

// ── Internal helpers ───────────────────────────────────────────────────────────

function _executiveCategoryToReasoning(category: string): ReasoningCategory {
  const map: Record<string, ReasoningCategory> = {
    FINANCE:     "FINANCIAL",
    COMMERCIAL:  "COMMERCIAL",
    COLLECTIONS: "COLLECTIONS",
    MARKETING:   "MARKETING",
    OPERATIONS:  "OPERATIONS",
    EXECUTIVE:   "EXECUTIVE",
    SECURITY:    "OPERATIONS",
  };
  return map[category] ?? "EXECUTIVE";
}

function _executiveDirectionToReasoning(
  direction: string,
): "UP" | "DOWN" | "STABLE" | "UNKNOWN" {
  if (direction === "IMPROVING") return "UP";
  if (direction === "DECLINING") return "DOWN";
  if (direction === "STABLE")    return "STABLE";
  return "UNKNOWN";
}
