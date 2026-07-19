/**
 * lib/copilot/intelligence/reasoning/cross-domain-context.ts
 *
 * AGENTIK-COPILOT-INTELLIGENCE-02
 * Reasoning Engine — Cross-Domain Context
 *
 * Builds a unified context structure from signals across all business domains.
 * Finance, Commercial, Marketing, Collections, Executive Brain, Memory, Playbooks.
 *
 * No Prisma. No server-only. Pure domain data.
 */

import type {
  ReasoningCategory,
  ReasoningSignal,
  ReasoningConfidence,
} from "./reasoning-types";
import { scoreToConfidence } from "./reasoning-types";

// ── Domain Signal Set ──────────────────────────────────────────────────────────

/** Signal data for a single business domain. */
export interface DomainSignalSet {
  domain:        ReasoningCategory;
  signals:       ReasoningSignal[];
  dataAvailable: boolean;
  confidence:    ReasoningConfidence;
  lastUpdated:   string;
}

// ── Context Summaries (from integrated systems) ────────────────────────────────

/** Summarized Memory Engine context — no raw content, just metadata. */
export interface MemoryContextSummary {
  available:  boolean;
  entryCount: number;
  topEntries: Array<{
    id:         string;
    title:      string;
    type:       string;
    importance: string;
  }>;
}

/** Summarized Playbook context — no raw content, just metadata. */
export interface PlaybookContextSummary {
  available:     boolean;
  playbookCount: number;
  topPlaybooks:  Array<{
    id:       string;
    title:    string;
    category: string;
    priority: string;
  }>;
}

/** Summarized Executive Brain context — no raw content, just metadata. */
export interface ExecutiveBrainContextSummary {
  available:            boolean;
  signalCount:          number;
  criticalSignalCount:  number;
  topSignals:           Array<{
    id:       string;
    title:    string;
    severity: string;
    category: string;
  }>;
}

// ── Cross-Domain Context ───────────────────────────────────────────────────────

/**
 * CrossDomainContext — the unified context for a reasoning run.
 * Built from all available domain signals + integration summaries.
 */
export interface CrossDomainContext {
  id:                    string;
  orgSlug:               string;
  queryId:               string;
  domains:               ReasoningCategory[];
  signalSets:            DomainSignalSet[];
  memoryContext?:        MemoryContextSummary;
  playbookContext?:      PlaybookContextSummary;
  executiveBrainContext?: ExecutiveBrainContextSummary;
  builtAt:               string;
  totalSignalCount:      number;
  isMultiDomain:         boolean;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

let _ctxCounter = 0;
function _id(): string {
  return `cdc_${Date.now()}_${(++_ctxCounter % 1_000_000).toString().padStart(6, "0")}`;
}

function _domainConfidence(signals: ReasoningSignal[]): ReasoningConfidence {
  if (signals.length === 0) return "LOW";
  const highCount = signals.filter(s => s.confidence === "HIGH").length;
  const medCount  = signals.filter(s => s.confidence === "MEDIUM").length;
  const score = Math.round(((highCount * 100) + (medCount * 60)) / signals.length);
  return scoreToConfidence(score);
}

// ── buildContext ───────────────────────────────────────────────────────────────

/**
 * buildContext — build a CrossDomainContext from signals.
 *
 * Groups signals by domain, calculates per-domain confidence,
 * and assembles integration summaries.
 *
 * Never throws — returns empty context on error.
 */
export function buildContext(
  orgSlug:  string,
  queryId:  string,
  signals:  ReasoningSignal[],
  opts?: {
    memoryContext?:         MemoryContextSummary;
    playbookContext?:       PlaybookContextSummary;
    executiveBrainContext?: ExecutiveBrainContextSummary;
  },
): CrossDomainContext {
  try {
    const now = new Date().toISOString();

    // Group signals by domain
    const byDomain = new Map<ReasoningCategory, ReasoningSignal[]>();
    for (const signal of signals) {
      if (signal.orgSlug !== orgSlug) continue; // tenant isolation
      const arr = byDomain.get(signal.category) ?? [];
      arr.push(signal);
      byDomain.set(signal.category, arr);
    }

    const signalSets: DomainSignalSet[] = [];
    for (const [domain, domainSignals] of byDomain) {
      signalSets.push({
        domain,
        signals:       domainSignals,
        dataAvailable: domainSignals.length > 0,
        confidence:    _domainConfidence(domainSignals),
        lastUpdated:   domainSignals.reduce(
          (latest, s) => s.timestamp > latest ? s.timestamp : latest,
          now,
        ),
      });
    }

    const activeDomains = signalSets
      .filter(s => s.dataAvailable)
      .map(s => s.domain);

    return {
      id:                     _id(),
      orgSlug,
      queryId,
      domains:                activeDomains,
      signalSets,
      memoryContext:          opts?.memoryContext,
      playbookContext:        opts?.playbookContext,
      executiveBrainContext:  opts?.executiveBrainContext,
      builtAt:                now,
      totalSignalCount:       signals.filter(s => s.orgSlug === orgSlug).length,
      isMultiDomain:          activeDomains.length >= 2,
    };
  } catch {
    // fail-closed
    return {
      id:              _id(),
      orgSlug,
      queryId,
      domains:         [],
      signalSets:      [],
      builtAt:         new Date().toISOString(),
      totalSignalCount: 0,
      isMultiDomain:   false,
    };
  }
}

// ── mergeContexts ──────────────────────────────────────────────────────────────

/**
 * mergeContexts — merge two CrossDomainContexts for the same org.
 * Combines signal sets from both contexts (deduplicates by signal ID).
 * Integration summaries from `b` override `a` when both present.
 */
export function mergeContexts(
  a: CrossDomainContext,
  b: CrossDomainContext,
): CrossDomainContext {
  if (a.orgSlug !== b.orgSlug) {
    // Never merge contexts from different tenants — fail-closed
    return a;
  }

  // Merge signal sets by domain
  const merged = new Map<ReasoningCategory, DomainSignalSet>();

  for (const set of a.signalSets) {
    merged.set(set.domain, { ...set });
  }

  for (const set of b.signalSets) {
    const existing = merged.get(set.domain);
    if (existing) {
      // Deduplicate signals by ID
      const existingIds = new Set(existing.signals.map(s => s.id));
      const newSignals  = set.signals.filter(s => !existingIds.has(s.id));
      const combined    = [...existing.signals, ...newSignals];
      merged.set(set.domain, {
        ...existing,
        signals:       combined,
        confidence:    _domainConfidence(combined),
        lastUpdated:   set.lastUpdated > existing.lastUpdated
          ? set.lastUpdated
          : existing.lastUpdated,
      });
    } else {
      merged.set(set.domain, { ...set });
    }
  }

  const signalSets    = Array.from(merged.values());
  const activeDomains = signalSets.filter(s => s.dataAvailable).map(s => s.domain);
  const totalSignals  = signalSets.reduce((sum, s) => sum + s.signals.length, 0);

  return {
    id:                     _id(),
    orgSlug:                a.orgSlug,
    queryId:                a.queryId,
    domains:                activeDomains,
    signalSets,
    memoryContext:          b.memoryContext         ?? a.memoryContext,
    playbookContext:        b.playbookContext        ?? a.playbookContext,
    executiveBrainContext:  b.executiveBrainContext  ?? a.executiveBrainContext,
    builtAt:                new Date().toISOString(),
    totalSignalCount:       totalSignals,
    isMultiDomain:          activeDomains.length >= 2,
  };
}

// ── validateContext ────────────────────────────────────────────────────────────

/**
 * validateContext — structural validation of a CrossDomainContext.
 * Returns errors without throwing.
 */
export function validateContext(
  ctx: CrossDomainContext,
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!ctx.orgSlug) errors.push("orgSlug is required");
  if (!ctx.queryId) errors.push("queryId is required");
  if (!ctx.id)      errors.push("id is required");

  // Verify all signals belong to the context's org
  for (const set of ctx.signalSets) {
    for (const signal of set.signals) {
      if (signal.orgSlug !== ctx.orgSlug) {
        errors.push(`Cross-tenant signal detected: signal ${signal.id} belongs to ${signal.orgSlug}`);
      }
    }
  }

  // Verify domain set domains match their signals' categories
  for (const set of ctx.signalSets) {
    for (const signal of set.signals) {
      if (signal.category !== set.domain) {
        errors.push(`Signal category mismatch in domain set ${set.domain}: signal ${signal.id} has category ${signal.category}`);
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

// ── getSignalsForDomain ────────────────────────────────────────────────────────

/**
 * getSignalsForDomain — extract all signals for a specific domain from context.
 */
export function getSignalsForDomain(
  ctx:    CrossDomainContext,
  domain: ReasoningCategory,
): ReasoningSignal[] {
  return ctx.signalSets.find(s => s.domain === domain)?.signals ?? [];
}

/**
 * getAllSignals — flatten all signals from all domain sets.
 */
export function getAllSignals(ctx: CrossDomainContext): ReasoningSignal[] {
  return ctx.signalSets.flatMap(s => s.signals);
}
