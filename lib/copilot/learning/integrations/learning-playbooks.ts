// AGENTIK-INTELLIGENCE-AGENT-LEARNING-FRAMEWORK-01
// Learning ↔ Playbooks integration adapter

import type { LearningEvent, LearningDomain } from "../learning-types";
import { buildLearningEvent } from "../learning-event-builder";

// Lightweight playbook shape to avoid circular imports
interface PlaybookRef {
  readonly id: string;
  readonly orgSlug: string;
  readonly name: string;
  readonly domain?: string;
  readonly status: string;
  readonly priority?: string;
  readonly effective?: boolean;
  readonly triggerCount?: number;
}

function playbookDomainToLearningDomain(domain?: string): LearningDomain {
  switch ((domain ?? "").toUpperCase()) {
    case "FINANCE":
    case "FINANCIAL":
      return "FINANCE";
    case "COMMERCIAL":
    case "SALES":
      return "COMMERCIAL";
    case "MARKETING":
      return "MARKETING";
    case "OPERATIONS":
      return "OPERATIONS";
    case "EXECUTIVE":
      return "EXECUTIVE";
    case "COMPLIANCE":
      return "COMPLIANCE";
    default:
      return "OPERATIONS";
  }
}

function isHighPriority(priority?: string): boolean {
  const p = (priority ?? "").toUpperCase();
  return p === "CRITICAL" || p === "HIGH";
}

export function playbookToLearningEvent(
  orgSlug: string,
  playbook: PlaybookRef,
  agentId?: string
): LearningEvent | null {
  if (playbook.orgSlug !== orgSlug) {
    throw new Error(
      `Tenant isolation: playbook belongs to "${playbook.orgSlug}", not "${orgSlug}"`
    );
  }

  // Only process ACTIVE playbooks with HIGH/CRITICAL priority
  if (playbook.status.toUpperCase() !== "ACTIVE") return null;
  if (!isHighPriority(playbook.priority)) return null;

  const domain = playbookDomainToLearningDomain(playbook.domain);
  const isEffective = playbook.effective !== false; // Default to effective unless explicitly false
  const triggerCount = playbook.triggerCount ?? 1;
  const confidenceScore = Math.min(0.9, 0.5 + (triggerCount * 0.05));

  return buildLearningEvent({
    orgSlug,
    type: isEffective ? "ACTION_SUCCEEDED" : "ACTION_FAILED",
    source: "PLAYBOOK",
    domain,
    referenceId: playbook.id,
    referenceType: "ACTION",
    confidence: confidenceScore >= 0.75 ? "HIGH" : "MEDIUM",
    confidenceScore,
    agentId,
    metadata: {
      playbookName: playbook.name,
      playbookPriority: playbook.priority,
      playbookTriggerCount: triggerCount,
    },
  });
}

export function buildPlaybookLearningEvents(
  orgSlug: string,
  playbooks: PlaybookRef[],
  agentId?: string
): LearningEvent[] {
  const events: LearningEvent[] = [];

  for (const playbook of playbooks) {
    if (playbook.orgSlug !== orgSlug) continue;
    try {
      const event = playbookToLearningEvent(orgSlug, playbook, agentId);
      if (event) events.push(event);
    } catch {
      // Skip invalid entries — fail graceful
    }
  }

  return events;
}

export function detectObsoletePlaybooks(
  orgSlug: string,
  playbooks: PlaybookRef[]
): PlaybookRef[] {
  return playbooks.filter(
    (p) =>
      p.orgSlug === orgSlug &&
      p.status.toUpperCase() === "ACTIVE" &&
      p.effective === false &&
      (p.triggerCount ?? 0) >= 3
  );
}
