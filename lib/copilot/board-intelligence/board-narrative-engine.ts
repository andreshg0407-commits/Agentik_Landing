// AGENTIK-BOARD-INTELLIGENCE-01 — Phase 12: Board Narrative Engine

import type {
  BoardNarrative,
  BoardGovernanceAssessment,
  BoardStrategicAssessment,
  BoardRisk,
  BoardOpportunity,
  BoardResolution,
  BoardPriority,
} from "./board-intelligence-types";

// ── Builder ─────────────────────────────────────────────────────────────────

export interface NarrativeInput {
  readonly orgSlug:    string;
  readonly sessionId:  string;
  readonly topic:      string;
  readonly governance: BoardGovernanceAssessment;
  readonly strategic:  BoardStrategicAssessment;
  readonly topRisks:           BoardRisk[];
  readonly topOpportunities:   BoardOpportunity[];
  readonly topPriorities:      BoardPriority[];
  readonly resolution:         BoardResolution | null;
  readonly limitations?:       string[];
}

export function buildBoardNarrative(input: NarrativeInput): BoardNarrative {
  try {
    const executive  = buildExecutiveNarrative(input);
    const governance = buildGovernanceNarrative(input.governance);
    const strategic  = buildStrategicNarrative(input.strategic, input.topPriorities);
    const risk       = buildRiskNarrative(input.topRisks);
    const opportunity = buildOpportunityNarrative(input.topOpportunities);
    const resolution = buildResolutionNarrative(input.resolution);
    const limitations = input.limitations ?? ["Narrativa generada con datos disponibles en el período de análisis"];

    return {
      orgSlug:    input.orgSlug,
      sessionId:  input.sessionId,
      executive,
      governance,
      strategic,
      risk,
      opportunity,
      resolution,
      limitations,
      generatedAt: new Date().toISOString(),
    };
  } catch {
    return buildEmptyBoardNarrative(input.orgSlug, input.sessionId);
  }
}

export function buildEmptyBoardNarrative(orgSlug: string, sessionId: string): BoardNarrative {
  return {
    orgSlug,
    sessionId,
    executive:   "Datos insuficientes para generar resumen ejecutivo.",
    governance:  "Datos insuficientes para evaluación de gobierno.",
    strategic:   "Datos insuficientes para narrativa estratégica.",
    risk:        "Datos insuficientes para narrativa de riesgos.",
    opportunity: "Datos insuficientes para narrativa de oportunidades.",
    resolution:  "Sin resolución disponible.",
    limitations: ["Datos insuficientes para generación de narrativa completa"],
    generatedAt: new Date().toISOString(),
  };
}

// ── Narrative builders ──────────────────────────────────────────────────────

function buildExecutiveNarrative(input: NarrativeInput): string {
  try {
    const govStatus    = input.governance.status;
    const stratScore   = Math.round(input.strategic.strategicScore * 100);
    const criticalRisks = input.topRisks.filter((r) => r.severity === "CRITICAL").length;
    const criticalPrios = input.topPriorities.filter((p) => p.level === "CRITICAL").length;

    let narrative = `Análisis estratégico para: ${input.topic}. `;
    narrative += `Estado de gobierno: ${govStatusLabel(govStatus)}. `;
    narrative += `Alineación estratégica: ${stratScore}%. `;

    if (criticalRisks > 0) {
      narrative += `Se identificaron ${criticalRisks} riesgo(s) crítico(s) que requieren atención inmediata. `;
    }
    if (criticalPrios > 0) {
      narrative += `${criticalPrios} prioridad(es) crítica(s) pendientes de resolución. `;
    }
    if (input.resolution) {
      narrative += `Resolución sugerida: ${outcomeLabel(input.resolution.outcome)}.`;
    }
    return narrative.trim();
  } catch {
    return "Error al generar resumen ejecutivo.";
  }
}

function buildGovernanceNarrative(g: BoardGovernanceAssessment): string {
  try {
    const score = Math.round(g.governanceScore * 100);
    let n = `Gobierno corporativo en estado ${govStatusLabel(g.status)} (${score}/100). `;
    if (g.strengths.length > 0) n += `Fortalezas: ${g.strengths.slice(0, 2).join("; ")}. `;
    if (g.concerns.length > 0) n += `Áreas de atención: ${g.concerns.slice(0, 2).join("; ")}.`;
    return n.trim();
  } catch {
    return "Sin evaluación de gobierno disponible.";
  }
}

function buildStrategicNarrative(s: BoardStrategicAssessment, priorities: BoardPriority[]): string {
  try {
    const alignment   = Math.round(s.alignmentScore * 100);
    const readiness   = Math.round(s.executionReadiness * 100);
    const topPriority = priorities[0];

    let n = `Alineación estratégica ${alignment}%, preparación de ejecución ${readiness}%. `;
    n += `Cobertura de horizonte: ${horizonLabel(s.horizonCoverage)}. `;
    if (topPriority) {
      n += `Prioridad principal: "${topPriority.title}".`;
    }
    if (s.gaps.length > 0) {
      n += ` Brechas identificadas: ${s.gaps.slice(0, 2).join("; ")}.`;
    }
    return n.trim();
  } catch {
    return "Sin evaluación estratégica disponible.";
  }
}

function buildRiskNarrative(risks: BoardRisk[]): string {
  try {
    if (risks.length === 0) return "Sin riesgos de alto impacto identificados en el período.";
    const critical = risks.filter((r) => r.severity === "CRITICAL");
    const systemic = risks.filter((r) => r.isSystemic);
    let n = `${risks.length} riesgo(s) identificados`;
    if (critical.length > 0) n += `, ${critical.length} crítico(s)`;
    if (systemic.length > 0) n += `, ${systemic.length} sistémico(s)`;
    n += ". ";
    if (risks[0]) n += `Riesgo principal: "${risks[0].title}" (composito: ${Math.round(risks[0].compositeRisk * 100)}%).`;
    return n.trim();
  } catch {
    return "Sin narrativa de riesgos disponible.";
  }
}

function buildOpportunityNarrative(opps: BoardOpportunity[]): string {
  try {
    if (opps.length === 0) return "Sin oportunidades estratégicas identificadas en el período.";
    const transformational = opps.filter((o) => o.magnitude === "TRANSFORMATIONAL");
    const immediate = opps.filter((o) => o.timeHorizon === "IMMEDIATE");
    let n = `${opps.length} oportunidad(es) identificadas`;
    if (transformational.length > 0) n += `, ${transformational.length} transformacional(es)`;
    if (immediate.length > 0) n += `, ${immediate.length} inmediata(s)`;
    n += ". ";
    if (opps[0]) n += `Oportunidad principal: "${opps[0].title}".`;
    return n.trim();
  } catch {
    return "Sin narrativa de oportunidades disponible.";
  }
}

function buildResolutionNarrative(resolution: BoardResolution | null): string {
  try {
    if (!resolution) return "Sin resolución generada para este período de análisis.";
    let n = `Resolución sugerida: ${outcomeLabel(resolution.outcome)}. `;
    n += resolution.summary;
    if (resolution.conditions.length > 0) {
      n += ` Condiciones: ${resolution.conditions.slice(0, 2).join("; ")}.`;
    }
    return n.trim();
  } catch {
    return "Sin resolución disponible.";
  }
}

// ── Label helpers ───────────────────────────────────────────────────────────

function govStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    STRONG:   "Sólido",
    ADEQUATE: "Adecuado",
    WEAK:     "Débil",
    CRITICAL: "Crítico",
  };
  return labels[status] ?? status;
}

function horizonLabel(h: string): string {
  const labels: Record<string, string> = {
    SHORT:         "Corto plazo",
    MEDIUM:        "Mediano plazo",
    LONG:          "Largo plazo",
    MULTI_HORIZON: "Multi-horizonte",
  };
  return labels[h] ?? h;
}

function outcomeLabel(outcome: string): string {
  const labels: Record<string, string> = {
    APPROVE:                 "Aprobado",
    APPROVE_WITH_CONDITIONS: "Aprobado con condiciones",
    REVIEW_REQUIRED:         "Requiere revisión",
    ESCALATE:                "Requiere escalación",
    REJECT:                  "Rechazado",
  };
  return labels[outcome] ?? outcome;
}
