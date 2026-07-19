// AGENTIK-EXECUTIVE-GOVERNANCE-01 — Phase 28: Board Intelligence Integration

export interface GovernanceBoardContext {
  readonly orgSlug:      string;
  readonly boardItems:   string[];
  readonly boardBoost:   number; // 0–1
  readonly hasBoard:     boolean;
}

export interface BoardIntelligenceItem {
  readonly title:      string;
  readonly priority?:  string;
  readonly domain?:    string;
}

export function buildGovernanceBoardContext(
  orgSlug: string,
  boardItems?: BoardIntelligenceItem[]
): GovernanceBoardContext {
  try {
    const active = (boardItems ?? []).filter((b) => b.title && b.title.length > 0);
    const items  = active.slice(0, 5).map((b) => b.title);
    const boost  = Math.min(0.10, items.length * 0.02);
    return {
      orgSlug,
      boardItems: items,
      boardBoost: boost,
      hasBoard:   items.length > 0,
    };
  } catch {
    return { orgSlug, boardItems: [], boardBoost: 0, hasBoard: false };
  }
}
