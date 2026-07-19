/**
 * lib/copilot/cross-module-reasoning/hypothesis-engine.ts
 *
 * AGENTIK-INTELLIGENCE-CROSS-MODULE-REASONING-01
 * Hypothesis Engine
 *
 * Generates deterministic hypotheses from signal patterns.
 * Each hypothesis has evidence, confidence, origin, and explanation.
 * No AI. Fail-closed.
 */

import type {
  ReasoningSignal,
  ReasoningEvidence,
  ReasoningHypothesis,
  HypothesisCategory,
} from "./cross-module-types";
import { generateCmrId } from "./cross-module-types";
import { calculateConfidence } from "./confidence-engine";

// ── Hypothesis template ────────────────────────────────────────────────────────

interface HypothesisTemplate {
  category:    HypothesisCategory;
  title:       string;
  explanation: string;
  triggers:    {
    domain?:    string;
    severity?:  string;
    direction?: string;
    type?:      string;
  };
}

const HYPOTHESIS_TEMPLATES: HypothesisTemplate[] = [
  // Cash flow
  {
    category: "CASH_FLOW",
    title: "Reducción sostenida de liquidez",
    explanation: "Las señales financieras indican una reducción en los flujos de caja, posiblemente relacionada con una disminución en cobros o un incremento en egresos.",
    triggers: { domain: "FINANCE", direction: "DOWN" },
  },
  {
    category: "CASH_FLOW",
    title: "Presión de caja por cartera vencida",
    explanation: "El incremento de cartera vencida está reduciendo la disponibilidad de efectivo y presionando el flujo de caja operativo.",
    triggers: { domain: "COLLECTIONS", type: "METRIC_RISE" },
  },
  // Sales
  {
    category: "SALES",
    title: "Disminución de pedidos activos",
    explanation: "Las señales comerciales muestran una reducción en el volumen de pedidos, lo que puede indicar pérdida de clientes o reducción de frecuencia de compra.",
    triggers: { domain: "COMMERCIAL", direction: "DOWN" },
  },
  {
    category: "SALES",
    title: "Bajo rendimiento de campañas comerciales",
    explanation: "Las campañas de marketing no están generando el nivel esperado de conversiones, lo que impacta directamente el volumen de ventas.",
    triggers: { domain: "MARKETING", direction: "DOWN" },
  },
  {
    category: "SALES",
    title: "Incremento de ventas detectado",
    explanation: "Las señales comerciales indican un crecimiento en ventas, posiblemente relacionado con campañas activas o recuperación de clientes.",
    triggers: { domain: "COMMERCIAL", direction: "UP" },
  },
  // Collections
  {
    category: "COLLECTIONS",
    title: "Incremento de cartera vencida",
    explanation: "Existe evidencia de que la cartera vencida está aumentando, lo que indica problemas en el cobro o dificultades de pago en clientes.",
    triggers: { domain: "COLLECTIONS", direction: "UP" },
  },
  {
    category: "COLLECTIONS",
    title: "Deterioro en la recuperación de cobros",
    explanation: "Los indicadores de cobranza muestran una reducción en la efectividad de recuperación, aumentando el riesgo de incobrabilidad.",
    triggers: { domain: "COLLECTIONS", type: "METRIC_DROP" },
  },
  // Operations
  {
    category: "OPERATIONS",
    title: "Anomalía operativa detectada",
    explanation: "Se detectó una irregularidad en el comportamiento operativo que requiere investigación para descartar causas sistémicas.",
    triggers: { type: "ANOMALY" },
  },
  {
    category: "OPERATIONS",
    title: "Alerta operativa activa",
    explanation: "Una alerta operativa está activa y puede indicar un problema en procesos, sistemas o recursos que afecta la continuidad del negocio.",
    triggers: { type: "ALERT", severity: "HIGH" },
  },
  // Marketing
  {
    category: "MARKETING",
    title: "Caída en efectividad de campañas",
    explanation: "Las métricas de marketing muestran una reducción en el rendimiento de campañas activas, lo que puede afectar la generación de demanda.",
    triggers: { domain: "MARKETING", type: "METRIC_DROP" },
  },
  // Strategic
  {
    category: "STRATEGIC",
    title: "Pérdida de clientes activos",
    explanation: "Existe evidencia de una reducción en la base de clientes activos, lo que representa un riesgo estratégico para el negocio.",
    triggers: { domain: "COMMERCIAL", type: "BEHAVIORAL_SHIFT" },
  },
  {
    category: "STRATEGIC",
    title: "Riesgo estratégico identificado",
    explanation: "Las señales detectadas apuntan a un riesgo estratégico que puede afectar la posición competitiva o la viabilidad de largo plazo.",
    triggers: { severity: "CRITICAL" },
  },
  // Risk
  {
    category: "RISK",
    title: "Anomalía financiera de alto impacto",
    explanation: "Se detectó una anomalía financiera que requiere revisión inmediata para determinar su origen y alcance.",
    triggers: { domain: "FINANCE", type: "ANOMALY" },
  },
  {
    category: "RISK",
    title: "Umbral crítico superado",
    explanation: "Un indicador clave ha superado su umbral crítico, indicando un estado operativo o financiero fuera del rango aceptable.",
    triggers: { type: "THRESHOLD_BREACH", severity: "CRITICAL" },
  },
  // Opportunity
  {
    category: "OPPORTUNITY",
    title: "Oportunidad de recuperación comercial",
    explanation: "Las señales indican condiciones favorables para una recuperación comercial si se activan los mecanismos correctos.",
    triggers: { domain: "COMMERCIAL", direction: "UP" },
  },
  {
    category: "OPPORTUNITY",
    title: "Tendencia positiva identificada",
    explanation: "Se detectó una tendencia positiva que podría aprovecharse para acelerar el crecimiento.",
    triggers: { type: "TREND", direction: "UP" },
  },
];

// ── Template matching ─────────────────────────────────────────────────────────

function _matchesTemplate(
  signal: ReasoningSignal,
  template: HypothesisTemplate,
): boolean {
  const { triggers } = template;
  if (triggers.domain    && signal.domain    !== triggers.domain)    return false;
  if (triggers.direction && signal.direction !== triggers.direction)  return false;
  if (triggers.type      && signal.type      !== triggers.type)      return false;
  if (triggers.severity  && signal.severity  !== triggers.severity)  return false;
  return true;
}

// ── Generate hypotheses for a signal ─────────────────────────────────────────

export function generateHypothesesForSignal(
  orgSlug: string,
  signal: ReasoningSignal,
  evidence: ReasoningEvidence[],
): ReasoningHypothesis[] {
  const matched = HYPOTHESIS_TEMPLATES.filter(t => _matchesTemplate(signal, t));
  const signalEvidence = evidence.filter(e => e.orgSlug === orgSlug);

  return matched.map(template => {
    const confidence = calculateConfidence(signalEvidence);
    return {
      id:           generateCmrId("hyp"),
      orgSlug,
      category:     template.category,
      title:        template.title,
      explanation:  template.explanation,
      evidenceIds:  signalEvidence.map(e => e.id),
      confidence,
      supported:    confidence.score >= 0.3,
      contradicted: false,
      metadata:     {
        triggerSignalId:   signal.id,
        triggerDomain:     signal.domain,
        triggerType:       signal.type,
        triggerSeverity:   signal.severity,
      },
      generatedAt:  new Date().toISOString(),
    };
  });
}

// ── Generate hypotheses for a signal set ─────────────────────────────────────

export function generateHypotheses(
  orgSlug: string,
  signals: ReasoningSignal[],
  evidence: ReasoningEvidence[],
): ReasoningHypothesis[] {
  const scoped = signals.filter(s => s.orgSlug === orgSlug);
  const all: ReasoningHypothesis[] = [];
  const seen = new Set<string>();

  for (const signal of scoped) {
    const generated = generateHypothesesForSignal(orgSlug, signal, evidence);
    for (const h of generated) {
      // Deduplicate by title to avoid exact duplicates
      if (!seen.has(h.title)) {
        seen.add(h.title);
        all.push(h);
      }
    }
  }

  return all;
}

// ── Filter hypotheses ─────────────────────────────────────────────────────────

export function filterSupportedHypotheses(
  hypotheses: ReasoningHypothesis[],
): ReasoningHypothesis[] {
  return hypotheses.filter(h => h.supported && !h.contradicted);
}

export function filterHypothesesByCategory(
  hypotheses: ReasoningHypothesis[],
  category: HypothesisCategory,
): ReasoningHypothesis[] {
  return hypotheses.filter(h => h.category === category);
}

export function rankHypotheses(
  hypotheses: ReasoningHypothesis[],
): ReasoningHypothesis[] {
  return [...hypotheses].sort(
    (a, b) => b.confidence.score - a.confidence.score,
  );
}
