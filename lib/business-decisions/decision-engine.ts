/**
 * decision-engine.ts
 *
 * BUSINESS-DECISION-ENGINE-01
 * Decision engine contract and in-memory implementation.
 *
 * Selects the best alternative from a BusinessPlan, builds justification,
 * tradeoffs, approval requirements, and confidence assessment.
 *
 * Does NOT execute actions. Does NOT call AI.
 * Does NOT query databases. Does NOT modify state.
 *
 * No Prisma. No React. No AI. No UI. Pure domain types.
 */

import type { BusinessDecision, DecisionTriggerRef } from "./decision";
import { buildBusinessDecision } from "./decision";
import type { DecisionOption } from "./decision-option";
import { buildDecisionOption } from "./decision-option";
import type { DecisionCriterion } from "./decision-criteria";
import { buildDecisionCriterion, DEFAULT_CRITERIA_WEIGHTS } from "./decision-criteria";
import type { DecisionJustification, RejectedAlternativeSummary } from "./decision-justification";
import { buildDecisionJustification } from "./decision-justification";
import type { DecisionTradeoff } from "./decision-tradeoff";
import { buildDecisionTradeoff } from "./decision-tradeoff";
import type { DecisionApproval } from "./decision-approval";
import { buildDecisionApproval, noApprovalNeeded } from "./decision-approval";
import type { DecisionConfidence } from "./decision-confidence";
import { buildDecisionConfidence } from "./decision-confidence";
import type { DecisionAudit } from "./decision-audit";
import { buildDecisionAudit, addAuditEntry } from "./decision-audit";
import type { DecisionContext } from "./decision-context";
import type { DecisionPolicyConfig } from "./decision-registry";
import { DecisionPolicyRegistry, DEFAULT_POLICIES } from "./decision-registry";
import type { DecisionSeverity, DecisionPriority } from "./decision-types";
import type { BusinessPlan } from "@/lib/business-planning";
import type { PlanAlternative } from "@/lib/business-planning/plan-alternative";

// -- Engine Contract ----------------------------------------------------------

/** Decision engine contract. */
export interface IDecisionEngine {
  /** Make a full decision from a context. */
  decide(ctx: DecisionContext): BusinessDecision;

  /** Make a decision from a business plan. */
  decideFromPlan(plan: BusinessPlan, ctx: DecisionContext): BusinessDecision;

  /** Convert plan alternatives into decision options. */
  buildOptions(plan: BusinessPlan): DecisionOption[];

  /** Evaluate options using criteria and policy. */
  evaluateOptions(options: DecisionOption[], ctx: DecisionContext): DecisionOption[];

  /** Rank options by score. */
  rankOptions(options: DecisionOption[]): DecisionOption[];

  /** Select the recommended option. */
  selectRecommendedOption(options: DecisionOption[]): DecisionOption | null;

  /** Build justification for the selected option. */
  buildJustification(selected: DecisionOption, others: DecisionOption[], ctx: DecisionContext): DecisionJustification;

  /** Build tradeoffs for the selected option. */
  buildTradeoffs(selected: DecisionOption, ctx: DecisionContext): DecisionTradeoff[];

  /** Build approval requirements. */
  buildApproval(selected: DecisionOption, ctx: DecisionContext): DecisionApproval;

  /** Build confidence assessment. */
  buildConfidence(selected: DecisionOption, ctx: DecisionContext): DecisionConfidence;

  /** Produce a human-readable explanation. */
  explainDecision(decision: BusinessDecision): string;
}

// -- In-Memory Implementation -------------------------------------------------

/** In-memory decision engine. */
export class InMemoryDecisionEngine implements IDecisionEngine {
  private readonly policyRegistry: DecisionPolicyRegistry;

  constructor(policyRegistry?: DecisionPolicyRegistry) {
    this.policyRegistry = policyRegistry ?? new DecisionPolicyRegistry();
    if (this.policyRegistry.size() === 0) {
      this.policyRegistry.registerAll(DEFAULT_POLICIES);
    }
  }

  decide(ctx: DecisionContext): BusinessDecision {
    if (ctx.plan) {
      return this.decideFromPlan(ctx.plan, ctx);
    }

    // No plan — create a minimal decision with no options
    const trigger: DecisionTriggerRef = {
      source: "system",
      sourceId: "no-plan",
      description: "Decision sin plan de origen",
      metadata: {},
    };

    const audit = buildDecisionAudit({ createdBy: "decision_engine" });
    addAuditEntry(audit, "created", "Decision sin plan — sin opciones disponibles");

    return buildBusinessDecision({
      organizationId: ctx.organizationId,
      title: "Decision sin plan de origen",
      description: "No se proporciono un plan para evaluar",
      source: "system",
      trigger,
      options: [],
      criteria: [],
      justification: buildDecisionJustification({
        summary: "Sin plan disponible",
        mainReasons: ["No se proporciono un BusinessPlan"],
        selectedBecause: "N/A",
      }),
      tradeoffs: [],
      approval: noApprovalNeeded(),
      confidence: buildDecisionConfidence({ score: 0, reason: "Sin plan" }),
      audit,
      severity: "info",
    });
  }

  decideFromPlan(plan: BusinessPlan, ctx: DecisionContext): BusinessDecision {
    const audit = buildDecisionAudit({
      sourcePlanId: plan.planId,
      sourceRuleEvaluationIds: ctx.ruleResults.map(r => r.resultId),
      sourceEventIds: ctx.events.map(e => e.eventId),
      sourceSignalIds: ctx.signals.map(s => s.signalId),
      createdBy: "decision_engine",
    });
    addAuditEntry(audit, "started", `Evaluando plan "${plan.title}" con ${plan.alternatives.length} alternativa(s)`);

    // 1. Build options from plan alternatives
    let options = this.buildOptions(plan);
    addAuditEntry(audit, "options_built", `${options.length} opcion(es) construidas`);

    // 2. Evaluate with criteria
    options = this.evaluateOptions(options, ctx);
    addAuditEntry(audit, "options_evaluated", `Opciones evaluadas con politica "${ctx.policy}"`);

    // 3. Rank
    options = this.rankOptions(options);
    addAuditEntry(audit, "options_ranked", `Opciones rankeadas`);

    // 4. Select
    const selected = this.selectRecommendedOption(options);

    if (selected) {
      selected.selected = true;
      audit.selectedOptionId = selected.optionId;
      audit.evaluatedOptionIds = options.map(o => o.optionId);
      audit.rejectedOptionIds = options
        .filter(o => o.optionId !== selected.optionId)
        .map(o => o.optionId);
      addAuditEntry(audit, "selected", `Opcion recomendada: "${selected.title}" (score: ${selected.score})`);
    } else {
      addAuditEntry(audit, "no_selection", "Ninguna opcion viable encontrada");
    }

    // 5. Build justification, tradeoffs, approval, confidence
    const others = options.filter(o => o.optionId !== selected?.optionId);
    const justification = selected
      ? this.buildJustification(selected, others, ctx)
      : buildDecisionJustification({
          summary: "Sin opcion viable",
          mainReasons: ["Todas las opciones estan bloqueadas o no son viables"],
          selectedBecause: "N/A",
        });

    const tradeoffs = selected ? this.buildTradeoffs(selected, ctx) : [];
    const approval = selected ? this.buildApproval(selected, ctx) : noApprovalNeeded();
    const confidence = selected
      ? this.buildConfidence(selected, ctx)
      : buildDecisionConfidence({ score: 0, reason: "Sin opcion viable" });

    // Collect all criteria from the selected option (or first option for reference)
    const criteriaRef = selected?.criteria ?? options[0]?.criteria ?? [];

    const trigger: DecisionTriggerRef = {
      source: "planning_engine",
      sourceId: plan.planId,
      description: `Plan: "${plan.title}"`,
      metadata: { planSource: plan.source },
    };

    addAuditEntry(audit, "completed", "Decision construida");

    return buildBusinessDecision({
      organizationId: ctx.organizationId,
      title: selected
        ? `Decision: ${selected.title}`
        : `Decision: ${plan.title} (sin opcion viable)`,
      description: justification.summary,
      source: "planning_engine",
      trigger,
      options,
      criteria: criteriaRef,
      justification,
      tradeoffs,
      approval,
      confidence,
      audit,
      recommendedOptionId: selected?.optionId ?? null,
      severity: plan.severity as DecisionSeverity,
      priority: plan.priority as DecisionPriority,
    });
  }

  buildOptions(plan: BusinessPlan): DecisionOption[] {
    return plan.alternatives.map(alt => this.alternativeToOption(alt));
  }

  evaluateOptions(options: DecisionOption[], ctx: DecisionContext): DecisionOption[] {
    const policyConfig = this.policyRegistry.get(ctx.policy);
    const weights = policyConfig?.criteriaWeights ?? DEFAULT_CRITERIA_WEIGHTS;

    for (const opt of options) {
      const criteria: DecisionCriterion[] = [];

      for (const [key, config] of Object.entries(weights)) {
        const rawValue = this.extractCriterionValue(key, opt, ctx);
        criteria.push(buildDecisionCriterion({
          key,
          label: config.label,
          weight: config.weight,
          direction: config.direction,
          value: rawValue,
          explanation: `${config.label}: ${rawValue}/100`,
        }));
      }

      opt.criteria = criteria;

      // Compute weighted score
      const totalWeight = criteria.reduce((s, c) => s + c.weight, 0);
      opt.score = totalWeight > 0
        ? Math.round(criteria.reduce((s, c) => s + c.normalizedScore * c.weight, 0) / totalWeight)
        : 0;
    }

    return options;
  }

  rankOptions(options: DecisionOption[]): DecisionOption[] {
    const sorted = [...options].sort((a, b) => {
      // Feasible options first
      if (a.feasible && !b.feasible) return -1;
      if (!a.feasible && b.feasible) return 1;
      // Then by score
      return b.score - a.score;
    });

    for (let i = 0; i < sorted.length; i++) {
      sorted[i].rank = i + 1;
    }

    return sorted;
  }

  selectRecommendedOption(options: DecisionOption[]): DecisionOption | null {
    // Select the top-ranked feasible option
    return options.find(o => o.feasible && !o.blocked) ?? null;
  }

  buildJustification(
    selected: DecisionOption,
    others: DecisionOption[],
    ctx: DecisionContext,
  ): DecisionJustification {
    const mainReasons: string[] = [];

    // Top 3 criteria by normalized score
    const topCriteria = [...selected.criteria]
      .sort((a, b) => b.normalizedScore - a.normalizedScore)
      .slice(0, 3);

    for (const c of topCriteria) {
      mainReasons.push(`${c.label}: ${c.normalizedScore}/100 (${c.explanation})`);
    }

    const rejectedAlternatives: RejectedAlternativeSummary[] = others.map(o => ({
      optionId: o.optionId,
      title: o.title,
      score: o.score,
      reason: o.blocked
        ? "Bloqueada por restricciones"
        : !o.feasible
          ? "No viable"
          : `Score inferior (${o.score} vs ${selected.score})`,
    }));

    const missingInfo: string[] = [];
    if (ctx.entitySnapshots.length === 0) missingInfo.push("Sin snapshots de entidades");
    if (Object.keys(ctx.metrics).length === 0) missingInfo.push("Sin metricas operativas");

    return buildDecisionJustification({
      summary: `"${selected.title}" es la opcion recomendada con score ${selected.score}/100`,
      mainReasons,
      selectedBecause: `Mejor combinacion de ${topCriteria.map(c => c.label.toLowerCase()).join(", ")}`,
      rejectedAlternatives,
      missingInformation: missingInfo,
      supportingEvidence: [
        `Plan de origen: ${ctx.plan?.planId ?? "N/A"}`,
        `Politica aplicada: ${ctx.policy}`,
        `${ctx.ruleResults.length} resultado(s) de reglas`,
        `${ctx.events.length} evento(s)`,
        `${ctx.signals.length} signal(s)`,
      ],
      confidenceExplanation: `Confianza basada en ${selected.criteria.length} criterios evaluados`,
    });
  }

  buildTradeoffs(selected: DecisionOption, ctx: DecisionContext): DecisionTradeoff[] {
    const tradeoffs: DecisionTradeoff[] = [];

    // Find criteria where the selected option scores low
    const weakCriteria = selected.criteria
      .filter(c => c.normalizedScore < 50)
      .sort((a, b) => a.normalizedScore - b.normalizedScore);

    const strongCriteria = selected.criteria
      .filter(c => c.normalizedScore >= 70)
      .sort((a, b) => b.normalizedScore - a.normalizedScore);

    for (const weak of weakCriteria.slice(0, 3)) {
      const strong = strongCriteria[0];
      if (strong) {
        tradeoffs.push(buildDecisionTradeoff({
          optionId: selected.optionId,
          gain: `${strong.label} (${strong.normalizedScore}/100)`,
          sacrifice: `${weak.label} (${weak.normalizedScore}/100)`,
          severity: weak.normalizedScore < 25 ? "high" : "medium",
          explanation: `La opcion "${selected.title}" prioriza ${strong.label.toLowerCase()} sobre ${weak.label.toLowerCase()}`,
        }));
      }
    }

    return tradeoffs;
  }

  buildApproval(selected: DecisionOption, ctx: DecisionContext): DecisionApproval {
    if (!selected.requiresApproval) {
      return noApprovalNeeded();
    }

    // Determine approval type from the option's strategy
    let approvalType: DecisionApproval["approvalType"] = "manager";
    let requiredRole = "gerente";

    if (selected.strategy === "transfer_inventory") {
      approvalType = "manager";
      requiredRole = "jefe_logistica";
    } else if (selected.strategy === "escalate_to_management") {
      approvalType = "admin";
      requiredRole = "gerente_general";
    } else if (selected.strategy === "remove_portfolio_sample") {
      approvalType = "commercial";
      requiredRole = "gerente_comercial";
    } else if (selected.strategy === "contact_customer") {
      approvalType = "commercial";
      requiredRole = "gerente_comercial";
    }

    return buildDecisionApproval({
      required: true,
      approvalType,
      requiredRole,
      reason: `La opcion "${selected.title}" requiere aprobacion antes de ejecucion`,
      blocking: true,
    });
  }

  buildConfidence(selected: DecisionOption, ctx: DecisionContext): DecisionConfidence {
    // Base confidence from criteria evaluation
    const avgCriterionScore = selected.criteria.length > 0
      ? selected.criteria.reduce((s, c) => s + c.normalizedScore, 0) / selected.criteria.length
      : 0;

    // Data richness bonus
    const dataSources = [
      ctx.plan !== null,
      ctx.ruleResults.length > 0,
      ctx.events.length > 0,
      ctx.signals.length > 0,
      ctx.entitySnapshots.length > 0,
      Object.keys(ctx.metrics).length > 0,
    ].filter(Boolean).length;

    const score = Math.min(100, Math.round(avgCriterionScore * 0.6 + dataSources * 8));

    const missingInfo: string[] = [];
    if (ctx.entitySnapshots.length === 0) missingInfo.push("Sin snapshots de entidades");
    if (Object.keys(ctx.metrics).length === 0) missingInfo.push("Sin metricas operativas");
    if (ctx.ruleResults.length === 0) missingInfo.push("Sin resultados de reglas");

    return buildDecisionConfidence({
      score,
      reason: `Score basado en ${selected.criteria.length} criterios y ${dataSources} fuentes de datos`,
      evidenceQuality: dataSources >= 4 ? "alta" : dataSources >= 2 ? "media" : "baja",
      dataFreshness: ctx.entitySnapshots.length > 0 ? "reciente" : "desconocida",
      missingInformation: missingInfo,
      sensitivity: score < 50
        ? "Alta — pequenos cambios en datos podrian alterar la recomendacion"
        : "Normal — la recomendacion es estable",
    });
  }

  explainDecision(decision: BusinessDecision): string {
    const lines: string[] = [];
    lines.push(`Decision: ${decision.title}`);
    lines.push(`Estado: ${decision.status} | Severidad: ${decision.severity} | Prioridad: ${decision.priority}`);
    lines.push(`Confianza: ${decision.confidence.score}% (${decision.confidence.level})`);
    lines.push("");
    lines.push(`Justificacion: ${decision.justification.summary}`);
    lines.push(`Razon: ${decision.justification.selectedBecause}`);
    lines.push("");

    if (decision.justification.mainReasons.length > 0) {
      lines.push("Razones principales:");
      for (const r of decision.justification.mainReasons) {
        lines.push(`  - ${r}`);
      }
      lines.push("");
    }

    lines.push(`${decision.options.length} opcion(es) evaluadas:`);
    for (const opt of decision.options) {
      const tag = opt.selected ? " [RECOMENDADA]" : opt.blocked ? " [BLOQUEADA]" : "";
      lines.push(`  #${opt.rank} ${opt.title}${tag} — score: ${opt.score}/100`);
    }

    if (decision.tradeoffs.length > 0) {
      lines.push("");
      lines.push("Tradeoffs:");
      for (const t of decision.tradeoffs) {
        lines.push(`  + ${t.gain}  / - ${t.sacrifice}`);
      }
    }

    if (decision.approval.required) {
      lines.push("");
      lines.push(`Aprobacion requerida: ${decision.approval.approvalType} (${decision.approval.requiredRole})`);
      lines.push(`Razon: ${decision.approval.reason}`);
    }

    return lines.join("\n");
  }

  // -- Private helpers --------------------------------------------------------

  private alternativeToOption(alt: PlanAlternative): DecisionOption {
    const hasBlockingConstraint = alt.constraints.some(c => c.blocking);
    const hasUnmetDep = alt.dependencies.some(d => d.required && d.status === "unmet");
    const hasBlockingApproval = alt.approvalRequirements.some(a => a.required && a.blocking);

    return buildDecisionOption({
      sourceAlternativeId: alt.alternativeId,
      title: alt.title,
      description: alt.description,
      strategy: alt.strategy,
      score: alt.score,
      feasible: !hasBlockingConstraint && !hasUnmetDep,
      blocked: hasBlockingConstraint,
      requiresApproval: hasBlockingApproval,
      expectedImpact: alt.expectedImpact,
      costSummary: alt.costs.map(c => `${c.description} (${c.amount} ${c.unit})`).join("; ") || "Sin costos declarados",
      benefitSummary: alt.benefits.map(b => b.description).join("; ") || "Sin beneficios declarados",
      riskSummary: alt.risks.map(r => `${r.title} (p:${r.probability}%, i:${r.impact})`).join("; ") || "Sin riesgos declarados",
      constraints: alt.constraints.map(c => `${c.type}: ${c.description}${c.blocking ? " [BLOQUEANTE]" : ""}`),
      dependencies: alt.dependencies.map(d => `${d.type}: ${d.description} (${d.status})`),
    });
  }

  private extractCriterionValue(key: string, opt: DecisionOption, ctx: DecisionContext): number {
    switch (key) {
      case "benefit": {
        // From plan: count benefits, or use metrics
        const benefitCount = opt.benefitSummary === "Sin beneficios declarados" ? 0 : opt.benefitSummary.split(";").length;
        return Math.min(100, benefitCount * 25 + 20);
      }
      case "cost": {
        // Lower is better (will be inverted by direction=minimize)
        const hasCosts = opt.costSummary !== "Sin costos declarados";
        return hasCosts ? 40 : 10;
      }
      case "risk": {
        const hasRisks = opt.riskSummary !== "Sin riesgos declarados";
        return hasRisks ? 50 : 10;
      }
      case "speed": {
        // Strategies with fewer steps or "wait" are slower
        if (opt.strategy === "do_nothing" || opt.strategy === "wait_for_production") return 20;
        if (opt.strategy === "transfer_inventory") return 50;
        if (opt.strategy === "contact_vendor" || opt.strategy === "contact_customer") return 80;
        if (opt.strategy === "remove_portfolio_sample") return 85;
        if (opt.strategy === "review_data") return 90;
        return 60;
      }
      case "feasibility":
        return opt.blocked ? 5 : opt.feasible ? 80 : 40;
      case "confidence":
        return opt.score > 0 ? Math.min(100, opt.score + 10) : 50;
      case "approval_complexity":
        return opt.requiresApproval ? 60 : 10;
      case "customer_impact": {
        if (opt.strategy === "contact_customer") return 90;
        if (opt.strategy === "contact_vendor") return 70;
        if (opt.strategy === "escalate_to_management") return 60;
        if (opt.strategy === "do_nothing") return 20;
        return 50;
      }
      case "operational_effort": {
        if (opt.strategy === "do_nothing") return 5;
        if (opt.strategy === "wait_for_production") return 15;
        if (opt.strategy === "review_data") return 30;
        if (opt.strategy === "transfer_inventory") return 60;
        return 40;
      }
      case "strategic_alignment":
        return 50; // Neutral without additional context
      default:
        return 50;
    }
  }
}
