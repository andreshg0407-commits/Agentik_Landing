/**
 * planning-engine.ts
 *
 * BUSINESS-PLANNING-ENGINE-01
 * Planning engine contract and in-memory implementation.
 *
 * Converts rule evaluations, signals, events, and context
 * into structured business plans with ranked alternatives.
 *
 * Does NOT execute actions. Does NOT call AI.
 * Does NOT query databases. Does NOT modify state.
 *
 * No Prisma. No React. No AI. No UI. Pure domain types.
 */

import type { BusinessPlan, PlanTriggerRef } from "./plan";
import { buildBusinessPlan } from "./plan";
import type { PlanAlternative } from "./plan-alternative";
import { buildPlanAlternative } from "./plan-alternative";
import type { PlanEvaluation, CriterionScore } from "./plan-evaluation";
import { buildPlanEvaluation, PLAN_EVALUATION_CRITERIA } from "./plan-evaluation";
import type { PlanningContext } from "./plan-context";
import type { PlanningStrategy } from "./planning-registry";
import { PlanningRegistry } from "./planning-registry";
import type { PlanSource, PlanSeverity, PlanPriority } from "./planning-types";
import { nextPlanId } from "./planning-types";
import type { RuleEvaluationResult } from "@/lib/business-rules";
import type { BusinessEvent } from "@/lib/business-events";
import type { BusinessSignal } from "@/lib/business-signals";

// -- Engine Contract ----------------------------------------------------------

/** Planning engine contract. */
export interface IPlanningEngine {
  /** Create a plan from a full planning context. */
  createPlan(ctx: PlanningContext): BusinessPlan;

  /** Create a plan from a rule evaluation result. */
  createFromRuleResult(
    orgId: string,
    result: RuleEvaluationResult,
    ctx: PlanningContext,
  ): BusinessPlan;

  /** Create a plan from a business event. */
  createFromEvent(
    orgId: string,
    event: BusinessEvent,
    ctx: PlanningContext,
  ): BusinessPlan;

  /** Create a plan from a business signal. */
  createFromSignal(
    orgId: string,
    signal: BusinessSignal,
    ctx: PlanningContext,
  ): BusinessPlan;

  /** Generate alternatives for a plan using registered strategies. */
  generateAlternatives(plan: BusinessPlan, ctx: PlanningContext): PlanAlternative[];

  /** Evaluate a single alternative. */
  evaluateAlternative(alt: PlanAlternative, ctx: PlanningContext): PlanEvaluation;

  /** Evaluate and rank all alternatives in a plan. */
  evaluateAlternatives(plan: BusinessPlan, ctx: PlanningContext): BusinessPlan;

  /** Select the recommended alternative (highest score). */
  selectRecommendedAlternative(plan: BusinessPlan): BusinessPlan;

  /** Produce a human-readable explanation of a plan. */
  explainPlan(plan: BusinessPlan): string;
}

// -- In-Memory Implementation -------------------------------------------------

/** In-memory planning engine. */
export class InMemoryPlanningEngine implements IPlanningEngine {
  constructor(private readonly registry: PlanningRegistry = new PlanningRegistry()) {}

  createPlan(ctx: PlanningContext): BusinessPlan {
    const trigger: PlanTriggerRef = {
      source: this.inferSource(ctx),
      sourceId: this.inferSourceId(ctx),
      description: ctx.triggerDescription,
      metadata: {},
    };

    const plan = buildBusinessPlan({
      organizationId: ctx.organizationId,
      title: ctx.triggerDescription,
      description: `Plan generado a partir de: ${ctx.triggerDescription}`,
      source: trigger.source,
      trigger,
      priority: this.inferPriority(ctx),
      severity: this.inferSeverity(ctx),
      confidence: this.inferConfidence(ctx),
    });

    // Generate alternatives from registered strategies
    const alternatives = this.generateAlternatives(plan, ctx);
    plan.alternatives = alternatives;

    // Evaluate and rank
    return this.evaluateAlternatives(plan, ctx);
  }

  createFromRuleResult(
    orgId: string,
    result: RuleEvaluationResult,
    ctx: PlanningContext,
  ): BusinessPlan {
    const matchedNames = result.matchedEvaluations
      .map(e => e.ruleName)
      .join(", ");

    const trigger: PlanTriggerRef = {
      source: "rule_engine",
      sourceId: result.resultId,
      description: `Reglas evaluadas: ${matchedNames || "ninguna coincidio"}`,
      metadata: { totalMatched: result.totalMatched },
    };

    const severity = this.severityFromRuleResult(result);

    const plan = buildBusinessPlan({
      organizationId: orgId,
      title: `Plan por reglas: ${matchedNames || "evaluacion sin coincidencias"}`,
      description: `${result.totalMatched} regla(s) coincidieron. ${result.suggestedActions.length} accion(es) sugeridas.`,
      source: "rule_engine",
      trigger,
      severity,
      priority: severity === "critical" ? "highest" : severity === "high" ? "high" : "normal",
      confidence: result.totalMatched > 0 ? 70 : 30,
    });

    const alternatives = this.generateAlternatives(plan, ctx);
    plan.alternatives = alternatives;

    return this.evaluateAlternatives(plan, ctx);
  }

  createFromEvent(
    orgId: string,
    event: BusinessEvent,
    ctx: PlanningContext,
  ): BusinessPlan {
    const eventSummary = event.payload.summary || String(event.eventType);
    const trigger: PlanTriggerRef = {
      source: "event_engine",
      sourceId: event.eventId,
      description: `Evento: ${event.eventType} — ${eventSummary}`,
      metadata: { eventType: event.eventType },
    };

    const plan = buildBusinessPlan({
      organizationId: orgId,
      title: `Plan por evento: ${eventSummary}`,
      description: `Plan generado a partir del evento ${event.eventType}`,
      source: "event_engine",
      trigger,
      severity: event.severity as PlanSeverity,
      confidence: 60,
    });

    const alternatives = this.generateAlternatives(plan, ctx);
    plan.alternatives = alternatives;

    return this.evaluateAlternatives(plan, ctx);
  }

  createFromSignal(
    orgId: string,
    signal: BusinessSignal,
    ctx: PlanningContext,
  ): BusinessPlan {
    const trigger: PlanTriggerRef = {
      source: "signal_engine",
      sourceId: signal.signalId,
      description: `Signal: ${signal.title}`,
      metadata: { signalType: signal.type, category: signal.category },
    };

    const plan = buildBusinessPlan({
      organizationId: orgId,
      title: `Plan por signal: ${signal.title}`,
      description: signal.description,
      source: "signal_engine",
      trigger,
      severity: signal.severity as PlanSeverity,
      confidence: 60,
    });

    const alternatives = this.generateAlternatives(plan, ctx);
    plan.alternatives = alternatives;

    return this.evaluateAlternatives(plan, ctx);
  }

  generateAlternatives(plan: BusinessPlan, ctx: PlanningContext): PlanAlternative[] {
    const strategies = this.registry.listStrategies();
    const alternatives: PlanAlternative[] = [];

    for (const strategy of strategies) {
      if (strategy.appliesTo(ctx)) {
        const alt = strategy.createAlternative(plan.planId, ctx);
        alternatives.push(alt);
      }
    }

    // Always include "do nothing" if no strategies matched
    if (alternatives.length === 0) {
      alternatives.push(
        buildPlanAlternative({
          planId: plan.planId,
          title: "No tomar accion",
          description: "Mantener el estado actual sin intervenir",
          strategy: "do_nothing",
          confidence: 100,
          expectedImpact: "Sin cambio",
          estimatedDuration: "0",
        }),
      );
    }

    return alternatives;
  }

  evaluateAlternative(alt: PlanAlternative, ctx: PlanningContext): PlanEvaluation {
    const criteria: CriterionScore[] = [];
    const missingInfo: string[] = [];

    // Benefit score: from benefits count and values
    const benefitTotal = alt.benefits.reduce((s, b) => s + b.estimatedValue, 0);
    criteria.push({
      criterion: "benefit",
      score: Math.min(100, benefitTotal > 0 ? 50 + Math.min(50, benefitTotal / 100) : 20),
      weight: 0.2,
      reason: `${alt.benefits.length} beneficio(s), valor total: ${benefitTotal}`,
    });

    // Cost score: lower cost = higher score
    const costTotal = alt.costs.reduce((s, c) => s + c.amount, 0);
    criteria.push({
      criterion: "cost",
      score: costTotal === 0 ? 90 : Math.max(10, 90 - Math.min(80, costTotal / 50)),
      weight: 0.15,
      reason: `${alt.costs.length} costo(s), total: ${costTotal}`,
    });

    // Risk score: fewer/lower risks = higher score
    const avgRiskImpact = alt.risks.length > 0
      ? alt.risks.reduce((s, r) => s + r.impact, 0) / alt.risks.length
      : 0;
    criteria.push({
      criterion: "risk",
      score: alt.risks.length === 0 ? 80 : Math.max(10, 80 - avgRiskImpact * 8),
      weight: 0.15,
      reason: `${alt.risks.length} riesgo(s), impacto promedio: ${avgRiskImpact.toFixed(1)}`,
    });

    // Feasibility: based on blocking constraints and unmet dependencies
    const blockingConstraints = alt.constraints.filter(c => c.blocking).length;
    const unmetDeps = alt.dependencies.filter(d => d.required && d.status !== "met").length;
    criteria.push({
      criterion: "feasibility",
      score: blockingConstraints > 0 ? 10 : unmetDeps > 0 ? 40 : 80,
      weight: 0.2,
      reason: `${blockingConstraints} restriccion(es) bloqueante(s), ${unmetDeps} dependencia(s) no resuelta(s)`,
    });

    // Confidence
    criteria.push({
      criterion: "confidence",
      score: alt.confidence,
      weight: 0.1,
      reason: `Confianza declarada: ${alt.confidence}%`,
    });

    // Approval complexity: fewer approvals = higher score
    const blockingApprovals = alt.approvalRequirements.filter(a => a.blocking).length;
    criteria.push({
      criterion: "approval_complexity",
      score: blockingApprovals === 0 ? 90 : Math.max(20, 90 - blockingApprovals * 20),
      weight: 0.1,
      reason: `${blockingApprovals} aprobacion(es) bloqueante(s)`,
    });

    // Operational effort: based on steps count
    criteria.push({
      criterion: "operational_effort",
      score: alt.steps.length <= 2 ? 90 : Math.max(20, 90 - alt.steps.length * 10),
      weight: 0.1,
      reason: `${alt.steps.length} paso(s)`,
    });

    // Track missing info
    if (alt.benefits.length === 0) missingInfo.push("No se declararon beneficios");
    if (alt.confidence < 50) missingInfo.push("Confianza baja — puede faltar informacion");

    return buildPlanEvaluation({
      alternativeId: alt.alternativeId,
      criteria,
      missingInformation: missingInfo,
    });
  }

  evaluateAlternatives(plan: BusinessPlan, ctx: PlanningContext): BusinessPlan {
    // Evaluate each alternative
    for (const alt of plan.alternatives) {
      alt.evaluation = this.evaluateAlternative(alt, ctx);
      alt.score = alt.evaluation.score;
    }

    // Sort by score descending and assign ranks
    const sorted = [...plan.alternatives].sort((a, b) => b.score - a.score);
    for (let i = 0; i < sorted.length; i++) {
      sorted[i].rank = i + 1;
      if (sorted[i].evaluation) {
        sorted[i].evaluation!.rank = i + 1;
      }
    }

    plan.alternatives = sorted;

    return this.selectRecommendedAlternative(plan);
  }

  selectRecommendedAlternative(plan: BusinessPlan): BusinessPlan {
    if (plan.alternatives.length === 0) return plan;

    // Select the top-ranked alternative
    const best = plan.alternatives[0];
    plan.selectedAlternativeId = best.alternativeId;

    // Plan confidence = best alternative's confidence
    plan.confidence = best.evaluation?.confidence ?? best.confidence;

    return plan;
  }

  explainPlan(plan: BusinessPlan): string {
    const lines: string[] = [];
    lines.push(`Plan: ${plan.title}`);
    lines.push(`Estado: ${plan.status} | Severidad: ${plan.severity} | Prioridad: ${plan.priority}`);
    lines.push(`Origen: ${plan.source} — ${plan.trigger.description}`);
    lines.push(`Confianza: ${plan.confidence}%`);
    lines.push("");
    lines.push(`${plan.alternatives.length} alternativa(s):`);

    for (const alt of plan.alternatives) {
      const selected = alt.alternativeId === plan.selectedAlternativeId ? " [RECOMENDADA]" : "";
      lines.push(`  #${alt.rank} ${alt.title}${selected}`);
      lines.push(`     Estrategia: ${alt.strategy} | Score: ${alt.score}/100 | Confianza: ${alt.confidence}%`);
      if (alt.steps.length > 0) {
        lines.push(`     Pasos: ${alt.steps.map(s => s.title).join(" → ")}`);
      }
      if (alt.risks.length > 0) {
        lines.push(`     Riesgos: ${alt.risks.map(r => r.title).join(", ")}`);
      }
      if (alt.benefits.length > 0) {
        lines.push(`     Beneficios: ${alt.benefits.map(b => b.description).join(", ")}`);
      }
    }

    return lines.join("\n");
  }

  // -- Private helpers --------------------------------------------------------

  private inferSource(ctx: PlanningContext): PlanSource {
    if (ctx.ruleResults.length > 0) return "rule_engine";
    if (ctx.events.length > 0) return "event_engine";
    if (ctx.signals.length > 0) return "signal_engine";
    return "system";
  }

  private inferSourceId(ctx: PlanningContext): string {
    if (ctx.ruleResults.length > 0) return ctx.ruleResults[0].resultId;
    if (ctx.events.length > 0) return ctx.events[0].eventId;
    if (ctx.signals.length > 0) return ctx.signals[0].signalId;
    return "system";
  }

  private inferPriority(ctx: PlanningContext): PlanPriority {
    // If any rule matched at critical, highest priority
    for (const r of ctx.ruleResults) {
      if (r.suggestedOutcomes.some(o => o.severity === "critical")) return "highest";
      if (r.suggestedOutcomes.some(o => o.severity === "high")) return "high";
    }
    return "normal";
  }

  private inferSeverity(ctx: PlanningContext): PlanSeverity {
    for (const r of ctx.ruleResults) {
      if (r.suggestedOutcomes.some(o => o.severity === "critical")) return "critical";
      if (r.suggestedOutcomes.some(o => o.severity === "high")) return "high";
    }
    return "medium";
  }

  private inferConfidence(ctx: PlanningContext): number {
    const sources = [
      ctx.ruleResults.length > 0,
      ctx.events.length > 0,
      ctx.signals.length > 0,
      ctx.entitySnapshots.length > 0,
      Object.keys(ctx.metrics).length > 0,
    ].filter(Boolean).length;

    return Math.min(100, 30 + sources * 15);
  }

  private severityFromRuleResult(result: RuleEvaluationResult): PlanSeverity {
    const severities = result.suggestedOutcomes.map(o => o.severity);
    if (severities.includes("critical")) return "critical";
    if (severities.includes("high")) return "high";
    if (severities.includes("medium")) return "medium";
    if (severities.includes("low")) return "low";
    return "info";
  }
}
