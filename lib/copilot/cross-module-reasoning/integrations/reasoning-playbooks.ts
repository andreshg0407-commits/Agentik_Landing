/**
 * lib/copilot/cross-module-reasoning/integrations/reasoning-playbooks.ts
 *
 * AGENTIK-INTELLIGENCE-CROSS-MODULE-REASONING-01
 * Playbooks Adapter — converts Playbook objects into ReasoningEvidence and signals.
 * No DB. No server-only.
 */

import type { Playbook, PlaybookCategory, PlaybookPriority } from "@/lib/copilot/playbooks/playbook-types";
import type { ReasoningEvidence, ReasoningSignal, ReasoningSourceDomain } from "../cross-module-types";
import { generateCmrId } from "../cross-module-types";

// ── Category → domain ─────────────────────────────────────────────────────────

const CATEGORY_TO_DOMAIN: Record<PlaybookCategory, ReasoningSourceDomain> = {
  SALES:            "COMMERCIAL",
  MARKETING:        "MARKETING",
  FINANCE:          "FINANCE",
  COLLECTIONS:      "COLLECTIONS",
  OPERATIONS:       "EXECUTIVE",
  CUSTOMER_SERVICE: "COMMERCIAL",
  EXECUTIVE:        "EXECUTIVE",
  CUSTOM:           "EXECUTIVE",
};

// ── Priority → strength ───────────────────────────────────────────────────────

const PRIORITY_STRENGTH: Record<PlaybookPriority, number> = {
  CRITICAL: 0.95,
  HIGH:     0.80,
  MEDIUM:   0.60,
  LOW:      0.35,
};

// ── Playbook → ReasoningEvidence ──────────────────────────────────────────────

export function playbookToEvidence(
  orgSlug: string,
  playbook: Playbook,
): ReasoningEvidence {
  if (playbook.orgSlug !== orgSlug) {
    throw new Error(
      `[reasoning-playbooks] Tenant isolation violation: playbook.orgSlug=${playbook.orgSlug} orgSlug=${orgSlug}`,
    );
  }

  return {
    id:          generateCmrId("ev"),
    orgSlug,
    type:        "PLAYBOOK_TRIGGER",
    domain:      CATEGORY_TO_DOMAIN[playbook.category] ?? "EXECUTIVE",
    label:       playbook.title,
    description: playbook.description,
    strength:    PRIORITY_STRENGTH[playbook.priority] ?? 0.5,
    reliability: 0.75,
    sourceRef:   playbook.id,
    sourceType:  "playbook",
    metadata:    {
      playbookId: playbook.id,
      category:   playbook.category,
      priority:   playbook.priority,
      status:     playbook.status,
      tags:       playbook.tags,
      stepCount:  playbook.steps.length,
    },
    collectedAt: playbook.updatedAt,
  };
}

// ── Active playbooks → signals ────────────────────────────────────────────────

export function playbookToSignal(
  orgSlug: string,
  playbook: Playbook,
): ReasoningSignal | null {
  if (playbook.orgSlug !== orgSlug) return null;
  if (playbook.status !== "ACTIVE") return null;
  if (playbook.priority !== "CRITICAL" && playbook.priority !== "HIGH") return null;

  return {
    id:          generateCmrId("sig"),
    orgSlug,
    type:        "EVENT",
    domain:      CATEGORY_TO_DOMAIN[playbook.category] ?? "EXECUTIVE",
    label:       `Playbook activo: ${playbook.title}`,
    description: playbook.description,
    severity:    playbook.priority === "CRITICAL" ? "CRITICAL" : "HIGH",
    confidence:  PRIORITY_STRENGTH[playbook.priority] * 0.6,
    source:      `playbook:${playbook.id}`,
    metadata:    {
      playbookId: playbook.id,
      category:   playbook.category,
      priority:   playbook.priority,
      tags:       playbook.tags,
    },
    detectedAt:  playbook.updatedAt,
  };
}

// ── Batch conversions ─────────────────────────────────────────────────────────

export function playbooksToEvidence(
  orgSlug: string,
  playbooks: Playbook[],
): ReasoningEvidence[] {
  return playbooks
    .filter(p => p.orgSlug === orgSlug && p.status === "ACTIVE")
    .map(p => playbookToEvidence(orgSlug, p));
}

export function playbooksToSignals(
  orgSlug: string,
  playbooks: Playbook[],
): ReasoningSignal[] {
  return playbooks
    .filter(p => p.orgSlug === orgSlug)
    .map(p => playbookToSignal(orgSlug, p))
    .filter((s): s is ReasoningSignal => s !== null);
}

// ── Filters ───────────────────────────────────────────────────────────────────

export function filterActivePlaybooks(playbooks: Playbook[]): Playbook[] {
  return playbooks.filter(p => p.status === "ACTIVE");
}

export function filterPlaybooksByCategory(
  playbooks: Playbook[],
  category: PlaybookCategory,
): Playbook[] {
  return playbooks.filter(p => p.category === category);
}

export function filterCriticalPlaybooks(playbooks: Playbook[]): Playbook[] {
  return playbooks.filter(
    p => p.priority === "CRITICAL" || p.priority === "HIGH",
  );
}
