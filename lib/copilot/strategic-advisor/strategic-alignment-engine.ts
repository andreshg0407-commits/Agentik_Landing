// AGENTIK-STRATEGIC-ADVISOR-01
// Phase 8 — Strategic Alignment Engine

import type { StrategicAdvisorContext } from "./strategic-context-builder";
import type { StrategicRecommendation, StrategicDomain } from "./strategic-advisor-types";

export interface AlignmentResult {
  readonly orgSlug:          string;
  readonly alignmentScore:   number;       // 0–1
  readonly alignedCount:     number;
  readonly misalignedCount:  number;
  readonly misalignments:    MisalignmentRecord[];
  readonly coverageDomains:  StrategicDomain[];
  readonly uncoveredDomains: StrategicDomain[];
  readonly evaluatedAt:      string;
}

export interface MisalignmentRecord {
  readonly id:         string;
  readonly title:      string;
  readonly reason:     string;
  readonly domain:     StrategicDomain;
  readonly severity:   "LOW" | "MEDIUM" | "HIGH";
}

export function evaluateAlignment(
  ctx: StrategicAdvisorContext,
  recommendations: StrategicRecommendation[]
): AlignmentResult {
  const misalignments: MisalignmentRecord[] = detectMisalignment(ctx, recommendations);
  const goalDomains  = new Set(ctx.activeGoals.map((g) => g.domain as StrategicDomain));
  const recDomains   = new Set(recommendations.map((r) => r.domain));

  const coveredDomains:   StrategicDomain[] = [...goalDomains].filter((d) => recDomains.has(d));
  const uncoveredDomains: StrategicDomain[] = [...goalDomains].filter((d) => !recDomains.has(d));

  const alignedCount    = recommendations.length - misalignments.length;
  const alignmentScore  = recommendations.length === 0 ? 0 :
    Math.round((alignedCount / recommendations.length) * 100) / 100;

  return {
    orgSlug:          ctx.orgSlug,
    alignmentScore,
    alignedCount:     Math.max(0, alignedCount),
    misalignedCount:  misalignments.length,
    misalignments,
    coverageDomains:  coveredDomains,
    uncoveredDomains,
    evaluatedAt:      new Date().toISOString(),
  };
}

export function detectMisalignment(
  ctx: StrategicAdvisorContext,
  recommendations: StrategicRecommendation[]
): MisalignmentRecord[] {
  const misalignments: MisalignmentRecord[] = [];

  for (const rec of recommendations) {
    // Check if recommendation domain has an active goal
    const hasGoal = ctx.activeGoals.some((g) => g.domain === rec.domain);
    if (!hasGoal && rec.priority !== "LOW") {
      misalignments.push({
        id:       rec.id,
        title:    rec.title,
        reason:   `No existe objetivo estratégico activo en el dominio ${rec.domain} que respalde esta recomendación`,
        domain:   rec.domain,
        severity: rec.priority === "CRITICAL" ? "HIGH" : rec.priority === "HIGH" ? "MEDIUM" : "LOW",
      });
      continue;
    }

    // Check if recommendation conflicts with active policy
    const blockingPolicy = ctx.activePolicies.find((p) =>
      p.domain === rec.domain && p.priority === "CRITICAL"
    );
    if (blockingPolicy) {
      misalignments.push({
        id:       rec.id,
        title:    rec.title,
        reason:   `Existe una política activa crítica en ${rec.domain} que puede condicionar esta recomendación: "${blockingPolicy.title}"`,
        domain:   rec.domain,
        severity: "MEDIUM",
      });
    }
  }

  return misalignments;
}
