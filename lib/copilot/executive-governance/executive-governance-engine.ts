// AGENTIK-EXECUTIVE-GOVERNANCE-01 — Phase 17: Executive Governance Engine (Main Pipeline)
// Never executes. Never approves automatically. Evaluator/supervisor only.

import type {
  ExecutiveGovernanceInput,
  ExecutiveGovernanceResult,
  GovernanceReport,
  GovernanceScore,
  GovernanceStatus,
  GovernanceConfidence,
  GovernanceDomain,
  GovernancePolicy,
  GovernanceRule,
  GovernanceViolation,
  GovernanceEscalation,
  GovernanceException,
  GovernanceApproval,
  GovernanceRisk,
  GovernanceControl,
  GovernanceFinding,
  GovernanceRecommendation,
  GovernanceAssessment,
  GovernanceNarrative,
  GovernanceDigest,
  GovernanceBriefing,
} from "./executive-governance-types";
import { generateGovernanceReportId } from "./executive-governance-identity";
import { buildDefaultPolicies } from "./policy-engine";
import { buildDefaultAuthorityModels } from "./authority-engine";
import { buildDefaultControls } from "./governance-control-engine";
import { buildAssessment } from "./governance-assessment-engine";
import { buildGovernanceNarrative, buildEmptyGovernanceNarrative } from "./governance-narrative-engine";
import { buildGovernanceDigest } from "./governance-digest-engine";
import { buildGovernanceBriefing } from "./governance-briefing-engine";
import {
  rankGovernanceRecommendations,
  buildRecommendationsFromViolations,
  buildRecommendationsFromExceptions,
  buildRecommendationsFromEscalations,
  buildRecommendationsFromRisks,
} from "./governance-recommendation-engine";

export interface ExecutiveGovernanceContext {
  readonly policies?:      GovernancePolicy[];
  readonly rules?:         GovernanceRule[];
  readonly violations?:    GovernanceViolation[];
  readonly escalations?:   GovernanceEscalation[];
  readonly exceptions?:    GovernanceException[];
  readonly approvals?:     GovernanceApproval[];
  readonly risks?:         GovernanceRisk[];
  readonly controls?:      GovernanceControl[];
  readonly findings?:      GovernanceFinding[];
}

export function computeGovernanceScore(
  orgSlug: string,
  complianceScore: number,
  riskScore: number,
  policyScore: number,
  controlScore: number,
  violationPenalty: number,
  exceptionPenalty: number,
  confidence: GovernanceConfidence
): GovernanceScore {
  try {
    const governanceScore = Math.max(
      0,
      complianceScore * 0.35 +
      (1 - riskScore) * 0.25 +
      policyScore * 0.20 +
      controlScore * 0.20 -
      violationPenalty -
      exceptionPenalty
    );
    const overallScore = Math.min(1, Math.max(0, governanceScore));
    return {
      orgSlug,
      overallScore,
      complianceScore,
      governanceScore,
      riskScore,
      policyScore,
      controlScore,
      violationPenalty,
      exceptionPenalty,
      confidence,
    };
  } catch {
    return buildEmptyScore(orgSlug);
  }
}

export function runExecutiveGovernance(
  input: ExecutiveGovernanceInput,
  ctx: ExecutiveGovernanceContext = {}
): ExecutiveGovernanceResult {
  const errors: string[] = [];

  try {
    const { orgSlug, sessionId } = input;

    // Step 1 — Resolve policies
    const policies = ctx.policies ?? buildDefaultPolicies(orgSlug);

    // Step 2 — Resolve rules
    const rules = ctx.rules ?? [];

    // Step 3 — Resolve violations
    const violations = ctx.violations ?? [];

    // Step 4 — Resolve exceptions
    const exceptions = ctx.exceptions ?? [];

    // Step 5 — Resolve escalations
    const escalations = ctx.escalations ?? [];

    // Step 6 — Resolve approvals
    const approvals = ctx.approvals ?? [];

    // Step 7 — Resolve risks
    const risks = ctx.risks ?? [];

    // Step 8 — Resolve controls
    const controls = ctx.controls ?? buildDefaultControls(orgSlug, sessionId);

    // Step 9 — Compute domain scores
    const activePolicies   = policies.filter((p) => p.isActive);
    const criticalViolations = violations.filter((v) => v.severity === "CRITICAL").length;
    const criticalExceptions = exceptions.filter((e) => e.severity === "CRITICAL").length;
    const criticalEscalations = escalations.filter((e) => e.severity === "CRITICAL").length;

    const complianceScore = Math.max(
      0,
      1 - criticalViolations * 0.15 - violations.length * 0.05
    );
    const riskScore = Math.min(
      1,
      risks.reduce((s, r) => s + r.riskScore, 0) / Math.max(1, risks.length) +
      criticalEscalations * 0.05
    );
    const policyScore = activePolicies.length > 0
      ? activePolicies.filter((p) => p.isMandatory).length / activePolicies.length
      : 0.5;
    const controlScore = controls.length > 0
      ? controls.reduce((s, c) => s + c.effectiveness, 0) / controls.length
      : 0.5;
    const violationPenalty = Math.min(0.30, criticalViolations * 0.10 + violations.length * 0.02);
    const exceptionPenalty = Math.min(0.15, criticalExceptions * 0.05 + exceptions.length * 0.02);

    // Step 10 — Assess confidence
    const confidence: GovernanceConfidence =
      (criticalViolations + criticalEscalations) > 2 ? "LOW"
      : violations.length > 5 ? "MEDIUM"
      : policies.length > 0 ? "HIGH"
      : "MEDIUM";

    // Step 11 — Build score
    const score = computeGovernanceScore(
      orgSlug,
      complianceScore,
      riskScore,
      policyScore,
      controlScore,
      violationPenalty,
      exceptionPenalty,
      confidence
    );

    // Step 12 — Determine status
    const status: GovernanceStatus =
      criticalViolations > 0 || criticalEscalations > 2 ? "NON_COMPLIANT"
      : violations.length > 0 || exceptions.length > 0 ? "PARTIALLY_COMPLIANT"
      : "COMPLIANT";

    // Step 13 — Build assessment
    const assessment = buildAssessment({
      orgSlug,
      sessionId,
      complianceScore,
      governanceScore: score.governanceScore,
      riskScore,
      findings:        ctx.findings?.map((f) => ({
        title:       f.title,
        description: f.description,
        domain:      f.domain,
        severity:    f.severity,
        policyId:    f.policyId,
        ruleId:      f.ruleId,
        evidence:    f.evidence,
      })) ?? [],
      violations,
      exceptionCount:  exceptions.length,
      escalationCount: escalations.length,
    });

    // Step 14 — Build recommendations
    const rawRecs: GovernanceRecommendation[] = [
      ...buildRecommendationsFromViolations(orgSlug, sessionId, violations),
      ...buildRecommendationsFromExceptions(orgSlug, sessionId, exceptions),
      ...buildRecommendationsFromEscalations(orgSlug, sessionId, escalations),
      ...buildRecommendationsFromRisks(orgSlug, sessionId, risks),
    ];
    const recommendations = rankGovernanceRecommendations(rawRecs).slice(0, 10);

    // Step 15 — Build narrative
    const topDomain: GovernanceDomain | undefined =
      violations.length > 0 ? violations[0]?.domain : undefined;
    const narrative: GovernanceNarrative = buildGovernanceNarrative({
      status,
      complianceScore,
      riskScore,
      policyCount:     activePolicies.length,
      violationCount:  violations.length,
      criticalCount:   criticalViolations + criticalExceptions + criticalEscalations,
      escalationCount: escalations.length,
      exceptionCount:  exceptions.length,
      findingCount:    assessment.findingCount,
      controlCount:    controls.length,
    });

    // Step 16 — Build digest
    const digest: GovernanceDigest | null = (() => {
      try {
        return buildGovernanceDigest({
          orgSlug,
          sessionId,
          period:          "DAILY",
          complianceScore,
          violations,
          escalations,
          approvals,
          recommendations,
          confidence,
        });
      } catch {
        return null;
      }
    })();

    // Step 17 — Build briefing
    const briefing: GovernanceBriefing | null = (() => {
      try {
        return buildGovernanceBriefing({
          orgSlug,
          sessionId,
          type:              "EXECUTIVE",
          complianceStatus:  status,
          violations,
          escalations,
          findings:          assessment.findings,
          approvals,
          recommendations,
          confidence,
        });
      } catch {
        return null;
      }
    })();

    const limitations = [
      "suggestedOnly: true — nunca ejecuta, nunca aprueba automáticamente.",
      "neverApproves: true — el sistema no aprueba decisiones de forma autónoma.",
      "Este resultado requiere revisión y decisión humana.",
      "Análisis basado en datos del período evaluado.",
    ];

    // Build report
    const report: GovernanceReport = {
      id:              generateGovernanceReportId(),
      orgSlug,
      sessionId,
      title:           `Reporte de Gobernanza Ejecutiva — ${status}`,
      status,
      policies,
      rules,
      approvals,
      exceptions,
      escalations,
      violations,
      risks,
      controls,
      assessment,
      recommendations,
      score,
      narrative,
      digest,
      briefing,
      limitations,
      createdAt:       new Date().toISOString(),
    };

    return {
      orgSlug,
      sessionId,
      report,
      score,
      status:     errors.length > 0 ? "PARTIAL" : "SUCCESS",
      limitations,
      errors,
      createdAt:  new Date().toISOString(),
    };
  } catch (err) {
    errors.push(err instanceof Error ? err.message : "Error desconocido en el motor de gobernanza");
    return buildFailedGovernanceResult(input, errors);
  }
}

export function buildFailedGovernanceResult(
  input: ExecutiveGovernanceInput,
  errors: string[]
): ExecutiveGovernanceResult {
  const emptyScore = buildEmptyScore(input.orgSlug);
  const emptyAssessment: GovernanceAssessment = {
    id:              `gov_assessment_empty`,
    orgSlug:         input.orgSlug,
    sessionId:       input.sessionId,
    status:          "UNDER_REVIEW",
    complianceScore: 0,
    governanceScore: 0,
    riskScore:       0,
    findingCount:    0,
    violationCount:  0,
    exceptionCount:  0,
    escalationCount: 0,
    confidence:      "LOW",
    findings:        [],
    violations:      [],
    gaps:            ["Error en la generación del reporte"],
    strengths:       [],
    createdAt:       new Date().toISOString(),
  };
  const emptyReport: GovernanceReport = {
    id:              generateGovernanceReportId(),
    orgSlug:         input.orgSlug,
    sessionId:       input.sessionId,
    title:           "Reporte de Gobernanza — Error",
    status:          "UNDER_REVIEW",
    policies:        [],
    rules:           [],
    approvals:       [],
    exceptions:      [],
    escalations:     [],
    violations:      [],
    risks:           [],
    controls:        [],
    assessment:      emptyAssessment,
    recommendations: [],
    score:           emptyScore,
    narrative:       buildEmptyGovernanceNarrative(),
    digest:          null,
    briefing:        null,
    limitations:     ["suggestedOnly: true — resultado de error, requiere revisión manual."],
    createdAt:       new Date().toISOString(),
  };
  return {
    orgSlug:     input.orgSlug,
    sessionId:   input.sessionId,
    report:      emptyReport,
    score:       emptyScore,
    status:      "FAILED",
    limitations: ["suggestedOnly: true — resultado de error, requiere revisión manual."],
    errors,
    createdAt:   new Date().toISOString(),
  };
}

function buildEmptyScore(orgSlug: string): GovernanceScore {
  return {
    orgSlug,
    overallScore:     0,
    complianceScore:  0,
    governanceScore:  0,
    riskScore:        0,
    policyScore:      0,
    controlScore:     0,
    violationPenalty: 0,
    exceptionPenalty: 0,
    confidence:       "LOW",
  };
}
