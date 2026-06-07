// AGENTIK-INTELLIGENCE-AGENT-LEARNING-FRAMEWORK-01
// Tenant learning profile — per-tenant learning configuration and state

import type {
  TenantLearningProfile,
  LearningDomain,
  LearningPattern,
  LearningEvent,
} from "./learning-types";

const DEFAULT_PROFILE: Omit<
  TenantLearningProfile,
  "orgSlug" | "lastLearningAt"
> = {
  riskTolerance: "MEDIUM",
  decisionStyle: "BALANCED",
  learningMaturity: "EARLY",
  totalEvents: 0,
  totalPatterns: 0,
  activeDomains: [],
  confidenceScore: 0.5,
  metadata: {},
};

export function createTenantLearningProfile(
  orgSlug: string,
  overrides?: Partial<
    Pick<
      TenantLearningProfile,
      "riskTolerance" | "decisionStyle" | "learningMaturity" | "metadata"
    >
  >
): TenantLearningProfile {
  return {
    ...DEFAULT_PROFILE,
    orgSlug,
    ...(overrides ?? {}),
  };
}

export function updateTenantProfile(
  profile: TenantLearningProfile,
  events: LearningEvent[],
  patterns: LearningPattern[]
): TenantLearningProfile {
  const activeDomains = Array.from(
    new Set([...profile.activeDomains, ...events.map((e) => e.domain)])
  ) as LearningDomain[];

  const activePatternCount = patterns.filter(
    (p) => p.status === "ACTIVE" || p.status === "REINFORCED"
  ).length;

  const totalEvents = profile.totalEvents + events.length;
  const totalPatterns = patterns.length;

  // Compute maturity
  const learningMaturity = computeMaturity(totalEvents, activePatternCount);

  // Compute aggregate confidence from active patterns
  const confidenceScore =
    activePatternCount > 0
      ? patterns
          .filter((p) => p.status === "ACTIVE" || p.status === "REINFORCED")
          .reduce((sum, p) => sum + p.confidenceScore, 0) / activePatternCount
      : profile.confidenceScore;

  return {
    ...profile,
    totalEvents,
    totalPatterns,
    activeDomains,
    learningMaturity,
    confidenceScore: Math.max(0, Math.min(1, confidenceScore)),
    lastLearningAt: new Date().toISOString(),
  };
}

function computeMaturity(
  totalEvents: number,
  activePatterns: number
): TenantLearningProfile["learningMaturity"] {
  if (totalEvents >= 100 && activePatterns >= 10) return "ADVANCED";
  if (totalEvents >= 30 && activePatterns >= 5) return "MATURE";
  if (totalEvents >= 10 && activePatterns >= 2) return "DEVELOPING";
  return "EARLY";
}

export function getConfidenceMultiplier(profile: TenantLearningProfile): number {
  const maturityBoost: Record<TenantLearningProfile["learningMaturity"], number> = {
    EARLY: 1.0,
    DEVELOPING: 1.05,
    MATURE: 1.1,
    ADVANCED: 1.15,
  };
  const riskFactor: Record<TenantLearningProfile["riskTolerance"], number> = {
    LOW: 0.9,
    MEDIUM: 1.0,
    HIGH: 1.1,
  };
  return maturityBoost[profile.learningMaturity] * riskFactor[profile.riskTolerance];
}

export function isProfileMature(profile: TenantLearningProfile): boolean {
  return (
    profile.learningMaturity === "MATURE" ||
    profile.learningMaturity === "ADVANCED"
  );
}
