/**
 * lib/copilot/intelligence/reasoning/hypothesis-engine.ts
 *
 * AGENTIK-COPILOT-INTELLIGENCE-02
 * Reasoning Engine — Hypothesis Engine
 *
 * DETERMINISTIC. No AI. No randomness beyond ID generation.
 *
 * Generates business hypotheses by matching evidence to known causal patterns.
 * Every hypothesis must be traceable to its evidence.
 *
 * Pattern examples:
 *   Sales DOWN + Campaigns DOWN   → marketing_hypothesis
 *   Sales DOWN + Portfolio UP     → collections_hypothesis
 *   Cash DOWN + Payments delayed  → financial_hypothesis
 *   Revenue DOWN + Costs UP       → margin_compression_hypothesis
 *
 * No Prisma. No server-only. Pure domain logic. Never throws.
 */

import type {
  ReasoningHypothesis,
  ReasoningEvidence,
  ReasoningCategory,
  HypothesisStatus,
} from "./reasoning-types";
import { scoreToConfidence } from "./reasoning-types";

// ── ID generator ───────────────────────────────────────────────────────────────

let _counter = 0;
function _id(): string {
  return `rh_${Date.now()}_${(++_counter % 1_000_000).toString().padStart(6, "0")}`;
}

// ── Hypothesis Pattern Definitions ────────────────────────────────────────────

export interface HypothesisPattern {
  /** Unique pattern key for traceability. */
  key:               string;
  title:             string;
  description:       string;
  category:          ReasoningCategory;
  domains:           ReasoningCategory[];
  /** Evidence categories and directions that must ALL be present to trigger. */
  requiredSignals:   Array<{
    category:    ReasoningCategory;
    isSupporting: boolean;
  }>;
  /** Base confidence score for this pattern. */
  baseScore: number;
}

/**
 * HYPOTHESIS_PATTERNS — the complete set of deterministic hypothesis rules.
 * Order matters: more specific patterns first.
 */
export const HYPOTHESIS_PATTERNS: HypothesisPattern[] = [
  // ── Financial ────────────────────────────────────────────────────────────────
  {
    key:         "FINANCIAL_CRISIS",
    title:       "Crisis de caja y liquidez",
    description: "Múltiples indicadores financieros en descenso simultáneo sugieren presión de liquidez.",
    category:    "FINANCIAL",
    domains:     ["FINANCIAL"],
    requiredSignals: [
      { category: "FINANCIAL", isSupporting: true },
    ],
    baseScore: 70,
  },
  {
    key:         "COLLECTIONS_PRESSURE_ON_CASH",
    title:       "Presión de cartera sobre liquidez",
    description: "Caja en descenso combinada con cartera en crecimiento sugiere que cobros pendientes están presionando el flujo.",
    category:    "MULTI_DOMAIN",
    domains:     ["FINANCIAL", "COLLECTIONS"],
    requiredSignals: [
      { category: "FINANCIAL",   isSupporting: true },
      { category: "COLLECTIONS", isSupporting: true },
    ],
    baseScore: 80,
  },

  // ── Commercial ───────────────────────────────────────────────────────────────
  {
    key:         "MARKETING_DRIVING_SALES_DOWN",
    title:       "Caída de ventas asociada a marketing débil",
    description: "Ventas en descenso con performance de marketing también en descenso sugiere que las campañas no están generando demanda suficiente.",
    category:    "MULTI_DOMAIN",
    domains:     ["COMMERCIAL", "MARKETING"],
    requiredSignals: [
      { category: "COMMERCIAL", isSupporting: true },
      { category: "MARKETING",  isSupporting: true },
    ],
    baseScore: 75,
  },
  {
    key:         "COMMERCIAL_PRESSURE_FROM_COLLECTIONS",
    title:       "Ventas afectadas por problemas de cobranza",
    description: "Ventas en descenso con cartera en crecimiento puede indicar que clientes morosos están reduciendo nuevas compras.",
    category:    "MULTI_DOMAIN",
    domains:     ["COMMERCIAL", "COLLECTIONS"],
    requiredSignals: [
      { category: "COMMERCIAL",  isSupporting: true },
      { category: "COLLECTIONS", isSupporting: true },
    ],
    baseScore: 72,
  },
  {
    key:         "COMMERCIAL_WEAK_PIPELINE",
    title:       "Pipeline comercial débil",
    description: "Actividad comercial en descenso sin señales compensatorias en marketing u operaciones.",
    category:    "COMMERCIAL",
    domains:     ["COMMERCIAL"],
    requiredSignals: [
      { category: "COMMERCIAL", isSupporting: true },
    ],
    baseScore: 65,
  },

  // ── Marketing ────────────────────────────────────────────────────────────────
  {
    key:         "MARKETING_UNDERPERFORMANCE",
    title:       "Bajo rendimiento de marketing",
    description: "Métricas de marketing en descenso sin señales compensatorias en ventas u operaciones.",
    category:    "MARKETING",
    domains:     ["MARKETING"],
    requiredSignals: [
      { category: "MARKETING", isSupporting: true },
    ],
    baseScore: 65,
  },

  // ── Collections ──────────────────────────────────────────────────────────────
  {
    key:         "COLLECTIONS_PORTFOLIO_RISK",
    title:       "Riesgo en cartera de cobranza",
    description: "Indicadores de cartera en aumento sugieren deterioro en la capacidad de cobro.",
    category:    "COLLECTIONS",
    domains:     ["COLLECTIONS"],
    requiredSignals: [
      { category: "COLLECTIONS", isSupporting: true },
    ],
    baseScore: 70,
  },

  // ── Multi-domain ─────────────────────────────────────────────────────────────
  {
    key:         "SYSTEMIC_BUSINESS_PRESSURE",
    title:       "Presión sistémica del negocio",
    description: "Múltiples dominios presentan señales de deterioro simultáneo, lo que sugiere una causa raíz transversal.",
    category:    "MULTI_DOMAIN",
    domains:     ["FINANCIAL", "COMMERCIAL", "MARKETING", "COLLECTIONS"],
    requiredSignals: [
      { category: "FINANCIAL",   isSupporting: true },
      { category: "COMMERCIAL",  isSupporting: true },
      { category: "MARKETING",   isSupporting: true },
    ],
    baseScore: 85,
  },
  {
    key:         "OPERATIONAL_BOTTLENECK",
    title:       "Cuello de botella operacional",
    description: "Señales operacionales indican bloqueos que pueden estar afectando la ejecución del negocio.",
    category:    "OPERATIONS",
    domains:     ["OPERATIONS"],
    requiredSignals: [
      { category: "OPERATIONS", isSupporting: true },
    ],
    baseScore: 60,
  },
  {
    key:         "EXECUTIVE_ATTENTION_REQUIRED",
    title:       "Situación requiere atención ejecutiva",
    description: "Señales del Executive Brain indican que hay asuntos de alta prioridad pendientes de resolución.",
    category:    "EXECUTIVE",
    domains:     ["EXECUTIVE"],
    requiredSignals: [
      { category: "EXECUTIVE", isSupporting: true },
    ],
    baseScore: 75,
  },
];

// ── Pattern matching ───────────────────────────────────────────────────────────

/**
 * patternMatches — check if evidence set satisfies a hypothesis pattern.
 * All required signal conditions must be met.
 */
function patternMatches(
  pattern:  HypothesisPattern,
  evidence: ReasoningEvidence[],
): boolean {
  for (const req of pattern.requiredSignals) {
    const found = evidence.some(
      e => e.category === req.category && e.isSupporting === req.isSupporting,
    );
    if (!found) return false;
  }
  return true;
}

/**
 * scoreHypothesis — calculate confidence score for a hypothesis.
 * Boosts based on evidence count and quality.
 */
function scoreHypothesis(
  pattern:            HypothesisPattern,
  supportingEvidence: ReasoningEvidence[],
  allEvidence:        ReasoningEvidence[],
): number {
  let score = pattern.baseScore;

  // Boost for more supporting evidence
  if (supportingEvidence.length >= 3) score = Math.min(100, score + 10);
  if (supportingEvidence.length >= 5) score = Math.min(100, score + 5);

  // Boost for high-confidence evidence
  const highConfCount = supportingEvidence.filter(e => e.confidence === "HIGH").length;
  score = Math.min(100, score + highConfCount * 5);

  // Penalty for contradicting evidence
  const contradictingDomains = pattern.requiredSignals.map(r => r.category);
  const contradictions = allEvidence.filter(
    e => contradictingDomains.includes(e.category) && !e.isSupporting,
  );
  score = Math.max(0, score - contradictions.length * 8);

  return Math.round(score);
}

// ── generateHypotheses ────────────────────────────────────────────────────────

/**
 * generateHypotheses — produce all matching hypotheses from evidence.
 *
 * Deterministic: same evidence always produces same hypotheses.
 * Never throws.
 */
export function generateHypotheses(
  orgSlug:  string,
  evidence: ReasoningEvidence[],
): ReasoningHypothesis[] {
  if (evidence.length === 0) return [];

  const hypotheses: ReasoningHypothesis[] = [];

  for (const pattern of HYPOTHESIS_PATTERNS) {
    if (!patternMatches(pattern, evidence)) continue;

    const supportingEvidence = evidence.filter(e =>
      pattern.domains.includes(e.category) && e.isSupporting,
    );
    const contradictingEvidence = evidence.filter(e =>
      pattern.domains.includes(e.category) && !e.isSupporting,
    );

    const score  = scoreHypothesis(pattern, supportingEvidence, evidence);
    const status = _hypothesisStatus(score, contradictingEvidence.length);

    hypotheses.push({
      id:                       _id(),
      orgSlug,
      title:                    pattern.title,
      description:              pattern.description,
      category:                 pattern.category,
      status,
      supportingEvidenceIds:    supportingEvidence.map(e => e.id),
      contradictingEvidenceIds: contradictingEvidence.map(e => e.id),
      confidenceScore:          score,
      confidence:               scoreToConfidence(score),
      generatedAt:              new Date().toISOString(),
      domains:                  pattern.domains,
      patternKey:               pattern.key,
    });
  }

  return hypotheses;
}

// ── Query helpers ──────────────────────────────────────────────────────────────

/** Filter hypotheses to only SUPPORTED or WEAKENED status. */
export function getViableHypotheses(
  hypotheses: ReasoningHypothesis[],
): ReasoningHypothesis[] {
  return hypotheses.filter(
    h => h.status === "SUPPORTED" || h.status === "WEAKENED",
  );
}

/** Filter hypotheses to only REFUTED status. */
export function getRefutedHypotheses(
  hypotheses: ReasoningHypothesis[],
): ReasoningHypothesis[] {
  return hypotheses.filter(h => h.status === "REFUTED");
}

/** Get hypotheses sorted by confidence score (highest first). */
export function rankHypotheses(
  hypotheses: ReasoningHypothesis[],
): ReasoningHypothesis[] {
  return [...hypotheses].sort((a, b) => b.confidenceScore - a.confidenceScore);
}

/** Get hypotheses for a specific domain. */
export function getHypothesesForDomain(
  hypotheses: ReasoningHypothesis[],
  domain:     ReasoningCategory,
): ReasoningHypothesis[] {
  return hypotheses.filter(h => h.domains.includes(domain));
}

/** Get multi-domain hypotheses. */
export function getMultiDomainHypotheses(
  hypotheses: ReasoningHypothesis[],
): ReasoningHypothesis[] {
  return hypotheses.filter(h => h.domains.length >= 2);
}

// ── Internal helpers ───────────────────────────────────────────────────────────

function _hypothesisStatus(
  score:              number,
  contradictionCount: number,
): HypothesisStatus {
  if (score >= 75 && contradictionCount === 0) return "SUPPORTED";
  if (score >= 50 || contradictionCount > 0)  return "WEAKENED";
  if (score < 30)                              return "REFUTED";
  return "CANDIDATE";
}
