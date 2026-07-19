// AGENTIK-BOARD-INTELLIGENCE-01 — Phase 25: Tenant Profile Integration

export interface BoardTenantProfile {
  readonly orgSlug:             string;
  readonly boardSize:           number;
  readonly governanceMaturity:  "LOW" | "MEDIUM" | "HIGH";
  readonly riskTolerance:       "CONSERVATIVE" | "MODERATE" | "AGGRESSIVE";
  readonly industryContext:     string;
  readonly escalationThreshold: number;   // 0–1 agreement score below which to escalate
}

const DEFAULT_BOARD_TENANT_PROFILE: Omit<BoardTenantProfile, "orgSlug"> = {
  boardSize:            5,
  governanceMaturity:   "MEDIUM",
  riskTolerance:        "MODERATE",
  industryContext:      "General",
  escalationThreshold:  0.40,
};

const _tenantRegistry = new Map<string, BoardTenantProfile>();

export function registerBoardTenantProfile(profile: BoardTenantProfile): void {
  _tenantRegistry.set(profile.orgSlug, profile);
}

export function getBoardTenantProfile(orgSlug: string): BoardTenantProfile {
  return _tenantRegistry.get(orgSlug) ?? { orgSlug, ...DEFAULT_BOARD_TENANT_PROFILE };
}

export function shouldEscalateToBoard(orgSlug: string, riskScore: number): boolean {
  try {
    const profile = getBoardTenantProfile(orgSlug);
    if (profile.riskTolerance === "CONSERVATIVE") return riskScore > 0.40;
    if (profile.riskTolerance === "AGGRESSIVE")   return riskScore > 0.75;
    return riskScore > profile.escalationThreshold;
  } catch {
    return riskScore > 0.60;
  }
}

export function getBoardGovernanceAdjustment(orgSlug: string): number {
  try {
    const profile = getBoardTenantProfile(orgSlug);
    const maturityBoost: Record<string, number> = { LOW: -0.05, MEDIUM: 0, HIGH: 0.05 };
    return maturityBoost[profile.governanceMaturity] ?? 0;
  } catch {
    return 0;
  }
}
