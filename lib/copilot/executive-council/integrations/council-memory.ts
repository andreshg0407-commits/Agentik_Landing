// AGENTIK-EXECUTIVE-COUNCIL-01 — Phase 22: Strategic Memory Integration

// Minimal shape to avoid deep coupling to strategic-memory sprint
export interface MemorySnapshotSummary {
  readonly orgSlug:         string;
  readonly domain:          string;
  readonly insightCount:    number;
  readonly patternCount:    number;
  readonly confidenceScore: number;
}

export interface MemoryCouncilContext {
  readonly snapshots:    MemorySnapshotSummary[];
  readonly memoryBoost:  number;
  readonly domainsCovered: string[];
}

export function buildMemoryCouncilContext(
  orgSlug:   string,
  snapshots: MemorySnapshotSummary[]
): MemoryCouncilContext {
  try {
    const scoped = snapshots.filter((s) => s.orgSlug === orgSlug);

    const memoryBoost = Math.min(
      0.10,
      scoped.length > 0
        ? 0.04 + Math.min(0.06, scoped.reduce((s, snap) => s + snap.confidenceScore, 0) / Math.max(1, scoped.length) * 0.06)
        : 0
    );

    const domainsCovered = [...new Set(scoped.map((s) => s.domain))];

    return { snapshots: scoped, memoryBoost, domainsCovered };
  } catch {
    return { snapshots: [], memoryBoost: 0, domainsCovered: [] };
  }
}

export function getMemoryInsightCount(
  orgSlug:   string,
  snapshots: MemorySnapshotSummary[]
): number {
  return snapshots
    .filter((s) => s.orgSlug === orgSlug)
    .reduce((sum, s) => sum + s.insightCount, 0);
}
