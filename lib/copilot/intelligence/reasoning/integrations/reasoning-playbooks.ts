/**
 * lib/copilot/intelligence/reasoning/integrations/reasoning-playbooks.ts
 *
 * AGENTIK-COPILOT-INTELLIGENCE-02
 * Reasoning Integration — Playbooks
 *
 * Converts Playbook context into reasoning signals that hypotheses can use.
 * Playbooks provide structured operational knowledge that strengthens or
 * contextualizes hypotheses.
 *
 * Contract:
 *   - Receives PlaybookContext (from lib/copilot/playbooks/playbook-types.ts)
 *   - Returns ReasoningSignal[] — one signal per HIGH/CRITICAL priority playbook
 *   - Returns PlaybookContextSummary for CrossDomainContext
 *
 * No Prisma. No DB calls. Pure adapter logic. Never throws.
 */

import type { ReasoningSignal, ReasoningCategory, ReasoningConfidence } from "../reasoning-types";
import type { PlaybookContextSummary } from "../cross-domain-context";

// ── Input contract ─────────────────────────────────────────────────────────────

export interface PlaybookIntegrationInput {
  orgSlug:   string;
  queryId:   string;
  playbooks: Array<{
    id:       string;
    title:    string;
    category: string;
    priority: string;
    status:   string;
    tags:     string[];
  }>;
}

// ── playbookToReasoningSignals ────────────────────────────────────────────────

/**
 * playbookToReasoningSignals — convert playbooks into reasoning signals.
 *
 * HIGH and CRITICAL priority active playbooks generate signals.
 * Playbook signals indicate that structured operational knowledge is available.
 *
 * Never throws.
 */
export function playbookToReasoningSignals(
  input: PlaybookIntegrationInput,
): ReasoningSignal[] {
  try {
    const signals: ReasoningSignal[] = [];

    for (const pb of input.playbooks) {
      if (pb.status !== "ACTIVE") continue;
      if (pb.priority !== "HIGH" && pb.priority !== "CRITICAL") continue;

      const confidence = pb.priority === "CRITICAL" ? "HIGH" : "MEDIUM";
      const category   = _playbookCategoryToReasoning(pb.category);

      signals.push({
        id:         `pbsig_${pb.id}`,
        orgSlug:    input.orgSlug,
        source:     `playbooks:${pb.category}`,
        category,
        metric:     `playbook:${pb.category}`,
        value:      pb.title,
        direction:  "STABLE",
        confidence,
        timestamp:  new Date().toISOString(),
        tags:       [...pb.tags, "playbook"],
      });
    }

    return signals;
  } catch {
    return [];
  }
}

// ── playbookToContextSummary ──────────────────────────────────────────────────

/**
 * playbookToContextSummary — build a PlaybookContextSummary for CrossDomainContext.
 */
export function playbookToContextSummary(
  input: PlaybookIntegrationInput,
): PlaybookContextSummary {
  const active = input.playbooks.filter(pb => pb.status === "ACTIVE");
  return {
    available:     active.length > 0,
    playbookCount: active.length,
    topPlaybooks:  active.slice(0, 5).map(pb => ({
      id:       pb.id,
      title:    pb.title,
      category: pb.category,
      priority: pb.priority,
    })),
  };
}

/**
 * getRelevantPlaybooks — filter playbooks to those relevant to specific domains.
 */
export function getRelevantPlaybooks(
  input:   PlaybookIntegrationInput,
  domains: ReasoningCategory[],
): PlaybookIntegrationInput["playbooks"] {
  const domainCategories = new Set(domains.map(d => _reasoningToPlaybookCategory(d)));
  return input.playbooks.filter(pb =>
    pb.status === "ACTIVE" && domainCategories.has(pb.category),
  );
}

// ── Internal helpers ───────────────────────────────────────────────────────────

function _playbookCategoryToReasoning(category: string): ReasoningCategory {
  const map: Record<string, ReasoningCategory> = {
    SALES:            "COMMERCIAL",
    MARKETING:        "MARKETING",
    FINANCE:          "FINANCIAL",
    COLLECTIONS:      "COLLECTIONS",
    OPERATIONS:       "OPERATIONS",
    CUSTOMER_SERVICE: "COMMERCIAL",
    EXECUTIVE:        "EXECUTIVE",
  };
  return map[category] ?? "EXECUTIVE";
}

function _reasoningToPlaybookCategory(domain: ReasoningCategory): string {
  const map: Record<ReasoningCategory, string> = {
    COMMERCIAL:  "SALES",
    MARKETING:   "MARKETING",
    FINANCIAL:   "FINANCE",
    COLLECTIONS: "COLLECTIONS",
    OPERATIONS:  "OPERATIONS",
    EXECUTIVE:   "EXECUTIVE",
    MULTI_DOMAIN: "EXECUTIVE",
  };
  return map[domain] ?? "EXECUTIVE";
}
