// AGENTIK-EXECUTIVE-GOVERNANCE-01 — Phase 4: Rule Engine

import type {
  GovernanceRule,
  GovernanceRuleType,
  GovernanceDomain,
  GovernancePriorityLevel,
} from "./executive-governance-types";
import { generateRuleId } from "./executive-governance-identity";

export interface RawRuleInput {
  readonly policyId:    string;
  readonly title:       string;
  readonly description: string;
  readonly type:        GovernanceRuleType;
  readonly domain:      GovernanceDomain;
  readonly condition:   string;
  readonly consequence: string;
  readonly priority:    GovernancePriorityLevel;
  readonly evidenceIds?: string[];
}

export interface RuleEvaluationResult {
  readonly ruleId:      string;
  readonly triggered:   boolean;
  readonly consequence: string;
  readonly severity:    GovernancePriorityLevel;
  readonly details:     string;
}

export function buildRule(orgSlug: string, input: RawRuleInput): GovernanceRule {
  try {
    return {
      id:          generateRuleId(),
      orgSlug,
      policyId:    input.policyId,
      title:       input.title,
      description: input.description,
      type:        input.type,
      domain:      input.domain,
      condition:   input.condition,
      consequence: input.consequence,
      priority:    input.priority,
      isActive:    true,
      evidenceIds: input.evidenceIds ?? [],
      createdAt:   new Date().toISOString(),
    };
  } catch {
    return buildEmptyRule(orgSlug, input.policyId ?? "unknown");
  }
}

export function buildRules(orgSlug: string, inputs: RawRuleInput[]): GovernanceRule[] {
  try {
    return inputs.map((i) => buildRule(orgSlug, i));
  } catch {
    return [];
  }
}

export function validateRule(rule: GovernanceRule): { valid: boolean; errors: string[] } {
  try {
    const errors: string[] = [];
    if (!rule.title || rule.title.length === 0) errors.push("Regla sin título");
    if (!rule.condition || rule.condition.length === 0) errors.push("Condición no definida");
    if (!rule.consequence || rule.consequence.length === 0) errors.push("Consecuencia no definida");
    if (!rule.policyId) errors.push("Regla sin política asociada");
    return { valid: errors.length === 0, errors };
  } catch {
    return { valid: false, errors: ["Error al validar regla"] };
  }
}

export function evaluateRule(
  rule: GovernanceRule,
  context: Record<string, unknown>
): RuleEvaluationResult {
  try {
    // Deterministic evaluation based on rule type
    let triggered = false;
    let details   = "";

    switch (rule.type) {
      case "MANDATORY":
        triggered = true;
        details   = `Regla obligatoria activada: ${rule.condition}`;
        break;
      case "ESCALATION_TRIGGER":
        triggered = true;
        details   = `Escalonado por: ${rule.condition}`;
        break;
      case "PROHIBITIVE":
        triggered = context["isProhibited"] === true;
        details   = triggered ? `Acción prohibida: ${rule.condition}` : "No aplica";
        break;
      case "CONDITIONAL":
        triggered = context["conditionMet"] === true;
        details   = triggered ? `Condición cumplida: ${rule.condition}` : "Condición no cumplida";
        break;
      case "ADVISORY":
        triggered = false;
        details   = `Consejo aplicable: ${rule.condition}`;
        break;
    }

    return {
      ruleId:      rule.id,
      triggered,
      consequence: triggered ? rule.consequence : "Sin acción requerida",
      severity:    rule.priority,
      details,
    };
  } catch {
    return {
      ruleId:      rule.id,
      triggered:   false,
      consequence: "Error en evaluación de regla",
      severity:    "LOW",
      details:     "Error al evaluar regla",
    };
  }
}

export function evaluateRules(
  rules: GovernanceRule[],
  context: Record<string, unknown>
): RuleEvaluationResult[] {
  try {
    return rules.map((r) => evaluateRule(r, context));
  } catch {
    return [];
  }
}

export function getTriggeredRules(results: RuleEvaluationResult[]): RuleEvaluationResult[] {
  try {
    return results.filter((r) => r.triggered);
  } catch {
    return [];
  }
}

export function rankRules(rules: GovernanceRule[]): GovernanceRule[] {
  try {
    const order: Record<GovernancePriorityLevel, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
    return [...rules].sort((a, b) => (order[a.priority] ?? 2) - (order[b.priority] ?? 2));
  } catch {
    return rules;
  }
}

function buildEmptyRule(orgSlug: string, policyId: string): GovernanceRule {
  return {
    id:          generateRuleId(),
    orgSlug,
    policyId,
    title:       "Regla no disponible",
    description: "",
    type:        "ADVISORY",
    domain:      "CROSS_DOMAIN",
    condition:   "",
    consequence: "",
    priority:    "LOW",
    isActive:    false,
    evidenceIds: [],
    createdAt:   new Date().toISOString(),
  };
}
