/**
 * signal-builder.ts
 *
 * BUSINESS-SIGNALS-01
 * Builder functions for constructing Business Signals.
 *
 * Provides a clean API for creating signals from different engines.
 * Domain-specific builders (InventorySignalBuilder, ProductionSignalBuilder, etc.)
 * will be implemented in future sprints as thin wrappers over buildSignal().
 *
 * No Prisma. No React. No AI. No UI. Pure domain types.
 */

import type { SignalCategory } from "./signal-category";
import type { SignalSeverity } from "./signal-severity";
import type { SignalPriority } from "./signal-priority";
import type { SignalSource } from "./signal-source";
import type { SignalEvidence } from "./signal-evidence";
import type { SignalContext } from "./signal-context";
import type { BusinessSignal, SignalStatus, SignalType, MergedSignal } from "./signal";
import type { SignalEntityRef } from "./signal-types";
import { nextSignalId } from "./signal-types";
import { emptySignalEvidence, buildSignalEvidence, buildSignalEvidenceItem } from "./signal-evidence";
import { buildSignalContext } from "./signal-context";

// -- Signal Builder ---------------------------------------------------------

/** Options for building a business signal. */
export interface BuildSignalOptions {
  organizationId: string;
  entityId: string;
  entityType: string;
  category: SignalCategory;
  type: SignalType;
  title: string;
  description: string;
  severity?: SignalSeverity;
  priority?: SignalPriority;
  status?: SignalStatus;
  source?: SignalSource;
  confidence?: number;
  evidence?: SignalEvidence;
  context?: SignalContext;
  deduplicationKey?: string;
  parentSignalId?: string | null;
  childSignalIds?: string[];
  expiresAt?: string | null;
  metadata?: Record<string, unknown>;
}

/**
 * Build a BusinessSignal from options.
 *
 * This is the primary entry point for creating signals.
 * All domain-specific builders should delegate to this function.
 */
export function buildSignal(opts: BuildSignalOptions): BusinessSignal {
  const now = new Date().toISOString();
  const signalId = nextSignalId("sig");

  // Default deduplication key: org + entity + category + type + title
  const deduplicationKey = opts.deduplicationKey
    ?? `${opts.organizationId}:${opts.entityId}:${opts.category}:${opts.type}:${opts.title}`;

  // Default context from basic signal info
  const context = opts.context ?? buildSignalContext({
    what: opts.description,
    primaryEntity: {
      entityId: opts.entityId,
      entityType: opts.entityType as SignalEntityRef["entityType"],
      label: opts.entityId,
    },
  });

  return {
    signalId,
    organizationId: opts.organizationId,
    entityId: opts.entityId,
    entityType: opts.entityType,
    category: opts.category,
    type: opts.type,
    title: opts.title,
    description: opts.description,
    severity: opts.severity ?? "info",
    priority: opts.priority ?? "normal",
    status: opts.status ?? "new",
    source: opts.source ?? "system",
    confidence: opts.confidence ?? 100,
    evidence: opts.evidence ?? emptySignalEvidence(),
    context,
    deduplicationKey,
    parentSignalId: opts.parentSignalId ?? null,
    childSignalIds: opts.childSignalIds ?? [],
    createdAt: now,
    updatedAt: now,
    expiresAt: opts.expiresAt ?? null,
    metadata: opts.metadata ?? {},
  };
}

// -- Quick Builders (common patterns) ----------------------------------------

/** Build a threshold breach signal. */
export function buildThresholdBreachSignal(opts: {
  organizationId: string;
  entityId: string;
  entityType: string;
  category: SignalCategory;
  metric: string;
  currentValue: number;
  threshold: number;
  severity?: SignalSeverity;
  priority?: SignalPriority;
  source?: SignalSource;
}): BusinessSignal {
  return buildSignal({
    organizationId: opts.organizationId,
    entityId: opts.entityId,
    entityType: opts.entityType,
    category: opts.category,
    type: "threshold_breach",
    title: `${opts.metric} excede umbral`,
    description: `${opts.metric} = ${opts.currentValue} (umbral: ${opts.threshold})`,
    severity: opts.severity ?? "medium",
    priority: opts.priority ?? "normal",
    source: opts.source ?? "computed",
    evidence: buildSignalEvidence({
      items: [
        buildSignalEvidenceItem({
          type: "entity_metric",
          description: `${opts.metric} = ${opts.currentValue}, threshold = ${opts.threshold}`,
          referenceId: opts.entityId,
        }),
      ],
      metricKeys: [opts.metric],
    }),
    context: buildSignalContext({
      what: `${opts.metric} ha excedido el umbral configurado`,
      primaryEntity: {
        entityId: opts.entityId,
        entityType: opts.entityType as SignalEntityRef["entityType"],
        label: opts.entityId,
      },
      metrics: [{
        key: opts.metric,
        value: opts.currentValue,
        unit: "",
        threshold: opts.threshold,
      }],
    }),
  });
}

/** Build an absence detected signal (e.g. stock = 0, no sales, no activity). */
export function buildAbsenceSignal(opts: {
  organizationId: string;
  entityId: string;
  entityType: string;
  category: SignalCategory;
  what: string;
  severity?: SignalSeverity;
  priority?: SignalPriority;
  source?: SignalSource;
}): BusinessSignal {
  return buildSignal({
    organizationId: opts.organizationId,
    entityId: opts.entityId,
    entityType: opts.entityType,
    category: opts.category,
    type: "absence_detected",
    title: opts.what,
    description: opts.what,
    severity: opts.severity ?? "medium",
    priority: opts.priority ?? "normal",
    source: opts.source ?? "computed",
  });
}

/** Build a state change signal. */
export function buildStateChangeSignal(opts: {
  organizationId: string;
  entityId: string;
  entityType: string;
  category: SignalCategory;
  fromState: string;
  toState: string;
  severity?: SignalSeverity;
  source?: SignalSource;
}): BusinessSignal {
  return buildSignal({
    organizationId: opts.organizationId,
    entityId: opts.entityId,
    entityType: opts.entityType,
    category: opts.category,
    type: "state_change",
    title: `Estado: ${opts.fromState} → ${opts.toState}`,
    description: `Entidad ${opts.entityId} cambio de ${opts.fromState} a ${opts.toState}`,
    severity: opts.severity ?? "info",
    source: opts.source ?? "system",
    evidence: buildSignalEvidence({
      items: [
        buildSignalEvidenceItem({
          type: "entity_state",
          description: `${opts.fromState} → ${opts.toState}`,
          referenceId: opts.entityId,
        }),
      ],
    }),
  });
}

/** Build a deadline signal (approaching or exceeded). */
export function buildDeadlineSignal(opts: {
  organizationId: string;
  entityId: string;
  entityType: string;
  category: SignalCategory;
  deadline: string;
  daysRemaining: number;
  severity?: SignalSeverity;
  priority?: SignalPriority;
  source?: SignalSource;
}): BusinessSignal {
  const exceeded = opts.daysRemaining < 0;
  return buildSignal({
    organizationId: opts.organizationId,
    entityId: opts.entityId,
    entityType: opts.entityType,
    category: opts.category,
    type: exceeded ? "deadline_exceeded" : "deadline_approaching",
    title: exceeded
      ? `Plazo excedido hace ${Math.abs(opts.daysRemaining)} dias`
      : `Plazo en ${opts.daysRemaining} dias`,
    description: `Fecha limite: ${opts.deadline}. ${exceeded ? "Excedido" : "Proximo"}.`,
    severity: opts.severity ?? (exceeded ? "high" : "medium"),
    priority: opts.priority ?? (exceeded ? "high" : "normal"),
    source: opts.source ?? "computed",
    metadata: { deadline: opts.deadline, daysRemaining: opts.daysRemaining },
  });
}

// -- Merge Builder -----------------------------------------------------------

/** Merge multiple equivalent signals into a MergedSignal. */
export function mergeSignals(signals: BusinessSignal[]): MergedSignal | null {
  if (signals.length === 0) return null;
  if (signals.length === 1) {
    return {
      ...signals[0],
      mergedFromIds: [signals[0].signalId],
      mergedCount: 1,
    };
  }

  // Use highest severity and priority
  const severityOrder: Record<string, number> = { unknown: 0, info: 1, low: 2, medium: 3, high: 4, critical: 5 };
  const priorityOrder: Record<string, number> = { lowest: 1, low: 2, normal: 3, high: 4, highest: 5 };

  const sorted = [...signals].sort(
    (a, b) => (severityOrder[b.severity] ?? 0) - (severityOrder[a.severity] ?? 0),
  );
  const base = sorted[0];

  const highestPriority = signals.reduce(
    (best, s) => (priorityOrder[s.priority] ?? 0) > (priorityOrder[best] ?? 0) ? s.priority : best,
    base.priority,
  );

  // Combine evidence
  const combinedObservationIds = [...new Set(signals.flatMap(s => s.evidence.observationIds))];
  const combinedEntities = deduplicateEntities(signals.flatMap(s => s.evidence.entities));
  const combinedRelationIds = [...new Set(signals.flatMap(s => s.evidence.relationIds))];
  const combinedMetricKeys = [...new Set(signals.flatMap(s => s.evidence.metricKeys))];
  const combinedItems = signals.flatMap(s => s.evidence.items);

  // Combine related entities in context
  const combinedRelated = deduplicateEntities(signals.flatMap(s => s.context.relatedEntities));
  const combinedMissing = [...new Set(signals.flatMap(s => s.context.missingInformation))];

  return {
    ...base,
    signalId: nextSignalId("merged"),
    severity: base.severity,
    priority: highestPriority,
    confidence: Math.round(signals.reduce((sum, s) => sum + s.confidence, 0) / signals.length),
    evidence: buildSignalEvidence({
      items: combinedItems,
      observationIds: combinedObservationIds,
      entities: combinedEntities,
      relationIds: combinedRelationIds,
      metricKeys: combinedMetricKeys,
    }),
    context: {
      ...base.context,
      relatedEntities: combinedRelated,
      missingInformation: combinedMissing,
    },
    mergedFromIds: signals.map(s => s.signalId),
    mergedCount: signals.length,
    updatedAt: new Date().toISOString(),
  };
}

// -- Helpers -----------------------------------------------------------------

function deduplicateEntities(entities: SignalEntityRef[]): SignalEntityRef[] {
  const seen = new Set<string>();
  return entities.filter(e => {
    const key = `${e.entityType}:${e.entityId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
