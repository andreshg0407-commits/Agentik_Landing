/**
 * decision-registry.ts
 *
 * BUSINESS-DECISION-ENGINE-01
 * Decision policy registry — pluggable selection strategies.
 *
 * Policies adjust criterion weights to favor different outcomes.
 *
 * No Prisma. No React. No AI. No UI. Pure domain types.
 */

import type { DecisionPolicy, CriterionDirection } from "./decision-types";
import type { DecisionCriterionKey } from "./decision-criteria";
import { DEFAULT_CRITERIA_WEIGHTS } from "./decision-criteria";

// -- Policy Config ------------------------------------------------------------

/** Configuration for a decision policy. */
export interface DecisionPolicyConfig {
  /** Policy name. */
  name: DecisionPolicy;
  /** Human-readable description. */
  description: string;
  /** Criterion weights for this policy. */
  criteriaWeights: Record<string, { weight: number; direction: CriterionDirection; label: string }>;
}

// -- Registry -----------------------------------------------------------------

/** In-memory decision policy registry. */
export class DecisionPolicyRegistry {
  private policies = new Map<string, DecisionPolicyConfig>();

  /** Register a policy. */
  register(policy: DecisionPolicyConfig): void {
    this.policies.set(policy.name, policy);
  }

  /** Register multiple policies. */
  registerAll(policies: DecisionPolicyConfig[]): void {
    for (const p of policies) this.register(p);
  }

  /** Get a policy by name. */
  get(name: string): DecisionPolicyConfig | undefined {
    return this.policies.get(name);
  }

  /** List all policies. */
  list(): DecisionPolicyConfig[] {
    return Array.from(this.policies.values());
  }

  /** Total registered policies. */
  size(): number {
    return this.policies.size;
  }

  /** Clear all policies. */
  clear(): void {
    this.policies.clear();
  }
}

// -- Helper: adjust weights ---------------------------------------------------

function adjustWeights(
  overrides: Partial<Record<DecisionCriterionKey, number>>,
): Record<string, { weight: number; direction: CriterionDirection; label: string }> {
  const result = { ...DEFAULT_CRITERIA_WEIGHTS };
  for (const [key, weight] of Object.entries(overrides)) {
    if (key in result) {
      (result as any)[key] = { ...(result as any)[key], weight };
    }
  }
  return result;
}

// -- Built-in Policies --------------------------------------------------------

const balancedPolicy: DecisionPolicyConfig = {
  name: "balanced",
  description: "Equilibrio entre beneficio, costo, riesgo y viabilidad",
  criteriaWeights: DEFAULT_CRITERIA_WEIGHTS,
};

const fastestPolicy: DecisionPolicyConfig = {
  name: "fastest",
  description: "Prioriza la alternativa mas rapida",
  criteriaWeights: adjustWeights({ speed: 0.35, benefit: 0.10, cost: 0.08, feasibility: 0.15 }),
};

const lowestRiskPolicy: DecisionPolicyConfig = {
  name: "lowest_risk",
  description: "Prioriza la alternativa con menor riesgo",
  criteriaWeights: adjustWeights({ risk: 0.35, feasibility: 0.20, benefit: 0.10 }),
};

const highestBenefitPolicy: DecisionPolicyConfig = {
  name: "highest_benefit",
  description: "Prioriza la alternativa con mayor beneficio",
  criteriaWeights: adjustWeights({ benefit: 0.35, customer_impact: 0.15, cost: 0.08 }),
};

const lowestCostPolicy: DecisionPolicyConfig = {
  name: "lowest_cost",
  description: "Prioriza la alternativa mas economica",
  criteriaWeights: adjustWeights({ cost: 0.35, operational_effort: 0.15, benefit: 0.10 }),
};

const approvalLightPolicy: DecisionPolicyConfig = {
  name: "approval_light",
  description: "Prioriza alternativas que no requieren aprobacion",
  criteriaWeights: adjustWeights({ approval_complexity: 0.35, speed: 0.20, feasibility: 0.15 }),
};

const customerFirstPolicy: DecisionPolicyConfig = {
  name: "customer_first",
  description: "Prioriza el impacto positivo en clientes",
  criteriaWeights: adjustWeights({ customer_impact: 0.35, benefit: 0.15, risk: 0.15 }),
};

const productionFirstPolicy: DecisionPolicyConfig = {
  name: "production_first",
  description: "Prioriza alineacion con produccion",
  criteriaWeights: adjustWeights({ strategic_alignment: 0.25, feasibility: 0.20, speed: 0.05 }),
};

const commercialFirstPolicy: DecisionPolicyConfig = {
  name: "commercial_first",
  description: "Prioriza impacto comercial y en clientes",
  criteriaWeights: adjustWeights({ customer_impact: 0.25, benefit: 0.25, risk: 0.10 }),
};

/** All built-in policies. */
export const DEFAULT_POLICIES: DecisionPolicyConfig[] = [
  balancedPolicy,
  fastestPolicy,
  lowestRiskPolicy,
  highestBenefitPolicy,
  lowestCostPolicy,
  approvalLightPolicy,
  customerFirstPolicy,
  productionFirstPolicy,
  commercialFirstPolicy,
];
