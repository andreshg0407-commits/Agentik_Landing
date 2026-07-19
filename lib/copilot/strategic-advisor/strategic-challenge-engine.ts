// AGENTIK-STRATEGIC-ADVISOR-01
// Phase 9 — Strategic Challenge Engine
// Challenges assumptions — surfaces blind spots, insufficient evidence, and hidden risks
// This is the most critical engine: it must NEVER accept surface-level explanations

import type { StrategicAdvisorContext } from "./strategic-context-builder";
import type { StrategicConcern, StrategicRecommendation, StrategicDomain } from "./strategic-advisor-types";
import { generateSaId } from "./strategic-advisor-types";

export interface StrategicChallenge {
  readonly id:             string;
  readonly orgSlug:        string;
  readonly statement:      string;         // The challenge itself
  readonly assumption:     string;         // What assumption is being challenged
  readonly evidence:       string;         // What evidence supports the challenge
  readonly domain:         StrategicDomain;
  readonly severity:       "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  readonly evidenceIds:    string[];
  readonly metadata:       Record<string, unknown>;
}

export function identifyChallenges(
  ctx: StrategicAdvisorContext,
  concerns: StrategicConcern[],
  recommendations: StrategicRecommendation[]
): StrategicChallenge[] {
  const challenges: StrategicChallenge[] = [];

  // Challenge 1: Insufficient evidence for stated concerns
  for (const concern of concerns.filter((c) => c.evidenceIds.length === 0)) {
    challenges.push({
      id:          generateSaId("chal"),
      orgSlug:     ctx.orgSlug,
      statement:   `Existe evidencia insuficiente para la preocupación "${concern.title}"`,
      assumption:  `Se asume que el riesgo en ${concern.domain} es real sin evidencia documental`,
      evidence:    "No se encontraron evidencias asociadas a esta preocupación",
      domain:      concern.domain,
      severity:    "MEDIUM",
      evidenceIds: [],
      metadata:    { source: "EVIDENCE_AUDIT", concernId: concern.id },
    });
  }

  // Challenge 2: Rejected patterns being repeated
  for (const rejected of ctx.rejectedPatterns.slice(0, 2)) {
    const isRepeated = ctx.confirmedPatterns.some(
      (p) => p.domain === rejected.domain && p.name !== rejected.name
    );
    if (isRepeated) {
      challenges.push({
        id:          generateSaId("chal"),
        orgSlug:     ctx.orgSlug,
        statement:   `El patrón rechazado "${rejected.name}" puede estar repitiéndose bajo otro nombre`,
        assumption:  "Se asume que la situación actual es diferente a la que generó el patrón rechazado",
        evidence:    `Patrón rechazado con ${rejected.reinforcementCount} ocurrencias negativas en dominio ${rejected.domain}`,
        domain:      _mapDomain(rejected.domain),
        severity:    "HIGH",
        evidenceIds: rejected.evidenceEventIds,
        metadata:    { source: "LEARNING_CHALLENGE", patternId: rejected.id },
      });
    }
  }

  // Challenge 3: Critical recommendations without supporting goals
  for (const rec of recommendations.filter((r) => r.priority === "CRITICAL" && !ctx.activeGoals.some((g) => g.domain === r.domain))) {
    challenges.push({
      id:          generateSaId("chal"),
      orgSlug:     ctx.orgSlug,
      statement:   `La recomendación crítica "${rec.title}" no tiene respaldo en los objetivos estratégicos declarados`,
      assumption:  "Se asume que esta recomendación es urgente aunque no está vinculada a ningún objetivo",
      evidence:    `No existe objetivo activo en el dominio ${rec.domain}`,
      domain:      rec.domain,
      severity:    "HIGH",
      evidenceIds: rec.evidenceIds,
      metadata:    { source: "GOAL_ALIGNMENT_AUDIT", recId: rec.id },
    });
  }

  // Challenge 4: High signal density with no learning patterns
  if (ctx.anomalySignals.length >= 3 && ctx.confirmedPatterns.length === 0) {
    challenges.push({
      id:          generateSaId("chal"),
      orgSlug:     ctx.orgSlug,
      statement:   `Hay ${ctx.anomalySignals.length} señales de anomalía pero no existe base de aprendizaje para interpretarlas correctamente`,
      assumption:  "Se asume que las señales actuales son interpretables en ausencia de patrones históricos confirmados",
      evidence:    `0 patrones confirmados vs ${ctx.anomalySignals.length} señales de anomalía`,
      domain:      "CROSS_DOMAIN",
      severity:    "MEDIUM",
      evidenceIds: ctx.anomalySignals.map((s) => s.id),
      metadata:    { source: "SIGNAL_INTERPRETATION_AUDIT" },
    });
  }

  // Challenge 5: Finance concern masked by commercial success
  const hasFinanceCritical  = concerns.some((c) => c.domain === "FINANCE" && c.severity === "CRITICAL");
  const hasCommercialGrowth = ctx.metricRiseSignals.some((s) => s.domain === "COMMERCIAL");
  if (hasFinanceCritical && hasCommercialGrowth) {
    challenges.push({
      id:          generateSaId("chal"),
      orgSlug:     ctx.orgSlug,
      statement:   "El crecimiento comercial puede estar enmascarando una crisis financiera subyacente",
      assumption:  "Se asume que las métricas positivas en ventas reflejan salud empresarial global",
      evidence:    "Riesgo financiero crítico coexiste con señal de crecimiento comercial",
      domain:      "FINANCE",
      severity:    "CRITICAL",
      evidenceIds: concerns.filter((c) => c.domain === "FINANCE").flatMap((c) => c.evidenceIds),
      metadata:    { source: "CROSS_DOMAIN_CHALLENGE" },
    });
  }

  // Challenge 6: Commitment count vs resource capacity
  if (ctx.activeCommitments.length >= 5 && concerns.some((c) => c.domain === "OPERATIONS")) {
    challenges.push({
      id:          generateSaId("chal"),
      orgSlug:     ctx.orgSlug,
      statement:   `Con ${ctx.activeCommitments.length} compromisos activos y preocupaciones operativas, ¿existe capacidad real para cumplir?`,
      assumption:  "Se asume que la capacidad operativa es suficiente para el nivel de compromisos activos",
      evidence:    `${ctx.activeCommitments.length} compromisos activos y señales de presión operativa`,
      domain:      "OPERATIONS",
      severity:    "HIGH",
      evidenceIds: ctx.activeCommitments.map((c) => c.id),
      metadata:    { source: "CAPACITY_CHALLENGE" },
    });
  }

  return challenges;
}

function _mapDomain(domain: string): StrategicDomain {
  const map: Record<string, StrategicDomain> = {
    FINANCE: "FINANCE", COMMERCIAL: "COMMERCIAL", MARKETING: "MARKETING",
    OPERATIONS: "OPERATIONS", EXECUTIVE: "EXECUTIVE", COMPLIANCE: "COMPLIANCE",
    MEMORY: "CROSS_DOMAIN", CROSS_MODULE: "CROSS_DOMAIN",
  };
  return map[domain] ?? "CROSS_DOMAIN";
}
