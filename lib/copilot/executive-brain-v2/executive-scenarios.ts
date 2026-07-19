// AGENTIK-EXECUTIVE-BRAIN-02
// Phase 35 — Executive Scenarios
// 10 pre-defined scenario builders

import type {
  ExecutiveScenarioOutput,
  ExecutiveScenarioType,
  ExecutivePriority,
  ExecutiveNarrative,
  ExecutiveRisk,
  ExecutiveOpportunity,
  ExecutiveBriefing,
  ExecutiveAgenda,
  ExecutiveDomain,
} from "./executive-brain-types";
import { generateEbv2Id } from "./executive-brain-types";
import { buildExecutiveBriefing } from "./executive-briefing-builder";
import { buildExecutiveAgenda } from "./executive-agenda-builder";

// ── Scenario API ──────────────────────────────────────────────────────────────

export function buildScenario(
  orgSlug: string,
  scenario: ExecutiveScenarioType
): ExecutiveScenarioOutput {
  switch (scenario) {
    case "LIQUIDITY_CRISIS":        return _liquidityCrisis(orgSlug);
    case "ACCELERATED_GROWTH":      return _acceleratedGrowth(orgSlug);
    case "SALES_DROP":              return _salesDrop(orgSlug);
    case "RECEIVABLES_SURGE":       return _receivablesSurge(orgSlug);
    case "REGULATORY_RISK":         return _regulatoryRisk(orgSlug);
    case "COMMERCIAL_OPPORTUNITY":  return _commercialOpportunity(orgSlug);
    case "STRATEGIC_CONFLICT":      return _strategicConflict(orgSlug);
    case "OBJECTIVE_ACHIEVED":      return _objectiveAchieved(orgSlug);
    case "MISALIGNED_PRIORITY":     return _misalignedPriority(orgSlug);
    case "EMERGING_RISK":           return _emergingRisk(orgSlug);
  }
}

export function buildAllScenarios(orgSlug: string): ExecutiveScenarioOutput[] {
  return [
    "LIQUIDITY_CRISIS", "ACCELERATED_GROWTH", "SALES_DROP", "RECEIVABLES_SURGE",
    "REGULATORY_RISK", "COMMERCIAL_OPPORTUNITY", "STRATEGIC_CONFLICT",
    "OBJECTIVE_ACHIEVED", "MISALIGNED_PRIORITY", "EMERGING_RISK",
  ].map((s) => buildScenario(orgSlug, s as ExecutiveScenarioType));
}

// ── Scenario builders ─────────────────────────────────────────────────────────

function _liquidityCrisis(orgSlug: string): ExecutiveScenarioOutput {
  const risk = _makeRisk(orgSlug, "Crisis de liquidez activa", "FINANCE", "CRITICAL", 0.9, 0.95);
  const priority = _makePriority(orgSlug, 1, "Restaurar liquidez inmediata", "FINANCE", "CRITICAL", 0.92);
  const narrative = _makeNarrative(orgSlug, "Crisis de liquidez",
    "El principal riesgo actual es la desaceleración del flujo de caja. Esta situación aparece relacionada con un aumento sostenido de cartera vencida durante las últimas semanas y contradice el objetivo estratégico de fortalecer liquidez.",
    "FINANCE", "CRITICAL"
  );
  const opportunity = _makeOpportunity(orgSlug, "Negociación de línea de crédito emergente", "FINANCE");
  return _makeOutput(orgSlug, "LIQUIDITY_CRISIS", [priority], [narrative], [risk], [opportunity]);
}

function _acceleratedGrowth(orgSlug: string): ExecutiveScenarioOutput {
  const opp = _makeOpportunity(orgSlug, "Expansión acelerada de mercado", "COMMERCIAL");
  const priority = _makePriority(orgSlug, 1, "Capturar ventana de crecimiento", "COMMERCIAL", "HIGH", 0.8);
  const narrative = _makeNarrative(orgSlug, "Crecimiento acelerado detectado",
    "Las señales muestran una ventana de crecimiento significativa. La tasa de conversión supera los benchmarks históricos en 40% y el pipeline comercial se encuentra en máximos. Se recomienda acelerar la capacidad operativa.",
    "COMMERCIAL", "HIGH"
  );
  return _makeOutput(orgSlug, "ACCELERATED_GROWTH", [priority], [narrative], [], [opp]);
}

function _salesDrop(orgSlug: string): ExecutiveScenarioOutput {
  const risk = _makeRisk(orgSlug, "Caída sostenida de ventas", "COMMERCIAL", "HIGH", 0.8, 0.85);
  const priority = _makePriority(orgSlug, 1, "Revertir tendencia de ventas", "COMMERCIAL", "HIGH", 0.78);
  const narrative = _makeNarrative(orgSlug, "Caída de ventas detectada",
    "Las ventas han disminuido por tercer período consecutivo. Esta tendencia contradice el objetivo de crecimiento y requiere análisis inmediato de causas raíz.",
    "COMMERCIAL", "HIGH"
  );
  return _makeOutput(orgSlug, "SALES_DROP", [priority], [narrative], [risk], []);
}

function _receivablesSurge(orgSlug: string): ExecutiveScenarioOutput {
  const risk = _makeRisk(orgSlug, "Incremento de cartera vencida", "FINANCE", "HIGH", 0.85, 0.8);
  const priority = _makePriority(orgSlug, 1, "Gestión urgente de cartera", "FINANCE", "HIGH", 0.82);
  const narrative = _makeNarrative(orgSlug, "Incremento de cartera vencida",
    "La cartera vencida supera el 25% del total. Esta situación impacta directamente el flujo de caja y requiere activación inmediata de procesos de cobro.",
    "FINANCE", "HIGH"
  );
  return _makeOutput(orgSlug, "RECEIVABLES_SURGE", [priority], [narrative], [risk], []);
}

function _regulatoryRisk(orgSlug: string): ExecutiveScenarioOutput {
  const risk = _makeRisk(orgSlug, "Exposición regulatoria detectada", "COMPLIANCE", "CRITICAL", 0.9, 0.9);
  const priority = _makePriority(orgSlug, 1, "Mitigar riesgo regulatorio", "COMPLIANCE", "CRITICAL", 0.9);
  const narrative = _makeNarrative(orgSlug, "Riesgo regulatorio crítico",
    "Se han detectado hallazgos de compliance que exponen a la organización a sanciones regulatorias. Se requiere acción legal inmediata.",
    "COMPLIANCE", "CRITICAL"
  );
  return _makeOutput(orgSlug, "REGULATORY_RISK", [priority], [narrative], [risk], []);
}

function _commercialOpportunity(orgSlug: string): ExecutiveScenarioOutput {
  const opp = _makeOpportunity(orgSlug, "Oportunidad comercial estratégica identificada", "COMMERCIAL");
  const priority = _makePriority(orgSlug, 1, "Capturar oportunidad comercial", "COMMERCIAL", "HIGH", 0.75);
  const narrative = _makeNarrative(orgSlug, "Oportunidad comercial estratégica",
    "Se ha identificado un segmento de mercado sin cubrir con alta probabilidad de conversión. Los patrones históricos muestran alta efectividad en segmentos similares.",
    "COMMERCIAL", "HIGH"
  );
  return _makeOutput(orgSlug, "COMMERCIAL_OPPORTUNITY", [priority], [narrative], [], [opp]);
}

function _strategicConflict(orgSlug: string): ExecutiveScenarioOutput {
  const priority = _makePriority(orgSlug, 1, "Resolver conflicto estratégico", "EXECUTIVE", "HIGH", 0.7);
  const narrative = _makeNarrative(orgSlug, "Conflicto estratégico activo",
    "Dos objetivos críticos en el dominio financiero presentan tensión: reducir costos vs invertir en crecimiento. Se requiere decisión ejecutiva explícita.",
    "EXECUTIVE", "HIGH"
  );
  return _makeOutput(orgSlug, "STRATEGIC_CONFLICT", [priority], [narrative], [], []);
}

function _objectiveAchieved(orgSlug: string): ExecutiveScenarioOutput {
  const opp = _makeOpportunity(orgSlug, "Aprovechar momentum de objetivo cumplido", "EXECUTIVE");
  const priority = _makePriority(orgSlug, 1, "Consolidar logro y definir siguiente objetivo", "EXECUTIVE", "MEDIUM", 0.6);
  const narrative = _makeNarrative(orgSlug, "Objetivo estratégico cumplido",
    "El objetivo de reducción de costos operativos se ha cumplido al 100%. Este logro genera capacidad para reinvertir y establecer nuevas metas estratégicas.",
    "EXECUTIVE", "MEDIUM"
  );
  return _makeOutput(orgSlug, "OBJECTIVE_ACHIEVED", [priority], [narrative], [], [opp]);
}

function _misalignedPriority(orgSlug: string): ExecutiveScenarioOutput {
  const priority = _makePriority(orgSlug, 1, "Realinear prioridades estratégicas", "EXECUTIVE", "HIGH", 0.72);
  const narrative = _makeNarrative(orgSlug, "Prioridades desalineadas detectadas",
    "Las prioridades operativas actuales no están alineadas con los objetivos estratégicos declarados. Se recomienda revisión ejecutiva y reasignación de recursos.",
    "EXECUTIVE", "HIGH"
  );
  return _makeOutput(orgSlug, "MISALIGNED_PRIORITY", [priority], [narrative], [], []);
}

function _emergingRisk(orgSlug: string): ExecutiveScenarioOutput {
  const risk = _makeRisk(orgSlug, "Riesgo emergente detectado", "CROSS_DOMAIN", "HIGH", 0.6, 0.75);
  const priority = _makePriority(orgSlug, 1, "Monitorear y contener riesgo emergente", "CROSS_DOMAIN", "HIGH", 0.65);
  const narrative = _makeNarrative(orgSlug, "Riesgo emergente en fase temprana",
    "Las señales cruzadas muestran un patrón de riesgo emergente con baja probabilidad actual pero alto impacto potencial. Se recomienda monitoreo proactivo.",
    "CROSS_DOMAIN", "MEDIUM"
  );
  return _makeOutput(orgSlug, "EMERGING_RISK", [priority], [narrative], [risk], []);
}

// ── Shared helpers ────────────────────────────────────────────────────────────

function _makeOutput(
  orgSlug: string,
  scenario: ExecutiveScenarioType,
  priorities: ExecutivePriority[],
  narratives: ExecutiveNarrative[],
  risks: ExecutiveRisk[],
  opportunities: ExecutiveOpportunity[]
): ExecutiveScenarioOutput {
  const executiveScore = risks.some((r) => r.level === "CRITICAL") ? 0.3 : opportunities.length > 0 ? 0.7 : 0.55;

  const briefing = buildExecutiveBriefing({
    orgSlug,
    type: "CEO",
    priorities,
    concerns: risks.map((r) => ({
      id: r.id,
      orgSlug,
      title: r.title,
      description: r.description,
      domain: r.domain,
      severity: r.level === "CRITICAL" ? "CRITICAL" as const : r.level === "HIGH" ? "HIGH" as const : "MEDIUM" as const,
      confidence: r.confidence,
      confidenceScore: r.confidenceScore,
      riskLevel: r.level,
      evidenceIds: r.evidenceIds,
      metadata: r.metadata,
    })),
    recommendations: [],
    narratives,
    focusAreas: [],
    conflicts: [],
    themes: [],
    executiveScore,
  });

  const agenda = buildExecutiveAgenda({ orgSlug, priorities, risks, conflicts: [] });

  return { scenario, orgSlug, priorities, narratives, risks, opportunities, briefing, agenda };
}

function _makePriority(
  orgSlug: string,
  rank: number,
  title: string,
  domain: ExecutiveDomain,
  level: ExecutivePriority["level"],
  score: number
): ExecutivePriority {
  return {
    id: generateEbv2Id("pri"),
    orgSlug,
    rank,
    title,
    description: title,
    domain,
    level,
    confidence: score >= 0.8 ? "HIGH" : "MEDIUM",
    confidenceScore: score,
    impactScore: score,
    urgencyScore: score * 0.9,
    strategicAlignmentScore: 0.8,
    historicalRiskScore: 0,
    priorityScore: score,
    rationale: `Escenario: ${title}`,
    evidenceIds: [],
    metadata: { scenario: true },
    computedAt: new Date().toISOString(),
  };
}

function _makeNarrative(
  orgSlug: string,
  title: string,
  body: string,
  domain: ExecutiveDomain,
  priority: ExecutiveNarrative["priority"]
): ExecutiveNarrative {
  return {
    id: generateEbv2Id("narr"),
    orgSlug,
    title,
    body,
    summary: body.slice(0, 100),
    domain,
    priority,
    confidence: "HIGH",
    traceable: true,
    evidenceIds: [],
    metadata: { scenario: true },
    generatedAt: new Date().toISOString(),
  };
}

function _makeRisk(
  orgSlug: string,
  title: string,
  domain: ExecutiveDomain,
  level: ExecutiveRisk["level"],
  likelihood: number,
  impact: number
): ExecutiveRisk {
  const compositeRisk = Math.round((likelihood * 0.4 + impact * 0.6) * 100) / 100;
  return {
    id: generateEbv2Id("risk"),
    orgSlug,
    title,
    description: title,
    domain,
    level,
    confidence: "HIGH",
    confidenceScore: 0.85,
    likelihood,
    impact,
    compositeRisk,
    rationale: `Escenario: ${title}`,
    evidenceIds: [],
    mitigationSuggestions: [],
    metadata: { scenario: true },
  };
}

function _makeOpportunity(
  orgSlug: string,
  title: string,
  domain: ExecutiveDomain
): ExecutiveOpportunity {
  return {
    id: generateEbv2Id("opp"),
    orgSlug,
    title,
    description: title,
    domain,
    magnitude: "LARGE",
    confidence: "HIGH",
    confidenceScore: 0.75,
    captureScore: 0.7,
    rationale: `Escenario: ${title}`,
    evidenceIds: [],
    metadata: { scenario: true },
  };
}
