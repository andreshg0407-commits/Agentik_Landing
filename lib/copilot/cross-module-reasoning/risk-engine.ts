/**
 * lib/copilot/cross-module-reasoning/risk-engine.ts
 *
 * AGENTIK-INTELLIGENCE-CROSS-MODULE-REASONING-01
 * Risk Engine — Detects financial, commercial, collections, operational, strategic risks.
 * Deterministic. No AI. Fail-closed.
 */

import type {
  ReasoningSignal,
  ReasoningEvidence,
  ReasoningRisk,
  ReasoningHypothesis,
  RiskDomain,
  RiskSeverity,
} from "./cross-module-types";
import { generateCmrId } from "./cross-module-types";

// ── Risk templates ────────────────────────────────────────────────────────────

interface RiskTemplate {
  domain:      RiskDomain;
  title:       string;
  description: string;
  likelihood:  number;
  impact:      number;
  triggers:    { domain?: string; severity?: string; type?: string };
}

const RISK_TEMPLATES: RiskTemplate[] = [
  // Financial
  {
    domain: "FINANCIAL",
    title: "Riesgo de iliquidez",
    description: "La caída sostenida de caja y baja cobranza incrementan el riesgo de iliquidez operativa.",
    likelihood: 0.7, impact: 0.9,
    triggers: { domain: "FINANCE", severity: "HIGH" },
  },
  {
    domain: "FINANCIAL",
    title: "Riesgo de flujo de caja negativo",
    description: "Los egresos superan los ingresos según las señales detectadas, generando riesgo de flujo negativo.",
    likelihood: 0.6, impact: 0.85,
    triggers: { domain: "FINANCE", type: "METRIC_DROP" },
  },
  {
    domain: "FINANCIAL",
    title: "Anomalía financiera no explicada",
    description: "Se detectó una anomalía en los datos financieros que requiere investigación urgente.",
    likelihood: 0.8, impact: 0.8,
    triggers: { domain: "FINANCE", type: "ANOMALY" },
  },
  // Commercial
  {
    domain: "COMMERCIAL",
    title: "Riesgo de pérdida de clientes",
    description: "La reducción de pedidos y el cambio de comportamiento sugieren riesgo de pérdida de cartera de clientes.",
    likelihood: 0.65, impact: 0.8,
    triggers: { domain: "COMMERCIAL", type: "BEHAVIORAL_SHIFT" },
  },
  {
    domain: "COMMERCIAL",
    title: "Riesgo de contracción de ventas",
    description: "Las métricas comerciales muestran una tendencia negativa sostenida que puede convertirse en contracción estructural.",
    likelihood: 0.7, impact: 0.75,
    triggers: { domain: "COMMERCIAL", type: "METRIC_DROP" },
  },
  // Collections
  {
    domain: "COLLECTIONS",
    title: "Riesgo de incobrabilidad",
    description: "El incremento de cartera vencida eleva el riesgo de convertir deudas en incobrables.",
    likelihood: 0.75, impact: 0.85,
    triggers: { domain: "COLLECTIONS", type: "METRIC_RISE" },
  },
  {
    domain: "COLLECTIONS",
    title: "Riesgo de deterioro de cobranza",
    description: "La efectividad de cobranza está por debajo del umbral aceptable, incrementando el riesgo de impacto financiero.",
    likelihood: 0.65, impact: 0.8,
    triggers: { domain: "COLLECTIONS", type: "METRIC_DROP" },
  },
  // Operational
  {
    domain: "OPERATIONAL",
    title: "Riesgo operativo activo",
    description: "Una alerta operativa de alta severidad está activa y puede interrumpir la continuidad del negocio.",
    likelihood: 0.8, impact: 0.7,
    triggers: { type: "ALERT", severity: "HIGH" },
  },
  {
    domain: "OPERATIONAL",
    title: "Anomalía operativa no resuelta",
    description: "Una anomalía en el comportamiento operativo no ha sido resuelta y puede escalar.",
    likelihood: 0.6, impact: 0.65,
    triggers: { type: "ANOMALY" },
  },
  // Strategic
  {
    domain: "STRATEGIC",
    title: "Riesgo estratégico por presión de cartera",
    description: "La combinación de baja en ventas y alta cartera vencida genera un riesgo estratégico para la continuidad.",
    likelihood: 0.6, impact: 0.9,
    triggers: { severity: "CRITICAL" },
  },
  {
    domain: "STRATEGIC",
    title: "Riesgo de posicionamiento comercial",
    description: "La caída en campañas y ventas simultáneamente sugiere un riesgo en el posicionamiento y competitividad.",
    likelihood: 0.5, impact: 0.75,
    triggers: { domain: "MARKETING", type: "METRIC_DROP" },
  },
];

// ── Risk detection ────────────────────────────────────────────────────────────

export function detectRisks(
  orgSlug: string,
  signals: ReasoningSignal[],
  evidence: ReasoningEvidence[],
): ReasoningRisk[] {
  const scoped   = signals.filter(s => s.orgSlug === orgSlug);
  const evidenceIds = evidence.filter(e => e.orgSlug === orgSlug).map(e => e.id);
  const risks: ReasoningRisk[] = [];
  const seen = new Set<string>();

  for (const signal of scoped) {
    for (const template of RISK_TEMPLATES) {
      if (!_matchesRiskTrigger(signal, template.triggers)) continue;
      if (seen.has(template.title)) continue;
      seen.add(template.title);

      const severity = _computeRiskSeverity(
        template.likelihood,
        template.impact,
        signal.severity,
      );

      risks.push({
        id:          generateCmrId("risk"),
        orgSlug,
        domain:      template.domain,
        title:       template.title,
        description: template.description,
        severity,
        likelihood:  _adjustedLikelihood(template.likelihood, signal),
        impact:      template.impact,
        evidenceIds,
        metadata:    {
          triggerSignalId: signal.id,
          triggerDomain:   signal.domain,
        },
        detectedAt:  new Date().toISOString(),
      });
    }
  }

  return risks;
}

// ── From hypotheses ────────────────────────────────────────────────────────────

export function detectRisksFromHypotheses(
  orgSlug: string,
  hypotheses: ReasoningHypothesis[],
): ReasoningRisk[] {
  const risks: ReasoningRisk[] = [];
  const supported = hypotheses.filter(
    h => h.orgSlug === orgSlug && h.supported && !h.contradicted,
  );

  for (const h of supported) {
    if (h.category === "RISK" || h.category === "CASH_FLOW" || h.category === "COLLECTIONS") {
      const domainMap: Record<string, RiskDomain> = {
        RISK:        "STRATEGIC",
        CASH_FLOW:   "FINANCIAL",
        COLLECTIONS: "COLLECTIONS",
      };
      risks.push({
        id:          generateCmrId("risk"),
        orgSlug,
        domain:      domainMap[h.category] ?? "OPERATIONAL",
        title:       `Riesgo derivado: ${h.title}`,
        description: h.explanation,
        severity:    h.confidence.score >= 0.7 ? "HIGH" : "MEDIUM",
        likelihood:  h.confidence.score,
        impact:      0.7,
        evidenceIds: h.evidenceIds,
        metadata:    { sourceHypothesisId: h.id },
        detectedAt:  new Date().toISOString(),
      });
    }
  }

  return risks;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function _matchesRiskTrigger(
  signal: ReasoningSignal,
  triggers: RiskTemplate["triggers"],
): boolean {
  if (triggers.domain   && signal.domain   !== triggers.domain)   return false;
  if (triggers.severity && signal.severity !== triggers.severity)  return false;
  if (triggers.type     && signal.type     !== triggers.type)     return false;
  return true;
}

function _computeRiskSeverity(
  likelihood: number,
  impact: number,
  signalSeverity: string,
): RiskSeverity {
  const score = (likelihood * 0.4) + (impact * 0.6);
  if (score >= 0.8 || signalSeverity === "CRITICAL") return "CRITICAL";
  if (score >= 0.6 || signalSeverity === "HIGH")     return "HIGH";
  if (score >= 0.4)                                   return "MEDIUM";
  return "LOW";
}

function _adjustedLikelihood(base: number, signal: ReasoningSignal): number {
  const severityBoost: Record<string, number> = {
    CRITICAL: 0.15, HIGH: 0.1, MEDIUM: 0.05, LOW: 0,
  };
  return Math.min(base + (severityBoost[signal.severity] ?? 0), 1.0);
}

// ── Risk ranking ──────────────────────────────────────────────────────────────

export function rankRisks(risks: ReasoningRisk[]): ReasoningRisk[] {
  const SEVERITY_ORDER: Record<string, number> = {
    CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1,
  };
  return [...risks].sort((a, b) => {
    const sa = SEVERITY_ORDER[a.severity] ?? 0;
    const sb = SEVERITY_ORDER[b.severity] ?? 0;
    if (sb !== sa) return sb - sa;
    return (b.likelihood * b.impact) - (a.likelihood * a.impact);
  });
}
