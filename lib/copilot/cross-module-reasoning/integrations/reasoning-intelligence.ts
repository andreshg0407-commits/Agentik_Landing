/**
 * lib/copilot/cross-module-reasoning/integrations/reasoning-intelligence.ts
 *
 * AGENTIK-INTELLIGENCE-CROSS-MODULE-REASONING-01
 * Intelligence Adapter — bridges reasoning output to Copilot Intelligence layer.
 * No DB. No server-only.
 */

import type {
  ReasoningResult,
  ReasoningChain,
  ReasoningSignal,
  ReasoningEvidence,
} from "../cross-module-types";

// ── Intelligence context types ────────────────────────────────────────────────

export interface IntelligenceReasoningContext {
  orgSlug:         string;
  available:       boolean;
  domainCoverage:  string[];
  signalCount:     number;
  evidenceCount:   number;
  hypothesisCount: number;
  supportedCount:  number;
  topSignals:      IntelligenceSignalSummary[];
  topEvidence:     IntelligenceEvidenceSummary[];
  summary:         string;
  generatedAt:     string;
}

export interface IntelligenceSignalSummary {
  id:         string;
  label:      string;
  domain:     string;
  severity:   string;
  confidence: number;
}

export interface IntelligenceEvidenceSummary {
  id:          string;
  label:       string;
  domain:      string;
  type:        string;
  strength:    number;
  reliability: number;
}

// ── Build intelligence context from reasoning result ──────────────────────────

export function buildIntelligenceReasoningContext(
  result: ReasoningResult,
  maxSignals:  number = 5,
  maxEvidence: number = 5,
): IntelligenceReasoningContext {
  if (result.status === "ERROR") {
    return {
      orgSlug:         result.orgSlug,
      available:       false,
      domainCoverage:  [],
      signalCount:     0,
      evidenceCount:   0,
      hypothesisCount: 0,
      supportedCount:  0,
      topSignals:      [],
      topEvidence:     [],
      summary:         "Razonamiento no disponible.",
      generatedAt:     result.completedAt,
    };
  }

  const chain = result.chain;
  const scopedSignals   = chain.signals.filter(s => s.orgSlug === result.orgSlug);
  const scopedEvidence  = chain.evidence.filter(e => e.orgSlug === result.orgSlug);
  const hypotheses      = chain.hypotheses.filter(h => h.orgSlug === result.orgSlug);
  const supported       = hypotheses.filter(h => h.supported && !h.contradicted);
  const domains         = [...new Set(scopedSignals.map(s => s.domain))];

  const topSignals = [...scopedSignals]
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, maxSignals)
    .map(_toSignalSummary);

  const topEvidence = [...scopedEvidence]
    .sort((a, b) => (b.strength * 0.6 + b.reliability * 0.4) - (a.strength * 0.6 + a.reliability * 0.4))
    .slice(0, maxEvidence)
    .map(_toEvidenceSummary);

  const summary = _buildSummary(result, supported.length, domains);

  return {
    orgSlug:         result.orgSlug,
    available:       true,
    domainCoverage:  domains,
    signalCount:     scopedSignals.length,
    evidenceCount:   scopedEvidence.length,
    hypothesisCount: hypotheses.length,
    supportedCount:  supported.length,
    topSignals,
    topEvidence,
    summary,
    generatedAt:     result.completedAt,
  };
}

// ── Signal coverage analysis ──────────────────────────────────────────────────

export function analyzeSignalCoverage(
  signals: ReasoningSignal[],
  orgSlug: string,
): Record<string, number> {
  const coverage: Record<string, number> = {};
  for (const signal of signals.filter(s => s.orgSlug === orgSlug)) {
    coverage[signal.domain] = (coverage[signal.domain] ?? 0) + 1;
  }
  return coverage;
}

export function analyzeEvidenceCoverage(
  evidence: ReasoningEvidence[],
  orgSlug: string,
): Record<string, number> {
  const coverage: Record<string, number> = {};
  for (const ev of evidence.filter(e => e.orgSlug === orgSlug)) {
    coverage[ev.domain] = (coverage[ev.domain] ?? 0) + 1;
  }
  return coverage;
}

// ── Chain quality score ───────────────────────────────────────────────────────

export function scoreChainQuality(chain: ReasoningChain, orgSlug: string): number {
  const signals   = chain.signals.filter(s => s.orgSlug === orgSlug).length;
  const evidence  = chain.evidence.filter(e => e.orgSlug === orgSlug).length;
  const hyps      = chain.hypotheses.filter(h => h.orgSlug === orgSlug).length;
  const supported = chain.hypotheses.filter(h => h.orgSlug === orgSlug && h.supported && !h.contradicted).length;

  const signalScore  = Math.min(signals / 5, 1.0);
  const evidScore    = Math.min(evidence / 10, 1.0);
  const hypScore     = hyps > 0 ? supported / hyps : 0;

  return signalScore * 0.3 + evidScore * 0.3 + hypScore * 0.4;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function _toSignalSummary(s: ReasoningSignal): IntelligenceSignalSummary {
  return { id: s.id, label: s.label, domain: s.domain, severity: s.severity, confidence: s.confidence };
}

function _toEvidenceSummary(e: ReasoningEvidence): IntelligenceEvidenceSummary {
  return { id: e.id, label: e.label, domain: e.domain, type: e.type, strength: e.strength, reliability: e.reliability };
}

function _buildSummary(result: ReasoningResult, supported: number, domains: string[]): string {
  const domainStr = domains.length > 0 ? domains.join(", ") : "sin datos";
  return (
    `Razonamiento ${result.status.toLowerCase()} con confianza ${result.confidence.level}. ` +
    `${supported} hipótesis validadas. Dominios: ${domainStr}.`
  );
}
