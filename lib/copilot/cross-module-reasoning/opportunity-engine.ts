/**
 * lib/copilot/cross-module-reasoning/opportunity-engine.ts
 *
 * AGENTIK-INTELLIGENCE-CROSS-MODULE-REASONING-01
 * Opportunity Engine — Detects growth, upsell, cross-sell, recovery, efficiency opportunities.
 * Deterministic. No AI.
 */

import type {
  ReasoningSignal,
  ReasoningEvidence,
  ReasoningOpportunity,
  ReasoningHypothesis,
  OpportunityType,
} from "./cross-module-types";
import { generateCmrId } from "./cross-module-types";

// ── Opportunity templates ─────────────────────────────────────────────────────

interface OpportunityTemplate {
  type:        OpportunityType;
  title:       string;
  description: string;
  potential:   number;    // 0–1
  urgency:     "LOW" | "MEDIUM" | "HIGH";
  triggers:    { domain?: string; direction?: string; type?: string };
}

const OPPORTUNITY_TEMPLATES: OpportunityTemplate[] = [
  // Growth
  {
    type: "GROWTH",
    title: "Oportunidad de crecimiento por recuperación de demanda",
    description: "Las señales de recuperación en ventas sugieren una ventana de oportunidad para activar campañas de crecimiento.",
    potential: 0.75, urgency: "HIGH",
    triggers: { domain: "COMMERCIAL", direction: "UP" },
  },
  {
    type: "GROWTH",
    title: "Tendencia positiva en marketing aprovechable",
    description: "Las métricas de marketing muestran una tendencia positiva que puede amplificarse con mayor inversión.",
    potential: 0.65, urgency: "MEDIUM",
    triggers: { domain: "MARKETING", direction: "UP" },
  },
  // Upsell
  {
    type: "UPSELL",
    title: "Clientes activos con potencial de upsell",
    description: "Los patrones comerciales sugieren clientes activos con capacidad de compra adicional.",
    potential: 0.6, urgency: "MEDIUM",
    triggers: { domain: "COMMERCIAL", type: "BEHAVIORAL_SHIFT" },
  },
  // Cross-sell
  {
    type: "CROSS_SELL",
    title: "Oportunidad de diversificación de cartera",
    description: "Existe potencial para expandir los productos ofrecidos a clientes actuales.",
    potential: 0.55, urgency: "LOW",
    triggers: { domain: "COMMERCIAL", type: "TREND" },
  },
  // Recovery
  {
    type: "RECOVERY",
    title: "Recuperación de cartera vencida con gestión activa",
    description: "La cartera vencida actual representa una oportunidad de recuperación de liquidez con gestión dirigida.",
    potential: 0.7, urgency: "HIGH",
    triggers: { domain: "COLLECTIONS", direction: "UP" },
  },
  {
    type: "RECOVERY",
    title: "Recuperación comercial post-caída",
    description: "Tras una caída detectada, hay una ventana para recuperar clientes y ventas con acciones correctivas rápidas.",
    potential: 0.65, urgency: "HIGH",
    triggers: { domain: "COMMERCIAL", type: "METRIC_DROP" },
  },
  // Efficiency
  {
    type: "EFFICIENCY",
    title: "Optimización de ciclo de cobranza",
    description: "El ciclo de cobranza puede optimizarse para mejorar el tiempo de conversión a efectivo.",
    potential: 0.6, urgency: "MEDIUM",
    triggers: { domain: "COLLECTIONS", type: "METRIC_DROP" },
  },
  {
    type: "EFFICIENCY",
    title: "Reducción de ineficiencias operativas",
    description: "Las señales operativas indican que existen oportunidades de eficiencia que pueden liberar recursos.",
    potential: 0.55, urgency: "MEDIUM",
    triggers: { type: "ANOMALY" },
  },
  // Automation
  {
    type: "AUTOMATION",
    title: "Automatización de alertas y seguimientos",
    description: "Los patrones repetitivos detectados en señales sugieren que ciertos procesos pueden automatizarse.",
    potential: 0.5, urgency: "LOW",
    triggers: { type: "PATTERN" },
  },
];

// ── Detect opportunities ──────────────────────────────────────────────────────

export function detectOpportunities(
  orgSlug: string,
  signals: ReasoningSignal[],
  evidence: ReasoningEvidence[],
): ReasoningOpportunity[] {
  const scoped      = signals.filter(s => s.orgSlug === orgSlug);
  const evidenceIds = evidence.filter(e => e.orgSlug === orgSlug).map(e => e.id);
  const opportunities: ReasoningOpportunity[] = [];
  const seen = new Set<string>();

  for (const signal of scoped) {
    for (const template of OPPORTUNITY_TEMPLATES) {
      if (!_matchesOppTrigger(signal, template.triggers)) continue;
      if (seen.has(template.title)) continue;
      seen.add(template.title);

      opportunities.push({
        id:          generateCmrId("opp"),
        orgSlug,
        type:        template.type,
        title:       template.title,
        description: template.description,
        potential:   _adjustedPotential(template.potential, signal),
        urgency:     template.urgency,
        evidenceIds,
        metadata:    {
          triggerSignalId: signal.id,
          triggerDomain:   signal.domain,
        },
        detectedAt:  new Date().toISOString(),
      });
    }
  }

  return opportunities;
}

// ── From hypotheses ────────────────────────────────────────────────────────────

export function detectOpportunitiesFromHypotheses(
  orgSlug: string,
  hypotheses: ReasoningHypothesis[],
): ReasoningOpportunity[] {
  const opportunities: ReasoningOpportunity[] = [];
  const supported = hypotheses.filter(
    h => h.orgSlug === orgSlug && h.supported && !h.contradicted,
  );

  for (const h of supported) {
    if (h.category !== "OPPORTUNITY") continue;

    opportunities.push({
      id:          generateCmrId("opp"),
      orgSlug,
      type:        "GROWTH",
      title:       `Oportunidad detectada: ${h.title}`,
      description: h.explanation,
      potential:   h.confidence.score,
      urgency:     h.confidence.score >= 0.7 ? "HIGH" : "MEDIUM",
      evidenceIds: h.evidenceIds,
      metadata:    { sourceHypothesisId: h.id },
      detectedAt:  new Date().toISOString(),
    });
  }

  return opportunities;
}

// ── Rank opportunities ────────────────────────────────────────────────────────

export function rankOpportunities(
  opportunities: ReasoningOpportunity[],
): ReasoningOpportunity[] {
  const URGENCY_ORDER: Record<string, number> = { HIGH: 3, MEDIUM: 2, LOW: 1 };
  return [...opportunities].sort((a, b) => {
    const ua = URGENCY_ORDER[a.urgency] ?? 1;
    const ub = URGENCY_ORDER[b.urgency] ?? 1;
    if (ub !== ua) return ub - ua;
    return b.potential - a.potential;
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function _matchesOppTrigger(
  signal: ReasoningSignal,
  triggers: OpportunityTemplate["triggers"],
): boolean {
  if (triggers.domain    && signal.domain    !== triggers.domain)    return false;
  if (triggers.direction && signal.direction !== triggers.direction)  return false;
  if (triggers.type      && signal.type      !== triggers.type)      return false;
  return true;
}

function _adjustedPotential(base: number, signal: ReasoningSignal): number {
  return Math.min(base + (signal.confidence * 0.1), 1.0);
}
