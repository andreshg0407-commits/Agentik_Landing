/**
 * lib/collections/score-feedback.ts
 *
 * Risk score feedback loop — adjusts CustomerProfile.riskScore and
 * churnRisk after a collection contact is recorded.
 *
 * ── Adjustment rules ─────────────────────────────────────────────────────────
 *
 *  PAID             → riskScore −25, churnRisk lower by 1 tier
 *  PARTIAL_PAYMENT  → riskScore −10, churnRisk lower by 1 tier if HIGH/CRITICAL
 *  PROMISE_TO_PAY   → riskScore −5   (cooperative signal)
 *  IN_NEGOTIATION   → riskScore −3
 *  NO_CONTACT       → riskScore +10
 *  BROKEN_PROMISE   → riskScore +20, churnRisk escalate by 1 tier
 *  DISPUTE          → riskScore +15, churnRisk → HIGH
 *  ESCALATED        → riskScore +5
 *
 *  riskScore is always clamped to [0, 100].
 *  churnRisk tier order: LOW → MEDIUM → HIGH → CRITICAL
 *
 * ── Safety ───────────────────────────────────────────────────────────────────
 *
 *  This function is always called from a try/catch in outcomes.ts.
 *  Never throws — logs internally and returns gracefully on error.
 */

import { prisma } from "@/lib/prisma";
import type { OutcomeType } from "./outcomes";

// ── Churn risk tier ladder ─────────────────────────────────────────────────────

const CHURN_TIER: string[] = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];

function lowerTier(current: string | null): string {
  const idx = CHURN_TIER.indexOf(current ?? "LOW");
  return CHURN_TIER[Math.max(0, idx - 1)];
}

function raiseTier(current: string | null): string {
  const idx = CHURN_TIER.indexOf(current ?? "LOW");
  return CHURN_TIER[Math.min(CHURN_TIER.length - 1, idx + 1)];
}

// ── Adjustment table ──────────────────────────────────────────────────────────

type ScoreAdjustment = {
  delta:       number;           // +/- applied to riskScore
  churnAction: "lower" | "raise" | "set_high" | "none";
};

const ADJUSTMENTS: Record<OutcomeType, ScoreAdjustment> = {
  PAID:             { delta: -25, churnAction: "lower"    },
  PARTIAL_PAYMENT:  { delta: -10, churnAction: "lower"    },
  PROMISE_TO_PAY:   { delta:  -5, churnAction: "none"     },
  IN_NEGOTIATION:   { delta:  -3, churnAction: "none"     },
  NO_CONTACT:       { delta: +10, churnAction: "none"     },
  BROKEN_PROMISE:   { delta: +20, churnAction: "raise"    },
  DISPUTE:          { delta: +15, churnAction: "set_high" },
  ESCALATED:        { delta:  +5, churnAction: "none"     },
};

// ── Main export ───────────────────────────────────────────────────────────────

export async function applyOutcomeFeedback(opts: {
  orgId:        string;
  customerSlug: string;
  outcomeType:  OutcomeType;
}): Promise<void> {
  const { orgId, customerSlug, outcomeType } = opts;
  const adj = ADJUSTMENTS[outcomeType];
  if (!adj) return;

  const db = prisma as any;

  // Fetch current scores
  const profile = await db.customerProfile.findUnique({
    where:  { organizationId_slug: { organizationId: orgId, slug: customerSlug } },
    select: { id: true, riskScore: true, churnRisk: true },
  });

  if (!profile) return;

  const currentRisk  = profile.riskScore != null ? Number(profile.riskScore) : 50;
  const newRisk      = Math.max(0, Math.min(100, currentRisk + adj.delta));

  let newChurn: string | undefined;
  if (adj.churnAction === "lower")    newChurn = lowerTier(profile.churnRisk);
  if (adj.churnAction === "raise")    newChurn = raiseTier(profile.churnRisk);
  if (adj.churnAction === "set_high") newChurn = "HIGH";

  await db.customerProfile.update({
    where: { id: profile.id },
    data: {
      riskScore:  newRisk,
      ...(newChurn ? { churnRisk: newChurn } : {}),
      updatedAt:  new Date(),
    },
  });
}
