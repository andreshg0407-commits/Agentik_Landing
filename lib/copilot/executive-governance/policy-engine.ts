// AGENTIK-EXECUTIVE-GOVERNANCE-01 — Phase 3: Policy Engine

import type {
  GovernancePolicy,
  GovernancePolicyType,
  GovernanceDomain,
  GovernancePriorityLevel,
  GovernanceAuthorityLevel,
} from "./executive-governance-types";
import { generatePolicyId } from "./executive-governance-identity";

export interface RawPolicyInput {
  readonly title:          string;
  readonly description:    string;
  readonly type:           GovernancePolicyType;
  readonly domain:         GovernanceDomain;
  readonly priority:       GovernancePriorityLevel;
  readonly isMandatory:    boolean;
  readonly version?:       string;
  readonly threshold?:     number;
  readonly authorityLevel: GovernanceAuthorityLevel;
  readonly evidenceIds?:   string[];
  readonly limitations?:   string[];
}

export function scorePolicy(
  priority: GovernancePriorityLevel,
  isMandatory: boolean,
  evidenceCount: number
): number {
  try {
    const base: Record<GovernancePriorityLevel, number> = {
      CRITICAL: 0.90,
      HIGH:     0.70,
      MEDIUM:   0.50,
      LOW:      0.25,
    };
    const mandatoryBonus = isMandatory ? 0.10 : 0;
    const evidenceBonus  = Math.min(0.05, evidenceCount * 0.01);
    return Math.min(1, (base[priority] ?? 0.50) + mandatoryBonus + evidenceBonus);
  } catch {
    return 0;
  }
}

export function buildPolicy(orgSlug: string, input: RawPolicyInput): GovernancePolicy {
  try {
    return {
      id:             generatePolicyId(),
      orgSlug,
      title:          input.title,
      description:    input.description,
      type:           input.type,
      domain:         input.domain,
      priority:       input.priority,
      isMandatory:    input.isMandatory,
      version:        input.version ?? "1.0.0",
      threshold:      input.threshold,
      authorityLevel: input.authorityLevel,
      evidenceIds:    input.evidenceIds ?? [],
      limitations:    input.limitations ?? [],
      isActive:       true,
      createdAt:      new Date().toISOString(),
    };
  } catch {
    return buildEmptyPolicy(orgSlug);
  }
}

export function validatePolicy(policy: GovernancePolicy): { valid: boolean; errors: string[] } {
  try {
    const errors: string[] = [];
    if (!policy.title || policy.title.length === 0) errors.push("Política sin título");
    if (!policy.description || policy.description.length === 0) errors.push("Política sin descripción");
    if (!policy.authorityLevel) errors.push("Nivel de autoridad no definido");
    return { valid: errors.length === 0, errors };
  } catch {
    return { valid: false, errors: ["Error al validar política"] };
  }
}

export function buildPolicies(orgSlug: string, inputs: RawPolicyInput[]): GovernancePolicy[] {
  try {
    return inputs.map((i) => buildPolicy(orgSlug, i));
  } catch {
    return [];
  }
}

export function rankPolicies(policies: GovernancePolicy[]): GovernancePolicy[] {
  try {
    const order: Record<GovernancePriorityLevel, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
    return [...policies].sort(
      (a, b) => (order[a.priority] ?? 2) - (order[b.priority] ?? 2)
    );
  } catch {
    return policies;
  }
}

export function getMandatoryPolicies(policies: GovernancePolicy[]): GovernancePolicy[] {
  try {
    return policies.filter((p) => p.isMandatory);
  } catch {
    return [];
  }
}

export function getPoliciesByDomain(
  policies: GovernancePolicy[],
  domain: GovernanceDomain
): GovernancePolicy[] {
  try {
    return policies.filter((p) => p.domain === domain);
  } catch {
    return [];
  }
}

export function buildDefaultPolicies(orgSlug: string): GovernancePolicy[] {
  const defaults: RawPolicyInput[] = [
    {
      title:          "Umbral de aprobación financiera",
      description:    "Toda inversión superior al umbral definido requiere aprobación ejecutiva",
      type:           "FINANCIAL_THRESHOLD",
      domain:         "FINANCIAL",
      priority:       "CRITICAL",
      isMandatory:    true,
      version:        "1.0.0",
      threshold:      50000,
      authorityLevel: "EXECUTIVE",
    },
    {
      title:          "Política de conflicto de interés",
      description:    "Declaración obligatoria de conflictos de interés en decisiones estratégicas",
      type:           "CONFLICT_OF_INTEREST",
      domain:         "LEGAL",
      priority:       "HIGH",
      isMandatory:    true,
      version:        "1.0.0",
      authorityLevel: "DIRECTOR",
    },
    {
      title:          "Política de gestión de proveedores",
      description:    "Evaluación y aprobación de proveedores críticos",
      type:           "VENDOR_MANAGEMENT",
      domain:         "OPERATIONAL",
      priority:       "MEDIUM",
      isMandatory:    false,
      version:        "1.0.0",
      authorityLevel: "MANAGER",
    },
    {
      title:          "Política de tolerancia al riesgo",
      description:    "Niveles máximos de riesgo aceptables por dominio",
      type:           "RISK_TOLERANCE",
      domain:         "RISK",
      priority:       "HIGH",
      isMandatory:    true,
      version:        "1.0.0",
      authorityLevel: "EXECUTIVE",
    },
    {
      title:          "Política de revelación de información",
      description:    "Requisitos de divulgación ante reguladores y partes interesadas",
      type:           "DISCLOSURE_POLICY",
      domain:         "REGULATORY",
      priority:       "HIGH",
      isMandatory:    true,
      version:        "1.0.0",
      authorityLevel: "CEO",
    },
  ];
  try {
    return defaults.map((d) => buildPolicy(orgSlug, d));
  } catch {
    return [];
  }
}

function buildEmptyPolicy(orgSlug: string): GovernancePolicy {
  return {
    id:             generatePolicyId(),
    orgSlug,
    title:          "Política no disponible",
    description:    "",
    type:           "APPROVAL_GATE",
    domain:         "CROSS_DOMAIN",
    priority:       "LOW",
    isMandatory:    false,
    version:        "1.0.0",
    authorityLevel: "MANAGER",
    evidenceIds:    [],
    limitations:    [],
    isActive:       false,
    createdAt:      new Date().toISOString(),
  };
}
