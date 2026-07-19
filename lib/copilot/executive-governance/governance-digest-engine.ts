// AGENTIK-EXECUTIVE-GOVERNANCE-01 — Phase 15: Governance Digest Engine

import type {
  GovernanceDigest,
  GovernanceDigestPeriod,
  GovernanceConfidence,
  GovernanceRecommendation,
  GovernanceViolation,
  GovernanceEscalation,
  GovernanceApproval,
} from "./executive-governance-types";
import { generateGovernanceDigestId as generateDigestId } from "./executive-governance-identity";

export interface GovernanceDigestInput {
  readonly orgSlug:            string;
  readonly sessionId:          string;
  readonly period:             GovernanceDigestPeriod;
  readonly complianceScore:    number;
  readonly violations:         GovernanceViolation[];
  readonly escalations:        GovernanceEscalation[];
  readonly approvals:          GovernanceApproval[];
  readonly recommendations:    GovernanceRecommendation[];
  readonly confidence?:        GovernanceConfidence;
  readonly highlights?:        string[];
  readonly limitations?:       string[];
}

const PERIOD_LABELS: Record<GovernanceDigestPeriod, string> = {
  DAILY:     "diario",
  WEEKLY:    "semanal",
  MONTHLY:   "mensual",
  QUARTERLY: "trimestral",
  ANNUAL:    "anual",
};

export function buildGovernanceDigest(input: GovernanceDigestInput): GovernanceDigest {
  try {
    const periodStr     = PERIOD_LABELS[input.period] ?? input.period.toLowerCase();
    const compPct       = Math.round(input.complianceScore * 100);
    const criticalCount = input.violations.filter((v) => v.severity === "CRITICAL").length;

    const headline =
      `Resumen ${periodStr} de gobernanza ejecutiva. ` +
      `Cumplimiento: ${compPct}%. ` +
      `Violaciones: ${input.violations.length}${criticalCount > 0 ? ` (${criticalCount} críticas)` : ""}. ` +
      `Escalaciones: ${input.escalations.length}.`;

    const highlights = [
      ...(input.highlights ?? []),
      ...(criticalCount > 0 ? [`${criticalCount} violación(es) crítica(s) detectada(s)`] : []),
      ...(input.escalations.filter((e) => e.isBlocking).length > 0
        ? [`${input.escalations.filter((e) => e.isBlocking).length} escalación(es) bloqueante(s)`]
        : []),
      ...(input.complianceScore >= 0.90 ? ["Cumplimiento en nivel satisfactorio"] : []),
    ].slice(0, 5);

    const topViolations = input.violations
      .filter((v) => v.severity === "CRITICAL" || v.severity === "HIGH")
      .slice(0, 3)
      .map((v) => v.title);

    const pendingApprovals = input.approvals
      .filter((a) => a.isBlocking)
      .slice(0, 3)
      .map((a) => a.title);

    const activeEscalations = input.escalations
      .slice(0, 3)
      .map((e) => e.title);

    const limitations = [
      "suggestedOnly: true — nunca reemplaza el juicio ejecutivo.",
      ...(input.limitations ?? []),
    ];

    return {
      id:                 generateDigestId(),
      orgSlug:            input.orgSlug,
      sessionId:          input.sessionId,
      period:             input.period,
      headline,
      highlights,
      complianceScore:    input.complianceScore,
      topViolations,
      pendingApprovals,
      activeEscalations,
      confidence:         input.confidence ?? "MEDIUM",
      limitations,
      createdAt:          new Date().toISOString(),
    };
  } catch {
    return buildEmptyGovernanceDigest(input.orgSlug, input.sessionId, input.period);
  }
}

export function buildEmptyGovernanceDigest(
  orgSlug: string,
  sessionId: string,
  period: GovernanceDigestPeriod
): GovernanceDigest {
  return {
    id:                 generateDigestId(),
    orgSlug,
    sessionId,
    period,
    headline:           "Resumen no disponible.",
    highlights:         [],
    complianceScore:    0,
    topViolations:      [],
    pendingApprovals:   [],
    activeEscalations:  [],
    confidence:         "LOW",
    limitations:        ["suggestedOnly: true — nunca reemplaza el juicio ejecutivo."],
    createdAt:          new Date().toISOString(),
  };
}
