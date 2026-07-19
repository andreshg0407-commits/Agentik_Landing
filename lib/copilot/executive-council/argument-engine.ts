// AGENTIK-EXECUTIVE-COUNCIL-01 — Phase 13: Argument Engine
// Extracts and classifies cross-perspective arguments for council deliberation.

import type { ExecutiveArgument, ExecutiveOpinion, CouncilArgumentType, CouncilArgumentStrength } from "./executive-council-types";
import { newArgumentId } from "./executive-council-identity";

export interface ArgumentAnalysis {
  readonly supportArguments:  ExecutiveArgument[];
  readonly opposeArguments:   ExecutiveArgument[];
  readonly qualifyArguments:  ExecutiveArgument[];
  readonly clarifyArguments:  ExecutiveArgument[];
  readonly strongArguments:   ExecutiveArgument[];
  readonly totalArguments:    number;
  readonly supportRatio:      number; // 0–1
  readonly oppositionRatio:   number; // 0–1
}

export function analyzeArguments(opinions: ExecutiveOpinion[]): ArgumentAnalysis {
  try {
    const allArgs = opinions.flatMap((o) => o.arguments);

    const supportArguments  = allArgs.filter((a) => a.type === "SUPPORT");
    const opposeArguments   = allArgs.filter((a) => a.type === "OPPOSE");
    const qualifyArguments  = allArgs.filter((a) => a.type === "QUALIFY");
    const clarifyArguments  = allArgs.filter((a) => a.type === "CLARIFY");
    const strongArguments   = allArgs.filter((a) => a.strength === "STRONG");
    const totalArguments    = allArgs.length;

    const supportRatio    = totalArguments === 0 ? 0 : supportArguments.length / totalArguments;
    const oppositionRatio = totalArguments === 0 ? 0 : opposeArguments.length / totalArguments;

    return {
      supportArguments, opposeArguments, qualifyArguments, clarifyArguments,
      strongArguments, totalArguments, supportRatio, oppositionRatio,
    };
  } catch {
    return {
      supportArguments: [], opposeArguments: [], qualifyArguments: [],
      clarifyArguments: [], strongArguments: [], totalArguments: 0,
      supportRatio: 0, oppositionRatio: 0,
    };
  }
}

export function buildSynthesisArgument(
  orgSlug:    string,
  opinionId:  string,
  type:       CouncilArgumentType,
  claim:      string,
  rationale:  string,
  strength:   CouncilArgumentStrength,
  evidenceIds: string[]
): ExecutiveArgument {
  return {
    id:          newArgumentId(),
    opinionId,
    type,
    claim,
    rationale,
    strength,
    evidenceIds,
    metadata:    { source: "SYNTHESIS" },
  };
}

export function getStrongestOppositions(opinions: ExecutiveOpinion[], limit = 3): ExecutiveArgument[] {
  return opinions
    .flatMap((o) => o.arguments)
    .filter((a) => a.type === "OPPOSE" && a.strength === "STRONG")
    .slice(0, limit);
}

export function getTopSupportArguments(opinions: ExecutiveOpinion[], limit = 3): ExecutiveArgument[] {
  return opinions
    .flatMap((o) => o.arguments)
    .filter((a) => a.type === "SUPPORT")
    .sort((a, b) => {
      const rank: Record<string, number> = { WEAK: 0, MODERATE: 1, STRONG: 2 };
      return rank[b.strength] - rank[a.strength];
    })
    .slice(0, limit);
}

export function hasBlockingOpposition(opinions: ExecutiveOpinion[]): boolean {
  return opinions.some((o) =>
    o.arguments.some((a) => a.type === "OPPOSE" && a.strength === "STRONG") &&
    o.priority === "CRITICAL"
  );
}
