// AGENTIK-EXECUTIVE-GOVERNANCE-01 — Phase 16: Governance Briefing Engine

import type {
  GovernanceBriefing,
  GovernanceBriefingType,
  GovernanceStatus,
  GovernanceConfidence,
  GovernanceRecommendation,
  GovernanceEscalation,
  GovernanceViolation,
  GovernanceFinding,
  GovernanceApproval,
} from "./executive-governance-types";
import { generateGovernanceBriefingId as generateBriefingId } from "./executive-governance-identity";

export interface GovernanceBriefingInput {
  readonly orgSlug:          string;
  readonly sessionId:        string;
  readonly type:             GovernanceBriefingType;
  readonly complianceStatus: GovernanceStatus;
  readonly violations:       GovernanceViolation[];
  readonly escalations:      GovernanceEscalation[];
  readonly findings:         GovernanceFinding[];
  readonly approvals:        GovernanceApproval[];
  readonly recommendations:  GovernanceRecommendation[];
  readonly confidence?:      GovernanceConfidence;
  readonly limitations?:     string[];
}

const BRIEFING_CONFIGS: Record<GovernanceBriefingType, {
  label:    string;
  maxItems: number;
}> = {
  CEO:        { label: "Informe Ejecutivo CEO",        maxItems: 5 },
  BOARD:      { label: "Informe de Junta Directiva",   maxItems: 7 },
  EXECUTIVE:  { label: "Informe Comité Ejecutivo",     maxItems: 6 },
  COMPLIANCE: { label: "Informe de Cumplimiento",      maxItems: 8 },
  RISK:       { label: "Informe de Gestión de Riesgos", maxItems: 6 },
};

const STATUS_LABELS: Record<GovernanceStatus, string> = {
  COMPLIANT:           "Cumplimiento Total",
  PARTIALLY_COMPLIANT: "Cumplimiento Parcial",
  NON_COMPLIANT:       "Incumplimiento",
  UNDER_REVIEW:        "En Revisión",
};

export function buildGovernanceBriefing(input: GovernanceBriefingInput): GovernanceBriefing {
  try {
    const config      = BRIEFING_CONFIGS[input.type];
    const statusLabel = STATUS_LABELS[input.complianceStatus] ?? input.complianceStatus;

    const title   = `${config.label} — ${statusLabel}`;
    const summary =
      `${config.label}. Estado de gobernanza: ${statusLabel}. ` +
      `Violaciones: ${input.violations.length}. ` +
      `Escalaciones: ${input.escalations.length}. ` +
      `Aprobaciones pendientes: ${input.approvals.filter((a) => a.isBlocking).length}.`;

    const keyFindings = input.findings
      .slice(0, config.maxItems)
      .map((f) => `[${f.severity}] ${f.title}`);

    const pendingApprovals = input.approvals
      .filter((a) => a.isBlocking)
      .slice(0, config.maxItems)
      .map((a) => a.title);

    const criticalViolations = input.violations
      .filter((v) => v.severity === "CRITICAL")
      .slice(0, config.maxItems)
      .map((v) => v.title);

    const activeEscalations = input.escalations
      .slice(0, config.maxItems)
      .map((e) => e.title);

    const topRecommendations = input.recommendations
      .slice(0, config.maxItems)
      .map((r) => r.title);

    const limitations = [
      "suggestedOnly: true — nunca reemplaza el juicio y la deliberación ejecutiva.",
      "Este informe es informativo y no constituye decisión ejecutiva.",
      ...(input.limitations ?? []),
    ];

    return {
      id:                  generateBriefingId(),
      orgSlug:             input.orgSlug,
      sessionId:           input.sessionId,
      type:                input.type,
      title,
      summary,
      complianceStatus:    input.complianceStatus,
      keyFindings,
      pendingApprovals,
      criticalViolations,
      activeEscalations,
      topRecommendations,
      confidence:          input.confidence ?? "MEDIUM",
      limitations,
      createdAt:           new Date().toISOString(),
    };
  } catch {
    return buildEmptyGovernanceBriefing(input.orgSlug, input.sessionId, input.type);
  }
}

export function buildEmptyGovernanceBriefing(
  orgSlug: string,
  sessionId: string,
  type: GovernanceBriefingType
): GovernanceBriefing {
  return {
    id:                  generateBriefingId(),
    orgSlug,
    sessionId,
    type,
    title:               `${BRIEFING_CONFIGS[type]?.label ?? "Informe"} — No disponible`,
    summary:             "Informe no disponible.",
    complianceStatus:    "UNDER_REVIEW",
    keyFindings:         [],
    pendingApprovals:    [],
    criticalViolations:  [],
    activeEscalations:   [],
    topRecommendations:  [],
    confidence:          "LOW",
    limitations:         ["suggestedOnly: true — nunca reemplaza el juicio y la deliberación ejecutiva."],
    createdAt:           new Date().toISOString(),
  };
}
