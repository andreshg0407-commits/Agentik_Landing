/**
 * signal-engine.ts
 *
 * BUSINESS-SIGNALS-01
 * The Signal Engine contract — the central interface for signal operations.
 *
 * This defines WHAT the Signal Engine can do, not HOW.
 * Implementations will be built in future sprints with persistence,
 * scheduling, and real-time processing.
 *
 * No Prisma. No React. No AI. No UI. Pure domain contracts.
 */

import type { BusinessSignal, MergedSignal, SignalStatus } from "./signal";
import type { SignalCategory } from "./signal-category";
import type { SignalSeverity } from "./signal-severity";
import type { SignalPriority } from "./signal-priority";
import type { SignalSource } from "./signal-source";
import type { SignalEntityRef } from "./signal-types";
import { mergeSignals as mergeSignalsFn } from "./signal-builder";

// -- Query Types ------------------------------------------------------------

/** Filter criteria for finding signals. */
export interface SignalFilter {
  organizationId: string;
  /** Filter by entity ID. */
  entityId?: string;
  /** Filter by entity type. */
  entityType?: string;
  /** Filter by categories. */
  categories?: SignalCategory[];
  /** Filter by severities. */
  severities?: SignalSeverity[];
  /** Filter by priorities. */
  priorities?: SignalPriority[];
  /** Filter by statuses. */
  statuses?: SignalStatus[];
  /** Filter by sources. */
  sources?: SignalSource[];
  /** Minimum confidence threshold (0-100). */
  minConfidence?: number;
  /** Only signals created after this ISO timestamp. */
  createdAfter?: string;
  /** Only signals created before this ISO timestamp. */
  createdBefore?: string;
  /** Only non-expired signals. */
  excludeExpired?: boolean;
  /** Maximum results. */
  limit?: number;
}

/** Grouping key for signal aggregation. */
export type SignalGroupKey = "category" | "severity" | "priority" | "entityType" | "source" | "status";

/** A group of signals sharing a common dimension value. */
export interface SignalGroup {
  key: string;
  value: string;
  count: number;
  signals: BusinessSignal[];
}

/** Result of a deduplication pass. */
export interface DeduplicationResult {
  /** Unique signals (no duplicates). */
  unique: BusinessSignal[];
  /** Merged signals (from duplicates). */
  merged: MergedSignal[];
  /** Total duplicates found. */
  duplicateCount: number;
}

/** Summary of signal engine state for a given organization. */
export interface SignalSummary {
  organizationId: string;
  totalSignals: number;
  byStatus: Record<string, number>;
  byCategory: Record<string, number>;
  bySeverity: Record<string, number>;
  oldestActiveSignal: string | null;
  newestSignal: string | null;
}

// -- Signal Engine Contract -------------------------------------------------

/**
 * The Signal Engine — central interface for all signal operations.
 *
 * Implementations may be in-memory (for testing), database-backed
 * (for production), or event-stream-backed (for real-time).
 */
export interface ISignalEngine {
  // -- Lifecycle -----------------------------------------------------------

  /** Create a new signal. Returns the created signal with assigned ID. */
  createSignal(signal: BusinessSignal): Promise<BusinessSignal>;

  /** Update a signal's status. */
  updateStatus(signalId: string, status: SignalStatus): Promise<BusinessSignal | null>;

  /** Resolve a signal (terminal state). */
  resolveSignal(signalId: string, reason?: string): Promise<BusinessSignal | null>;

  // -- Queries -------------------------------------------------------------

  /** Find signals matching a filter. */
  findSignals(filter: SignalFilter): Promise<BusinessSignal[]>;

  /** Find signals for a specific entity. */
  findByEntity(organizationId: string, entityId: string, entityType?: string): Promise<BusinessSignal[]>;

  /** Find signals for a specific category. */
  findByCategory(organizationId: string, category: SignalCategory): Promise<BusinessSignal[]>;

  /** Get a single signal by ID. */
  getSignal(signalId: string): Promise<BusinessSignal | null>;

  // -- Aggregation ---------------------------------------------------------

  /** Group signals by a dimension. */
  groupSignals(filter: SignalFilter, groupBy: SignalGroupKey): Promise<SignalGroup[]>;

  /** Get a summary of signal state for an organization. */
  getSummary(organizationId: string): Promise<SignalSummary>;

  // -- Deduplication & Merging ---------------------------------------------

  /** Deduplicate signals — find and merge equivalent signals. */
  deduplicateSignals(signals: BusinessSignal[]): DeduplicationResult;

  /** Merge related signals into a compound signal. */
  mergeSignals(signals: BusinessSignal[]): MergedSignal | null;

  // -- Expiration ----------------------------------------------------------

  /** Expire signals whose expiresAt has passed. */
  expireSignals(organizationId: string): Promise<number>;

  // -- Context Building ----------------------------------------------------

  /** Build enriched context for a signal using Knowledge Graph. */
  buildContext(signal: BusinessSignal): Promise<BusinessSignal>;
}

// -- In-Memory Implementation -----------------------------------------------

/**
 * In-memory signal engine for testing and development.
 *
 * Not for production use. No persistence, no concurrency control.
 */
export class InMemorySignalEngine implements ISignalEngine {
  private signals: Map<string, BusinessSignal> = new Map();

  async createSignal(signal: BusinessSignal): Promise<BusinessSignal> {
    this.signals.set(signal.signalId, signal);
    return signal;
  }

  async updateStatus(signalId: string, status: SignalStatus): Promise<BusinessSignal | null> {
    const signal = this.signals.get(signalId);
    if (!signal) return null;
    const updated = { ...signal, status, updatedAt: new Date().toISOString() };
    this.signals.set(signalId, updated);
    return updated;
  }

  async resolveSignal(signalId: string, _reason?: string): Promise<BusinessSignal | null> {
    return this.updateStatus(signalId, "resolved");
  }

  async findSignals(filter: SignalFilter): Promise<BusinessSignal[]> {
    let results = Array.from(this.signals.values())
      .filter(s => s.organizationId === filter.organizationId);

    if (filter.entityId) results = results.filter(s => s.entityId === filter.entityId);
    if (filter.entityType) results = results.filter(s => s.entityType === filter.entityType);
    if (filter.categories?.length) results = results.filter(s => filter.categories!.includes(s.category));
    if (filter.severities?.length) results = results.filter(s => filter.severities!.includes(s.severity));
    if (filter.priorities?.length) results = results.filter(s => filter.priorities!.includes(s.priority));
    if (filter.statuses?.length) results = results.filter(s => filter.statuses!.includes(s.status));
    if (filter.sources?.length) results = results.filter(s => filter.sources!.includes(s.source));
    if (filter.minConfidence != null) results = results.filter(s => s.confidence >= filter.minConfidence!);
    if (filter.createdAfter) results = results.filter(s => s.createdAt >= filter.createdAfter!);
    if (filter.createdBefore) results = results.filter(s => s.createdAt <= filter.createdBefore!);
    if (filter.excludeExpired) {
      const now = new Date().toISOString();
      results = results.filter(s => !s.expiresAt || s.expiresAt > now);
    }
    if (filter.limit) results = results.slice(0, filter.limit);

    return results;
  }

  async findByEntity(organizationId: string, entityId: string, entityType?: string): Promise<BusinessSignal[]> {
    return this.findSignals({ organizationId, entityId, entityType });
  }

  async findByCategory(organizationId: string, category: SignalCategory): Promise<BusinessSignal[]> {
    return this.findSignals({ organizationId, categories: [category] });
  }

  async getSignal(signalId: string): Promise<BusinessSignal | null> {
    return this.signals.get(signalId) ?? null;
  }

  async groupSignals(filter: SignalFilter, groupBy: SignalGroupKey): Promise<SignalGroup[]> {
    const signals = await this.findSignals(filter);
    const groups = new Map<string, BusinessSignal[]>();

    for (const s of signals) {
      const value = s[groupBy] as string;
      const existing = groups.get(value) ?? [];
      existing.push(s);
      groups.set(value, existing);
    }

    return Array.from(groups.entries()).map(([value, sigs]) => ({
      key: groupBy,
      value,
      count: sigs.length,
      signals: sigs,
    }));
  }

  async getSummary(organizationId: string): Promise<SignalSummary> {
    const all = await this.findSignals({ organizationId });
    const byStatus: Record<string, number> = {};
    const byCategory: Record<string, number> = {};
    const bySeverity: Record<string, number> = {};

    for (const s of all) {
      byStatus[s.status] = (byStatus[s.status] ?? 0) + 1;
      byCategory[s.category] = (byCategory[s.category] ?? 0) + 1;
      bySeverity[s.severity] = (bySeverity[s.severity] ?? 0) + 1;
    }

    const active = all.filter(s => s.status === "active" || s.status === "new");
    const sorted = all.sort((a, b) => a.createdAt.localeCompare(b.createdAt));

    return {
      organizationId,
      totalSignals: all.length,
      byStatus,
      byCategory,
      bySeverity,
      oldestActiveSignal: active.length > 0 ? active[0].createdAt : null,
      newestSignal: sorted.length > 0 ? sorted[sorted.length - 1].createdAt : null,
    };
  }

  deduplicateSignals(signals: BusinessSignal[]): DeduplicationResult {
    const groups = new Map<string, BusinessSignal[]>();

    for (const s of signals) {
      const existing = groups.get(s.deduplicationKey) ?? [];
      existing.push(s);
      groups.set(s.deduplicationKey, existing);
    }

    const unique: BusinessSignal[] = [];
    const merged: MergedSignal[] = [];
    let duplicateCount = 0;

    for (const [, group] of groups) {
      if (group.length === 1) {
        unique.push(group[0]);
      } else {
        const m = this.mergeSignals(group);
        if (m) {
          merged.push(m);
          duplicateCount += group.length - 1;
        }
      }
    }

    return { unique, merged, duplicateCount };
  }

  mergeSignals(signals: BusinessSignal[]): MergedSignal | null {
    return mergeSignalsFn(signals);
  }

  async expireSignals(organizationId: string): Promise<number> {
    const now = new Date().toISOString();
    let count = 0;

    for (const [id, s] of this.signals) {
      if (s.organizationId === organizationId && s.expiresAt && s.expiresAt <= now && s.status !== "expired") {
        this.signals.set(id, { ...s, status: "expired", updatedAt: now });
        count++;
      }
    }

    return count;
  }

  async buildContext(signal: BusinessSignal): Promise<BusinessSignal> {
    // In-memory engine returns the signal as-is.
    // Production implementations would enrich via Knowledge Graph.
    return signal;
  }
}
