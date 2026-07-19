/**
 * lib/copilot/playbooks/playbook-retrieval.ts
 *
 * Agentik — Copilot Playbooks — Retrieval Engine
 * Sprint: AGENTIK-COPILOT-PLAYBOOKS-01
 *
 * Retrieves relevant playbooks for a given orgSlug, intent, or query.
 * Returns PlaybookContext bundles ready to be attached to CopilotResponse.
 *
 * Retrieval strategy (no vectors, no embeddings):
 *   1. CRITICAL + HIGH playbooks always surfaced first.
 *   2. Filtered by category when intent maps to one.
 *   3. Text query match on title + description when query is provided.
 *   4. Tag match when tags are provided.
 *   5. Maximum DEFAULT_LIMIT results returned.
 *
 * Pure domain. No Prisma. No server-only. No React.
 */

import type { PlaybookRepository }  from "./playbook-repository";
import type {
  Playbook,
  PlaybookContext,
  PlaybookCategory,
} from "./playbook-types";
import { sortByPriorityThenDate }   from "./playbook-types";
import {
  globalPlaybookAuditLog,
  auditPlaybookRetrieved,
  auditPlaybookMatched,
} from "./playbook-audit";
import { defaultPlaybookRepository } from "./in-memory-playbook-repository";
import type { CopilotIntent }       from "../copilot-types";

// ── Intent → Category mapping ─────────────────────────────────────────────────

const INTENT_CATEGORY: Partial<Record<CopilotIntent, PlaybookCategory>> = {
  FINANCE:      "FINANCE",
  MARKETING:    "MARKETING",
  COMMERCIAL:   "SALES",
  COLLECTIONS:  "COLLECTIONS",
  MULTI_DOMAIN: "EXECUTIVE",
};

// ── Defaults ──────────────────────────────────────────────────────────────────

const DEFAULT_LIMIT       = 5;
const MAX_FETCH           = 100;

// ── Core retrieval functions ──────────────────────────────────────────────────

/**
 * Retrieve playbooks relevant to the given orgSlug and Copilot intent.
 * Maps intent to a category and returns ACTIVE playbooks ordered by priority.
 *
 * Used as the primary playbook context for the Copilot pipeline.
 */
export async function getRelevantPlaybooks(
  orgSlug: string,
  intent:  CopilotIntent,
  repo:    PlaybookRepository = defaultPlaybookRepository,
): Promise<PlaybookContext> {
  const category = INTENT_CATEGORY[intent];
  const limit    = DEFAULT_LIMIT;

  // Fetch CRITICAL/HIGH playbooks regardless of category (always relevant)
  const criticalRaw = await repo.searchPlaybooks(orgSlug, {
    priority: "CRITICAL",
    status:   "ACTIVE",
    limit:    3,
  });
  const highRaw = await repo.searchPlaybooks(orgSlug, {
    priority: "HIGH",
    status:   "ACTIVE",
    limit:    3,
  });

  // Fetch category-specific playbooks when intent maps to a category
  let categoryRaw: Playbook[] = [];
  if (category) {
    categoryRaw = await repo.findByCategory(orgSlug, category, 5);
  }

  // Merge, deduplicate, sort
  const seen    = new Set<string>();
  const merged: Playbook[] = [];

  for (const p of [...criticalRaw, ...highRaw, ...categoryRaw]) {
    if (!seen.has(p.id)) {
      seen.add(p.id);
      merged.push(p);
    }
  }

  merged.sort(sortByPriorityThenDate);

  const total    = merged.length;
  const playbooks = merged.slice(0, limit);
  const overflow = Math.max(0, total - playbooks.length);

  globalPlaybookAuditLog.push(auditPlaybookRetrieved(
    orgSlug,
    playbooks.length,
    `intent:${intent}`,
  ));

  for (const p of playbooks) {
    globalPlaybookAuditLog.push(auditPlaybookMatched(orgSlug, p.id, p.title, `intent:${intent}`));
  }

  return {
    orgSlug,
    playbooks,
    retrievedAt: new Date().toISOString(),
    overflow,
  };
}

/**
 * Retrieve playbooks for a specific category.
 */
export async function getCategoryPlaybooks(
  orgSlug:  string,
  category: PlaybookCategory,
  limit:    number = DEFAULT_LIMIT,
  repo:     PlaybookRepository = defaultPlaybookRepository,
): Promise<PlaybookContext> {
  const playbooks = await repo.findByCategory(orgSlug, category, Math.min(limit, MAX_FETCH));

  globalPlaybookAuditLog.push(auditPlaybookRetrieved(orgSlug, playbooks.length, `category:${category}`));

  return {
    orgSlug,
    playbooks,
    retrievedAt: new Date().toISOString(),
    overflow:    0,
  };
}

/**
 * Retrieve EXECUTIVE and CRITICAL playbooks.
 * Used for executive-level Copilot context.
 */
export async function getExecutivePlaybooks(
  orgSlug: string,
  repo:    PlaybookRepository = defaultPlaybookRepository,
): Promise<PlaybookContext> {
  const [execRaw, criticalRaw] = await Promise.all([
    repo.findByCategory(orgSlug, "EXECUTIVE", 5),
    repo.searchPlaybooks(orgSlug, { priority: "CRITICAL", status: "ACTIVE", limit: 3 }),
  ]);

  const seen    = new Set<string>();
  const merged: Playbook[] = [];

  for (const p of [...execRaw, ...criticalRaw]) {
    if (!seen.has(p.id)) {
      seen.add(p.id);
      merged.push(p);
    }
  }

  merged.sort(sortByPriorityThenDate);
  const playbooks = merged.slice(0, DEFAULT_LIMIT);

  globalPlaybookAuditLog.push(auditPlaybookRetrieved(orgSlug, playbooks.length, "executive"));

  return {
    orgSlug,
    playbooks,
    retrievedAt: new Date().toISOString(),
    overflow:    0,
  };
}

/**
 * Search playbooks with an arbitrary text query and/or tags.
 */
export async function searchPlaybooks(
  orgSlug: string,
  query?:  string,
  tags?:   string[],
  limit?:  number,
  repo:    PlaybookRepository = defaultPlaybookRepository,
): Promise<PlaybookContext> {
  const playbooks = await repo.searchPlaybooks(orgSlug, {
    query,
    tags,
    status: "ACTIVE",
    limit:  Math.min(limit ?? DEFAULT_LIMIT, MAX_FETCH),
  });

  globalPlaybookAuditLog.push(auditPlaybookRetrieved(orgSlug, playbooks.length, query));

  return {
    orgSlug,
    playbooks,
    retrievedAt: new Date().toISOString(),
    overflow:    0,
  };
}
