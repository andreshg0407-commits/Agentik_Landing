// AGENTIK-INTELLIGENCE-AGENT-LEARNING-FRAMEWORK-01
// Agent learning profiles — per-agent learning configuration and state

import type { AgentLearningProfile, LearningDomain } from "./learning-types";

// ── Built-in agent profiles ───────────────────────────────────────────────────

const AGENT_DOMAIN_MAP: Record<string, LearningDomain[]> = {
  luca: ["MARKETING", "COMMERCIAL", "OPERATIONS"],
  diego: ["FINANCE", "COMPLIANCE", "EXECUTIVE"],
  mila: ["COMMERCIAL", "OPERATIONS", "EXECUTIVE"],
  laura: ["MARKETING", "COMMERCIAL", "OPERATIONS"],
  david: ["FINANCE", "COMPLIANCE", "CROSS_MODULE"],
  sofia: ["OPERATIONS", "CROSS_MODULE", "EXECUTIVE"],
  pablo: ["MARKETING", "COMMERCIAL", "CROSS_MODULE"],
};

const AGENT_DISPLAY_NAMES: Record<string, string> = {
  luca: "Luca",
  diego: "Diego",
  mila: "Mila",
  laura: "Laura",
  david: "David",
  sofia: "Sofía",
  pablo: "Pablo",
};

export function createAgentLearningProfile(
  agentId: string,
  orgSlug: string
): AgentLearningProfile {
  const domains = AGENT_DOMAIN_MAP[agentId] ?? ["CROSS_MODULE"];
  const displayName = AGENT_DISPLAY_NAMES[agentId] ?? agentId;
  return {
    agentId,
    orgSlug,
    displayName,
    domains,
    totalEvents: 0,
    positiveOutcomes: 0,
    negativeOutcomes: 0,
    activePatterns: 0,
    confidenceScore: 0.5,
    metadata: {},
  };
}

export function updateAgentProfile(
  profile: AgentLearningProfile,
  positiveOutcomeDelta: number,
  negativeOutcomeDelta: number,
  patternsDelta: number,
  newConfidenceScore: number
): AgentLearningProfile {
  return {
    ...profile,
    totalEvents: profile.totalEvents + positiveOutcomeDelta + negativeOutcomeDelta,
    positiveOutcomes: profile.positiveOutcomes + positiveOutcomeDelta,
    negativeOutcomes: profile.negativeOutcomes + negativeOutcomeDelta,
    activePatterns: Math.max(0, profile.activePatterns + patternsDelta),
    confidenceScore: Math.max(0, Math.min(1, newConfidenceScore)),
    lastLearningAt: new Date().toISOString(),
  };
}

export function getAgentDomains(agentId: string): LearningDomain[] {
  return AGENT_DOMAIN_MAP[agentId] ?? ["CROSS_MODULE"];
}

export function isAgentDomainCompatible(
  agentId: string,
  domain: LearningDomain
): boolean {
  const domains = AGENT_DOMAIN_MAP[agentId] ?? [];
  return domains.includes(domain) || domains.includes("CROSS_MODULE");
}

export function listKnownAgentIds(): string[] {
  return Object.keys(AGENT_DOMAIN_MAP);
}

export function computeAgentSuccessRate(profile: AgentLearningProfile): number {
  const total = profile.positiveOutcomes + profile.negativeOutcomes;
  if (total === 0) return 0.5;
  return profile.positiveOutcomes / total;
}
